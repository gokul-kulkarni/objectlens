import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  childrenOf,
  hasErrors,
  isAddressable,
  resolveRef,
  type MapNode,
  type Node,
  type ObjectNode,
  type ScalarNode,
  type SequenceNode,
  type SetNode,
} from '@objectlens/core';
import { MAX_YAML_NODES, YAML_SOURCE_ID, parseYaml } from './convert.js';

const rootOf = (text: string) => parseYaml(text).root;
const scalarOf = (text: string) => rootOf(text) as ScalarNode;

function child(node: Node, label: string | number): Node {
  const children = childrenOf(node);
  const found =
    typeof label === 'number' ? children[label] : children.find((c) => c.label === label);
  if (found === undefined) throw new Error(`no child ${String(label)} of ${node.id}`);
  return found.node;
}

describe('scalars', () => {
  it('reads the core schema types', () => {
    const root = rootOf('s: hi\nn: 1\nf: 1.5\nb: true\nz: null\ne:\nt: ~\n');
    const types = Object.fromEntries(
      childrenOf(root).map((c) => [c.label, (c.node as ScalarNode).scalarType]),
    );

    expect(types).toEqual({
      s: 'string',
      n: 'int',
      f: 'float',
      b: 'bool',
      z: 'null',
      e: 'null',
      t: 'null',
    });
  });

  it('decides int versus float from the source text, not the value', () => {
    // `1.0` is a float that happens to be integral, and JS cannot tell them apart by value.
    expect((child(rootOf('v: 1.0'), 'v') as ScalarNode).scalarType).toBe('float');
    expect((child(rootOf('v: 1'), 'v') as ScalarNode).scalarType).toBe('int');
  });

  it('keeps the written form of a number whose value reads differently', () => {
    // `0x1f` resolves to 31. Showing only 31 loses what the author actually wrote.
    const hex = child(rootOf('v: 0x1f'), 'v') as ScalarNode;

    expect(hex.value).toBe(31);
    expect(hex.raw).toBe('0x1f');
    expect(hex.scalarType).toBe('int');
  });

  it('keeps an integer that JavaScript has already rounded', () => {
    const big = child(rootOf('v: 12345678901234567890'), 'v') as ScalarNode;

    expect(big.raw).toBe('12345678901234567890');
    expect(String(big.value)).not.toBe(big.raw);
  });

  it('moves infinity and nan into raw, where JSON cannot follow', () => {
    for (const [source, raw] of [
      ['.inf', '.inf'],
      ['-.inf', '-.inf'],
      ['.nan', '.nan'],
    ]) {
      const node = child(rootOf(`v: ${source}`), 'v') as ScalarNode;
      expect(node.value).toBeNull();
      expect(node.raw).toBe(raw);
    }
  });

  it('reads !!binary as bytes rather than as a meaningless string', () => {
    const node = child(rootOf('v: !!binary aGk='), 'v') as ScalarNode;

    expect(node.scalarType).toBe('bytes');
    expect(node.raw).toBe('aGk=');
  });

  it('keeps block scalars intact, newlines and all', () => {
    const literal = child(rootOf('v: |\n  a\n  b\n'), 'v') as ScalarNode;
    const folded = child(rootOf('v: >\n  a\n  b\n'), 'v') as ScalarNode;

    expect(literal.value).toBe('a\nb\n');
    expect(folded.value).toBe('a b\n');
  });

  it('does not attach a raw that merely repeats the value', () => {
    // `raw` earns its place only where it differs; a duplicate on every string is noise in the IR.
    expect((child(rootOf('v: hi'), 'v') as ScalarNode).raw).toBeUndefined();
  });
});

describe('collections', () => {
  it('reads a block mapping as a map', () => {
    const root = rootOf('a: 1\nb: 2\n');

    expect(root.kind).toBe('map');
    expect(childrenOf(root).map((c) => c.label)).toEqual(['a', 'b']);
  });

  it('reads a block sequence as a sequence', () => {
    expect(rootOf('- 1\n- 2\n').kind).toBe('sequence');
  });

  it('reads flow style the same as block style', () => {
    // The two are the same data written differently; the IR must not remember which.
    expect(rootOf('a: [1, 2]').kind).toBe(rootOf('a:\n  - 1\n  - 2\n').kind);
    expect(childrenOf(child(rootOf('a: [1, 2]'), 'a'))).toHaveLength(2);
  });

  it('reads !!set as a set, not as a map of things to nothing', () => {
    const root = rootOf('!!set\n? a\n? b\n') as SetNode;

    expect(root.kind).toBe('set');
    expect(root.items).toHaveLength(2);
    expect(root.items.every((item) => !isAddressable(item.id))).toBe(true);
  });

  it('keeps a complex key as its own explorable node', () => {
    // `? [1, 2]` is a legal YAML key. Flattening it to a string would corrupt it.
    const root = rootOf('? [1, 2]\n: value\n') as MapNode;

    expect(root.entries[0]?.key.kind).toBe('sequence');
    expect(root.entries[0]?.key.id).toBe('$@key0');
  });

  it('leaves the value behind a complex key unaddressable', () => {
    const root = rootOf('? [1, 2]\n: value\n') as MapNode;

    expect(root.entries[0]?.value.id).toBe('$@value0');
    expect(isAddressable(root.entries[0]?.value.id ?? '')).toBe(false);
  });
});

describe('tags', () => {
  it('turns a custom tag on a mapping into a typed object', () => {
    // The author writing `!User` is saying this is a typed thing, which is what `object` is for —
    // the same rendering a Python `User(id=1)` gets. See docs/schema.md §2.
    const root = rootOf('!User\nid: 1\nname: ada\n') as ObjectNode;

    expect(root.kind).toBe('object');
    expect(root.typeName).toBe('!User');
    expect(root.fields.map((f) => f.name)).toEqual(['id', 'name']);
    expect(root.fields[1]?.value.id).toBe('$.name');
  });

  it('keeps a tagged mapping with non-string keys as a map', () => {
    // `object` fields are named, so a mapping keyed by anything else cannot become one without
    // inventing names for the keys.
    expect(rootOf('!Thing\n1: one\n').kind).toBe('map');
  });

  it('records a custom tag on a sequence and on a scalar', () => {
    expect(rootOf('!Ids [1, 2]').typeName).toBe('!Ids');
    expect(child(rootOf('v: !Weird hi'), 'v').typeName).toBe('!Weird');
  });

  it('does not report an unresolved custom tag as a problem', () => {
    // The library warns TAG_RESOLVE_FAILED for `!User`, but we do resolve it — into `typeName`.
    // Passing that through would put a warning on perfectly good input.
    expect(parseYaml('!User\nid: 1\n').diagnostics).toEqual([]);
  });
});

describe('anchors and aliases', () => {
  it('reads an alias as a reference to the anchored node', () => {
    // This is why YAML earns a place beside the live Python exporter: unlike any repr() text, it
    // can express that two positions are the same value.
    const root = rootOf('base: &b {x: 1}\nuse: *b\n');
    const use = child(root, 'use');

    expect(use.kind).toBe('ref');
    if (use.kind !== 'ref') return;

    expect(use.target).toBe(child(root, 'base').id);
    expect(use.cycle).toBe(false);
  });

  it('resolves the reference against the graph', () => {
    const graph = buildGraph(rootOf('base: &b {x: 1}\nuse: *b\n'), YAML_SOURCE_ID);
    const use = graph.nodesById.get('$["use"]');

    expect(use).toBeDefined();
    expect(resolveRef(graph, use as Node)?.kind).toBe('map');
  });

  it('reads a self-referential anchor as a cycle', () => {
    // `&a [*a]` is a genuine cycle, and the graph view draws it differently from a plain share.
    const root = rootOf('&a\n- *a\n') as SequenceNode;
    const back = root.items[0];

    expect(back?.kind).toBe('ref');
    expect(back?.kind === 'ref' && back.cycle).toBe(true);
    expect(back?.kind === 'ref' && back.target).toBe('$');
  });

  it('does not mistake a sibling reference for a cycle', () => {
    // The ancestor set has to be popped on the way back up, or every later alias to an earlier
    // anchor reads as a cycle.
    const root = rootOf('first: &b {x: 1}\nsecond: *b\nthird: *b\n');

    for (const label of ['second', 'third']) {
      const node = child(root, label);
      expect(node.kind === 'ref' && node.cycle).toBe(false);
    }
  });

  it('names the anchor on the reference, so the reader can find it in the source', () => {
    expect(child(rootOf('base: &b 1\nuse: *b\n'), 'use').typeName).toBe('*b');
  });

  it('reports an alias with no anchor rather than pointing at nothing', () => {
    const { root, diagnostics } = parseYaml('use: *missing\n');

    expect(child(root, 'use').kind).toBe('opaque');
    expect(hasErrors(diagnostics)).toBe(true);
  });

  it('keeps anchors from leaking between documents', () => {
    // Anchors are document-scoped in YAML. Sharing one table across `---` would invent a
    // reference the file does not contain.
    const { root, diagnostics } = parseYaml('---\nbase: &b 1\n---\nuse: *b\n');

    expect(child(child(root, 1), 'use').kind).toBe('opaque');
    expect(hasErrors(diagnostics)).toBe(true);
  });

  it('reads a merge key as the alias it literally is', () => {
    // With YAML 1.2 semantics `<<` is an ordinary key. Silently merging would hide the structure
    // the author wrote, and an inspector's job is to show what is there.
    const derived = child(rootOf('base: &b {x: 1}\nderived:\n  <<: *b\n  y: 2\n'), 'derived');
    expect(child(derived, '<<').kind).toBe('ref');
  });
});

describe('documents', () => {
  it('unwraps a single document to its own root', () => {
    expect(rootOf('a: 1').kind).toBe('map');
  });

  it('wraps a stream of documents in a sequence that says what it is', () => {
    const root = rootOf('---\na: 1\n---\nb: 2\n') as SequenceNode;

    expect(root.kind).toBe('sequence');
    expect(root.typeName).toBe('documents');
    expect(root.items).toHaveLength(2);
  });

  it('treats an empty document as null rather than as an error', () => {
    const { root, diagnostics } = parseYaml('# just a comment\n');

    expect((root as ScalarNode).scalarType).toBe('null');
    expect(hasErrors(diagnostics)).toBe(false);
  });
});

describe('paths', () => {
  it('builds ids that read as paths into the document', () => {
    const root = rootOf('users:\n  - name: ada\n');
    expect(child(child(child(root, 'users'), 0), 'name').id).toBe('$["users"][0]["name"]');
  });

  it('disambiguates a duplicate key instead of dropping one of them', () => {
    // A duplicate key is invalid YAML but perfectly readable, and an inspector exists to show
    // what is in the file. Colliding ids would silently lose the second one.
    const { root, diagnostics } = parseYaml('a: 1\na: 2\n');
    const ids = childrenOf(root).map((c) => c.node.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(hasErrors(diagnostics)).toBe(true);
  });
});

describe('tolerance', () => {
  it('never throws on arbitrary garbage', () => {
    const inputs = [
      'a: [1, 2\nb: }{\n',
      '\t- tabs are illegal here',
      '*',
      '&',
      '---\n---\n---',
      '!!!',
      'a:\n b:\n\tc: 1',
      '"unterminated',
      ': no key',
      '\u0000\u0001',
    ];

    for (const text of inputs) expect(() => parseYaml(text)).not.toThrow();
  });

  it('salvages the readable half of a broken document', () => {
    // One bad line in a 4,000-line config must not cost the other 3,999.
    const { root, diagnostics } = parseYaml('a: [1, 2\nb: 3\n');

    expect(childrenOf(root).length).toBeGreaterThan(0);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('reports where a problem is, not merely that there is one', () => {
    const { diagnostics } = parseYaml('a: 1\n\tb: 2\n');
    const first = diagnostics[0];

    expect(first?.line).toBeGreaterThan(1);
    expect(first?.column).toBeGreaterThan(0);
    expect(first?.offset).toBeGreaterThan(0);
  });
});

describe('limits', () => {
  it('caps depth rather than recursing without bound', () => {
    const deep = Array.from({ length: 400 }, (_, i) => `${'  '.repeat(i)}a:`).join('\n');
    const { truncated } = parseYaml(deep);

    expect(truncated).toBe(true);
  });

  it('caps total nodes', () => {
    expect(MAX_YAML_NODES).toBeLessThanOrEqual(1_000_000);
  });

  it('handles a wide document without complaint', () => {
    const wide = Array.from({ length: 5_000 }, (_, i) => `k${i}: ${i}`).join('\n');
    const { root, truncated } = parseYaml(wide);

    expect(childrenOf(root)).toHaveLength(5_000);
    expect(truncated).toBe(false);
  });
});
