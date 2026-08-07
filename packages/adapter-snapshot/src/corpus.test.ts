/**
 * Round-trip test: a snapshot written by `python/snippets/export.py` in a real interpreter, read
 * back by this adapter.
 *
 * The snippet and this adapter are two implementations of `docs/schema.md` in two languages, and
 * neither can be verified alone — the Python tests prove the walker is self-consistent, and the
 * unit tests here prove the reader handles what the schema describes. Only this file proves the
 * two agree about the same bytes. If either drifts, this fails in the repository rather than in
 * someone's browser.
 *
 * See `python/fixtures/generate_snapshot_corpus.py` for what the object contains and why.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  childrenOf,
  hasErrors,
  isAddressable,
  resolveRef,
  type MapNode,
  type Node,
  type ObjectGraph,
  type OpaqueNode,
  type ScalarNode,
  type SequenceNode,
  type SetNode,
} from '@objectlens/core';
import { snapshotAdapter } from './adapter.js';

const corpusPath = fileURLToPath(
  new URL('../../../docs/fixtures/snapshot-corpus.json', import.meta.url),
);
const text = readFileSync(corpusPath, 'utf8');

const result = snapshotAdapter.parse({ text, filename: 'snapshot-corpus.json' }, {}) as {
  graph: ObjectGraph | null;
  diagnostics: readonly { severity: string; message: string }[];
};

function graph(): ObjectGraph {
  if (result.graph === null) throw new Error('the corpus snapshot failed to load');
  return result.graph;
}

function at(id: string): Node {
  const node = graph().nodesById.get(id);
  if (node === undefined) throw new Error(`no node ${id} in the snapshot`);
  return node;
}

/**
 * Ids the file declares that a view can reach.
 *
 * Mirrors `childrenOf`'s one asymmetry: a dict key that renders inline — a scalar or an opaque —
 * becomes the label on its value's row rather than a row of its own, so it is deliberately not
 * indexed. Every other position is.
 */
function reachableIds(): string[] {
  const ids: string[] = [];

  const visit = (node: Record<string, unknown>): void => {
    ids.push(node['id'] as string);

    for (const entry of (node['entries'] as Record<string, unknown>[] | undefined) ?? []) {
      const key = entry['key'] as Record<string, unknown>;
      if (key['kind'] !== 'scalar' && key['kind'] !== 'opaque') visit(key);
      visit(entry['value'] as Record<string, unknown>);
    }
    for (const item of (node['items'] as Record<string, unknown>[] | undefined) ?? []) visit(item);
    for (const field of (node['fields'] as Record<string, unknown>[] | undefined) ?? []) {
      visit(field['value'] as Record<string, unknown>);
    }
    for (const arg of (node['args'] as Record<string, unknown>[] | undefined) ?? []) visit(arg);
  };

  visit((JSON.parse(text) as { root: Record<string, unknown> }).root);
  return ids;
}

describe('the fixture itself', () => {
  it('was written by the snippet, not by hand', () => {
    const parsed = JSON.parse(text) as Record<string, unknown>;

    expect(parsed['generator']).toMatch(/^objectlens-snippet\//);
    expect(parsed['pythonVersion']).toMatch(/^3\.\d+/);
  });

  it('is recognised without a filename to help', () => {
    // Drag-and-drop gives a filename; paste does not. The `$schema` marker has to carry it.
    expect(snapshotAdapter.sniff({ text })).toBe(1);
  });
});

describe('loading it', () => {
  it('produces a graph with no errors', () => {
    expect(result.graph).not.toBeNull();
    expect(hasErrors(result.diagnostics as never)).toBe(false);
  });

  it('keeps every node the snippet wrote', () => {
    // The strong form of the round trip: not "roughly the right size", but that the exact set of
    // ids in the file is the exact set of ids in the graph. A silently dropped node is the
    // failure mode this whole fixture exists to catch.
    expect([...graph().nodesById.keys()].sort()).toEqual(reachableIds().sort());
  });

  it('reports the producer as the source rather than itself', () => {
    // The reader is a transport. Saying `objectlens-snapshot` here would lose the fact that a
    // live Python process produced this, which is what makes its `ref` edges trustworthy.
    expect(graph().source).toBe('python-live');
    expect(at('$').source).toBe('python-live');
  });
});

describe('identity, which is the whole point of the snippet', () => {
  it('reads a shared object back as a reference to the one node it lives on', () => {
    const second = at(`$['identity']['shared_twice'][1]`);

    expect(second.kind).toBe('ref');
    if (second.kind !== 'ref') return;

    expect(second.cycle).toBe(false);
    expect(second.target).toBe(`$['identity']['shared_twice'][0]`);
    expect(resolveRef(graph(), second)?.kind).toBe('map');
  });

  it('reads a back-edge into an ancestor as a cycle', () => {
    const self = at(`$['identity']['cyclic']['self']`);

    expect(self.kind).toBe('ref');
    if (self.kind !== 'ref') return;

    expect(self.cycle).toBe(true);
    expect(self.target).toBe(`$['identity']['cyclic']`);
  });

  it('leaves no reference pointing at a node that is not here', () => {
    for (const node of graph().nodesById.values()) {
      if (node.kind === 'ref') expect(graph().nodesById.has(node.target)).toBe(true);
    }
  });
});

describe('scalars whose JSON form is lossy or impossible', () => {
  const scalar = (id: string) => at(id) as ScalarNode;

  it('keeps a bignum exact in raw, where value has already lost it', () => {
    const node = scalar(`$['numbers']['bignum']`);

    expect(node.raw).toBe('1208925819614629174706176');
    // The proof that `raw` is not redundant: JSON.parse has already rounded `value`.
    expect(String(node.value)).not.toBe(node.raw);
  });

  it('carries infinity and nan in raw, since JSON cannot write them', () => {
    for (const [name, raw] of [
      ['infinity', 'inf'],
      ['negative_infinity', '-inf'],
      ['not_a_number', 'nan'],
    ]) {
      const node = scalar(`$['numbers'][${JSON.stringify(name)}]`.replace(/"/g, "'"));
      expect(node.value).toBeNull();
      expect(node.raw).toBe(raw);
    }
  });

  it('keeps negative zero and a trailing-zero decimal distinguishable', () => {
    expect(scalar(`$['numbers']['negative_zero']`).raw).toBe('-0.0');
    expect(scalar(`$['numbers']['trailing_zero']`).raw).toBe('1.5');
  });

  it('keeps bytes that are not valid text', () => {
    const node = scalar(`$['text']['raw_bytes']`);

    expect(node.scalarType).toBe('bytes');
    expect(node.raw).toContain('\\xff');
  });

  it('keeps non-ASCII text intact', () => {
    expect(scalar(`$['text']['unicode']`).value).toBe('café 🐍');
  });

  it('does not confuse emptiness with absence', () => {
    expect(scalar(`$['absences']['nothing']`).scalarType).toBe('null');
    expect(scalar(`$['absences']['flag']`).value).toBe(false);
    expect(scalar(`$['absences']['zero']`).value).toBe(0);
    expect((at(`$['absences']['empty_list']`) as SequenceNode).items).toHaveLength(0);
  });
});

describe('container kinds', () => {
  it('maps each Python container onto the kind views switch on', () => {
    const kinds = Object.fromEntries(
      childrenOf(at(`$['containers']`)).map((child) => [child.label, child.node.kind]),
    );

    expect(kinds).toEqual({
      sequence: 'sequence',
      tuple: 'sequence',
      deque: 'sequence',
      set: 'set',
      frozenset: 'set',
      counter: 'map',
    });
  });

  it('keeps the source language type name alongside the kind', () => {
    // `kind` makes a tuple renderable; `typeName` is how the reader knows it was not a list.
    expect(at(`$['containers']['tuple']`).typeName).toBe('tuple');
    expect(at(`$['containers']['frozenset']`).typeName).toBe('frozenset');
    expect(at(`$['containers']['counter']`).typeName).toBe('Counter');
  });

  it('marks set members as unaddressable, because there is no subscript for them', () => {
    const members = (at(`$['containers']['set']`) as SetNode).items;

    expect(members.length).toBeGreaterThan(0);
    expect(members.every((item) => !isAddressable(item.id))).toBe(true);
  });
});

describe('windowing', () => {
  it('reports the true size while carrying only the exported children', () => {
    const windowed = at(`$['windowed']`) as SequenceNode;

    expect(windowed.items).toHaveLength(8);
    expect(windowed.totalCount).toBe(12);
  });

  it('says so on the graph rather than quietly showing a short list', () => {
    expect(graph().truncated).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('only the first 8'))).toBe(true);
  });
});

describe('keys', () => {
  it('uses the Python literal for a key that has one', () => {
    expect(graph().nodesById.has(`$['keys']['int_key'][1]`)).toBe(true);
  });

  it('leaves the value behind a structural key unaddressable', () => {
    // `{(1, 2): 'x'}` has no subscript expression, so offering "copy path" here would be a lie.
    const entries = (at(`$['keys']['tuple_key']`) as MapNode).entries;

    expect(entries[0]?.key.id).toBe(`$['keys']['tuple_key']@key0`);
    expect(entries[0]?.value.id).toBe(`$['keys']['tuple_key']@value0`);
    expect(isAddressable(entries[0]?.value.id ?? '')).toBe(false);
  });
});

describe('objects', () => {
  it('reads a dataclass as fields addressable by attribute', () => {
    const node = at(`$['objects']['dataclass']`);

    expect(node.kind).toBe('object');
    expect(node.typeName).toBe('User');
    expect(graph().nodesById.has(`$['objects']['dataclass'].name`)).toBe(true);
  });

  it('carries the note that a property was deliberately not evaluated', () => {
    // The snippet refuses to run getters. Without this the reader would just find `display`
    // missing and conclude the object does not have one.
    expect(at(`$['objects']['dataclass']`).meta).toEqual({ skippedProperties: ['display'] });
    expect(result.diagnostics.some((d) => d.message.includes('never calls them'))).toBe(true);
  });

  it('keeps a namedtuple as named fields rather than positions', () => {
    expect(childrenOf(at(`$['objects']['namedtuple']`)).map((c) => c.label)).toEqual(['x', 'y']);
  });

  it('renders types whose own repr is the canonical view as opaque', () => {
    const texts = Object.fromEntries(
      childrenOf(at(`$['objects']`))
        .filter((child) => child.node.kind === 'opaque')
        .map((child) => [child.label, (child.node as OpaqueNode).text]),
    );

    expect(texts['decimal']).toBe("Decimal('1.50')");
    expect(texts['uuid']).toBe("UUID('00000000-0000-0000-0000-000000000001')");
    expect(texts['when']).toBe('datetime.datetime(2024, 1, 2, 3, 4, 5)');
    expect(texts['colour']).toBe('<Color.RED: 1>');
  });

  it('extracts the address from a default repr', () => {
    const plain = at(`$['objects']['plain_instance']`) as OpaqueNode;

    expect(plain.text).toMatch(/^<.*Plain object at 0x[0-9a-f]+>$/);
    expect(plain.address).toMatch(/^0x[0-9a-f]+$/);
  });
});
