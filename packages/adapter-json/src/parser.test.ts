import { describe, expect, it } from 'vitest';
import { childrenOf, type MapNode, type Node, type ScalarNode, type SequenceNode } from '@objectlens/core';
import { parseJson } from './parser.js';

const parse = (text: string) => parseJson(text);
const rootOf = (text: string) => parse(text).root;

function scalarAt(node: Node, path: readonly (string | number)[]): ScalarNode {
  let current = node;
  for (const step of path) {
    const children = childrenOf(current);
    const child =
      typeof step === 'number' ? children[step] : children.find((c) => c.label === step);
    if (child === undefined) throw new Error(`no child ${String(step)} of ${current.id}`);
    current = child.node;
  }
  if (current.kind !== 'scalar') throw new Error(`${current.id} is ${current.kind}, not scalar`);
  return current;
}

describe('scalars', () => {
  it('parses strings', () => {
    expect(rootOf('"hello"')).toMatchObject({ kind: 'scalar', scalarType: 'string', value: 'hello' });
  });

  it('parses booleans and null', () => {
    expect(rootOf('true')).toMatchObject({ scalarType: 'bool', value: true });
    expect(rootOf('false')).toMatchObject({ scalarType: 'bool', value: false });
    expect(rootOf('null')).toMatchObject({ scalarType: 'null', value: null });
  });

  it('distinguishes ints from floats', () => {
    expect(rootOf('42')).toMatchObject({ scalarType: 'int', value: 42 });
    expect(rootOf('-7')).toMatchObject({ scalarType: 'int', value: -7 });
    expect(rootOf('4.2')).toMatchObject({ scalarType: 'float', value: 4.2 });
    expect(rootOf('1e3')).toMatchObject({ scalarType: 'float', value: 1000 });
  });

  it('omits raw when the parsed value round-trips exactly', () => {
    expect(rootOf('42')).not.toHaveProperty('raw');
  });

  it('keeps raw for an integer too large for a JS number', () => {
    // 9007199254740993 parses to …992. Without raw the viewer would display a number that is
    // simply not the one in the file. Note the loss is asserted via String(), because writing
    // the literal in this test would round it identically and quietly assert nothing.
    const node = rootOf('9007199254740993') as ScalarNode;

    expect(node.raw).toBe('9007199254740993');
    expect(String(node.value)).toBe('9007199254740992');
  });

  it('keeps raw when the text differs from its parsed rendering', () => {
    expect(rootOf('1.50')).toMatchObject({ raw: '1.50', value: 1.5 });
    expect(rootOf('1e2')).toMatchObject({ raw: '1e2', value: 100 });
  });
});

describe('strings', () => {
  it('decodes simple escapes', () => {
    expect(rootOf(String.raw`"a\nb\tc\\d\"e"`)).toMatchObject({ value: 'a\nb\tc\\d"e' });
  });

  it('decodes unicode escapes', () => {
    expect(rootOf(String.raw`"é"`)).toMatchObject({ value: 'é' });
  });

  it('reports an invalid unicode escape but keeps the rest of the string', () => {
    const { root, diagnostics } = parse(String.raw`"a\uZZZZb"`);

    expect(root.kind).toBe('scalar');
    expect(diagnostics.some((d) => d.message.includes('\\u'))).toBe(true);
  });

  it('reports an unknown escape without discarding the string', () => {
    const { root, diagnostics } = parse(String.raw`"a\qb"`);

    expect((root as ScalarNode).value).toBe('aqb');
    expect(diagnostics.some((d) => d.message.includes('Unknown escape'))).toBe(true);
  });
});

describe('containers', () => {
  it('parses an object into a map with key-labelled children', () => {
    const root = rootOf('{"name": "ada", "age": 36}') as MapNode;

    expect(root.kind).toBe('map');
    expect(root.entries).toHaveLength(2);
    expect(childrenOf(root).map((c) => c.label)).toEqual(['name', 'age']);
  });

  it('gives object values ids that are legal access expressions', () => {
    const root = rootOf('{"users": [{"name": "ada"}]}');
    expect(scalarAt(root, ['users', 0, 'name']).id).toBe('$["users"][0]["name"]');
  });

  it('parses an array into a sequence', () => {
    const root = rootOf('[1, 2, 3]') as SequenceNode;

    expect(root.kind).toBe('sequence');
    expect(root.items.map((i) => (i as ScalarNode).value)).toEqual([1, 2, 3]);
  });

  it('parses empty containers', () => {
    expect((rootOf('{}') as MapNode).entries).toEqual([]);
    expect((rootOf('[]') as SequenceNode).items).toEqual([]);
  });

  it('nests deeply without losing paths', () => {
    const root = rootOf('{"a": {"b": {"c": [0, {"d": "found"}]}}}');
    expect(scalarAt(root, ['a', 'b', 'c', 1, 'd']).value).toBe('found');
  });

  it('parses without diagnostics for well-formed input', () => {
    expect(parse('{"a": [1, {"b": null}], "c": true}').diagnostics).toEqual([]);
  });
});

describe('tolerance', () => {
  it('never throws on arbitrary garbage', () => {
    const inputs = ['', '{', '}', '[', '"', '\\', '{"a"', '{,,,}', '[1,,2]', 'nul', '{"a":}', '@#$%'];
    for (const input of inputs) {
      expect(() => parse(input), `input: ${input}`).not.toThrow();
    }
  });

  it('keeps good entries around a bad one', () => {
    // The whole promise of the adapter contract: one bad token costs its own span, not the file.
    const { root, diagnostics } = parse('{"good": 1, "bad": @@@, "alsoGood": 3}');
    const labels = childrenOf(root).map((c) => c.label);

    expect(labels).toEqual(['good', 'bad', 'alsoGood']);
    expect(scalarAt(root, ['good']).value).toBe(1);
    expect(scalarAt(root, ['alsoGood']).value).toBe(3);
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('represents an unparseable value as an opaque node', () => {
    const root = rootOf('{"bad": @@@}');
    const bad = childrenOf(root).find((c) => c.label === 'bad')?.node;

    expect(bad?.kind).toBe('opaque');
  });

  it('recovers the following members after an unquoted key', () => {
    const { root, diagnostics } = parse('{bare: 1, "after": 2}');

    expect(scalarAt(root, ['after']).value).toBe(2);
    expect(diagnostics.some((d) => d.message.includes('quoted key'))).toBe(true);
  });

  it('reads the value anyway when the colon is missing', () => {
    const { root, diagnostics } = parse('{"a" 1}');

    expect(scalarAt(root, ['a']).value).toBe(1);
    expect(diagnostics.some((d) => d.message.includes('":"'))).toBe(true);
  });

  it('closes an unterminated container and says so', () => {
    const { root, diagnostics } = parse('{"a": [1, 2');

    expect(scalarAt(root, ['a', 0]).value).toBe(1);
    expect(diagnostics.some((d) => d.message.includes('Expected'))).toBe(true);
  });

  it('reports an unterminated string', () => {
    const { diagnostics } = parse('{"a": "unclosed}');
    expect(diagnostics.some((d) => d.message.includes('Unterminated string'))).toBe(true);
  });

  it('accepts a trailing comma with a warning', () => {
    const objectResult = parse('{"a": 1,}');
    const arrayResult = parse('[1, 2,]');

    expect(childrenOf(objectResult.root)).toHaveLength(1);
    expect((arrayResult.root as SequenceNode).items).toHaveLength(2);
    for (const result of [objectResult, arrayResult]) {
      expect(result.diagnostics.some((d) => d.message === 'Trailing comma')).toBe(true);
    }
  });

  it('ignores comments with a single warning, however many there are', () => {
    // Refusing to render a commented tsconfig would be pedantry, but silence would be a lie.
    const { root, diagnostics } = parse(`{
      // first
      "a": 1, /* second */
      "b": 2 // third
    }`);

    expect(childrenOf(root).map((c) => c.label)).toEqual(['a', 'b']);
    expect(diagnostics.filter((d) => d.message.includes('Comments'))).toHaveLength(1);
  });

  it('reports content after the top-level value', () => {
    const { diagnostics } = parse('{"a": 1} trailing');
    expect(diagnostics.some((d) => d.message.includes('after the top-level value'))).toBe(true);
  });

  it('keeps both halves of a duplicate key rather than dropping one', () => {
    const { root, diagnostics } = parse('{"a": 1, "a": 2}');

    expect(childrenOf(root)).toHaveLength(2);
    expect(diagnostics.some((d) => d.message.includes('Duplicate key'))).toBe(true);
  });
});

describe('diagnostics positions', () => {
  it('reports 1-based line and column', () => {
    //          col: 1234567890
    const { diagnostics } = parse('{\n  "a": @\n}');
    const error = diagnostics.find((d) => d.severity === 'error');

    expect(error?.line).toBe(2);
    expect(error?.column).toBe(8);
  });

  it('reports an offset and length for highlighting', () => {
    const { diagnostics } = parse('{"a": @@@}');
    const error = diagnostics.find((d) => d.severity === 'error');

    expect(error?.offset).toBe(6);
    expect(error?.length).toBe(3);
  });
});

describe('depth limit', () => {
  it('truncates rather than overflowing the stack', () => {
    const deep = '['.repeat(5_000) + ']'.repeat(5_000);
    const result = parse(deep);

    expect(result.truncated).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('Nesting deeper'))).toBe(true);
  });

  it('leaves normally-nested input untruncated', () => {
    expect(parse('[[[[[1]]]]]').truncated).toBe(false);
  });
});
