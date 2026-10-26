import { describe, expect, it } from 'vitest';
import { buildGraph, type ObjectGraph, type ParseResult } from '@objectlens/core';
import { TEST_SOURCE, deepChain, field, obj, opaque, ref, scalar, seq, set, str } from '@objectlens/core/testing';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
import { yamlAdapter } from '@objectlens/adapter-yaml';
import { diffGraphs } from './diff.js';
import type { DiffNode, DiffResult } from './types.js';

const parsed = (result: ParseResult | Promise<ParseResult>): ObjectGraph => {
  const graph = (result as ParseResult).graph;
  if (graph === null) throw new Error('fixture failed to parse');
  return graph;
};

const json = (text: string) => parsed(jsonAdapter.parse({ text }, {}));
const yaml = (text: string) => parsed(yamlAdapter.parse({ text }, {}));
const python = (text: string) => parsed(pythonAdapter.parse({ text }, {}));

const diffJson = (left: string, right: string, arrayKey?: string): DiffResult =>
  diffGraphs(json(left), json(right), arrayKey === undefined ? {} : { arrayKey });

/** Finds a node by its label path, e.g. `at(result, 'users', '0', 'name')`. */
function at(result: DiffResult, ...labels: string[]): DiffNode {
  let node = result.root;
  for (const label of labels) {
    const next = node.children.find((child) => child.label === label);
    if (next === undefined) throw new Error(`no child "${label}" under ${node.id}`);
    node = next;
  }
  return node;
}

describe('equal inputs', () => {
  it('reports nothing for identical documents', () => {
    const result = diffJson('{"a": 1, "b": [true, null]}', '{"a": 1, "b": [true, null]}');
    expect(result.root.status).toBe('same');
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(result.truncated).toBe(false);
  });

  it('ignores key order in maps', () => {
    expect(diffJson('{"a": 1, "b": 2}', '{"b": 2, "a": 1}').root.status).toBe('same');
  });

  it('compares across formats, since both sides are the same IR', () => {
    const left = json('{"name": "ada", "tags": ["x", "y"], "n": 3, "ok": true, "none": null}');
    const right = yaml('name: ada\ntags: [x, y]\nn: 3\nok: true\nnone: null\n');
    expect(diffGraphs(left, right).root.status).toBe('same');
  });

  it("treats Python's True and JSON's true as the same boolean", () => {
    expect(diffGraphs(python("{'ok': True}"), json('{"ok": true}')).root.status).toBe('same');
  });
});

describe('maps', () => {
  it('finds added, removed and changed keys', () => {
    const result = diffJson('{"a": 1, "b": 2, "c": 3}', '{"a": 1, "b": 20, "d": 4}');

    expect(result.root.status).toBe('modified');
    expect(at(result, 'a').status).toBe('same');
    expect(at(result, 'b').status).toBe('changed');
    expect(at(result, 'c').status).toBe('removed');
    expect(at(result, 'd').status).toBe('added');
    expect(result.counts).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it('keeps both sides of a changed value', () => {
    const changed = at(diffJson('{"a": 1}', '{"a": 2}'), 'a');
    expect(changed.left).toMatchObject({ kind: 'scalar', value: 1 });
    expect(changed.right).toMatchObject({ kind: 'scalar', value: 2 });
  });

  it('places an inserted key where it was inserted', () => {
    const result = diffJson('{"a": 1, "c": 3}', '{"a": 1, "b": 2, "c": 3}');
    expect(result.root.children.map((child) => child.label)).toEqual(['a', 'b', 'c']);
  });

  it('places keys inserted before the first match at the start', () => {
    const result = diffJson('{"b": 1}', '{"a": 0, "b": 1}');
    expect(result.root.children.map((child) => child.label)).toEqual(['a', 'b']);
  });

  it('uses quoted access paths as ids', () => {
    expect(at(diffJson('{"a b": {"c": 1}}', '{"a b": {"c": 2}}'), 'a b', 'c').id).toBe('$["a b"]["c"]');
  });

  it('counts an added subtree once but still lets it be explored', () => {
    const result = diffJson('{}', '{"user": {"name": "ada", "age": 3}}');
    const user = at(result, 'user');

    expect(user.status).toBe('added');
    expect(user.children.map((child) => [child.label, child.status])).toEqual([
      ['name', 'added'],
      ['age', 'added'],
    ]);
    expect(result.counts).toEqual({ added: 1, removed: 0, changed: 0 });
  });

  it('lets a removed subtree be explored too', () => {
    const removed = at(diffJson('{"xs": [1, 2]}', '{}'), 'xs');
    expect(removed.status).toBe('removed');
    expect(removed.children.every((child) => child.status === 'removed' && child.right === undefined)).toBe(true);
  });

  it('matches structural keys by content', () => {
    const left = python("{(1, 2): 'a', (3, 4): 'b'}");
    const right = python("{(3, 4): 'b', (1, 2): 'z'}");
    const result = diffGraphs(left, right);

    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(result.root.children.map((child) => child.id)).toEqual(['$@entry0', '$@entry1']);
  });
});

describe('scalars', () => {
  it('flags a change of type as such, not merely a new value', () => {
    const result = diffJson('{"n": 1}', '{"n": "1"}');
    expect(at(result, 'n')).toMatchObject({ status: 'changed', typeChanged: true });
  });

  it('treats an int and a float of the same value as a type change', () => {
    expect(at(diffJson('{"n": 1}', '{"n": 1.0}'), 'n')).toMatchObject({ status: 'changed', typeChanged: true });
  });

  it('compares floats by value rather than spelling', () => {
    expect(diffJson('{"n": 1.50}', '{"n": 1.5}').root.status).toBe('same');
  });

  it('compares bignums exactly, beyond double precision', () => {
    const result = diffJson('{"n": 9007199254740993}', '{"n": 9007199254740992}');
    expect(at(result, 'n').status).toBe('changed');
  });

  it("matches YAML's .inf with Python's inf", () => {
    expect(diffGraphs(python("{'x': inf}"), yaml('x: .inf')).root.status).toBe('same');
  });

  it('treats two NaNs as equal, as a reader would', () => {
    expect(diffGraphs(python("{'x': nan}"), yaml('x: .nan')).root.status).toBe('same');
  });

  it('distinguishes -0.0 from 0.0', () => {
    expect(at(diffJson('{"n": -0.0}', '{"n": 0.0}'), 'n').status).toBe('changed');
  });

  it('compares a non-literal int by its spelling', () => {
    const left = buildGraph(scalar('$', 'int', 0, '0x10'), TEST_SOURCE);
    const right = buildGraph(scalar('$', 'int', 0, '0x10'), TEST_SOURCE);
    expect(diffGraphs(left, right).root.status).toBe('same');
  });
});

describe('the kind of a position', () => {
  it('reports a container replaced by a scalar as one change', () => {
    const result = diffJson('{"a": [1, 2]}', '{"a": 3}');
    expect(at(result, 'a')).toMatchObject({ status: 'changed', typeChanged: true, children: [] });
    expect(result.counts.changed).toBe(1);
  });

  it('reports a renamed type but still diffs inside it', () => {
    const left = buildGraph(obj('$', 'User', [field('id', str('$.id', 'a'))]), TEST_SOURCE);
    const right = buildGraph(obj('$', 'Admin', [field('id', str('$.id', 'b'))]), TEST_SOURCE);
    const result = diffGraphs(left, right);

    expect(result.root).toMatchObject({ status: 'changed', typeChanged: true });
    expect(at(result, 'id').status).toBe('changed');
    expect(result.counts.changed).toBe(2);
  });

  it('matches positional constructor args by index', () => {
    const result = diffGraphs(python("Decimal('1.5')"), python("Decimal('2.5')"));
    expect(at(result, '0')).toMatchObject({ status: 'changed', relation: 'arg' });
  });
});

describe('sequences', () => {
  it('matches by index by default', () => {
    const result = diffJson('[1, 2, 3]', '[1, 3]');
    expect(result.root.children.map((child) => child.status)).toEqual(['same', 'changed', 'removed']);
  });

  it('matches records by identity key, so a reorder is not a change', () => {
    const left = '[{"id": 1, "n": "a"}, {"id": 2, "n": "b"}]';
    const right = '[{"id": 2, "n": "b"}, {"id": 1, "n": "a"}]';

    expect(diffJson(left, right).root.status).toBe('modified');
    const keyed = diffJson(left, right, 'id');
    expect(keyed.root.status).toBe('same');
    expect(keyed.root.children.map((child) => child.label)).toEqual(['id=1', 'id=2']);
  });

  it('records when a keyed record moved', () => {
    const result = diffJson('[{"id": 1}, {"id": 2}]', '[{"id": 2}, {"id": 1}]', 'id');
    expect(at(result, 'id=1').moved).toEqual({ from: 0, to: 1 });
  });

  it('finds added, removed and changed records by key', () => {
    const result = diffJson(
      '[{"id": 1, "n": "a"}, {"id": 2, "n": "b"}]',
      '[{"id": 2, "n": "B"}, {"id": 3, "n": "c"}]',
      'id',
    );
    expect(at(result, 'id=1').status).toBe('removed');
    expect(at(result, 'id=2', 'n').status).toBe('changed');
    expect(at(result, 'id=3').status).toBe('added');
  });

  it('marks keyed ids as structural rather than addressable', () => {
    expect(at(diffJson('[{"id": 1}]', '[{"id": 1}]', 'id'), 'id=1').id).toBe('$@where(id=1)');
  });

  it('falls back to position, with a note, when the key is not unique', () => {
    const result = diffJson('[{"id": 1}, {"id": 1}]', '[{"id": 1}, {"id": 1}]', 'id');
    expect(result.root.children.map((child) => child.label)).toEqual(['0', '1']);
    expect(result.notes).toEqual(['$: Matched by position: not every item has a unique "id".']);
  });

  it('says nothing about arrays that were never candidates for the key', () => {
    const result = diffJson('{"xs": [1, 2]}', '{"xs": [2, 1]}', 'id');
    expect(result.notes).toEqual([]);
  });

  it('matches records that are objects, not only maps', () => {
    const left = python("[User(id=1, n='a'), User(id=2, n='b')]");
    const right = python("[User(id=2, n='b'), User(id=1, n='a')]");
    expect(diffGraphs(left, right, { arrayKey: 'id' }).root.status).toBe('same');
  });

  it('ignores a blank array key', () => {
    expect(diffJson('[{"id": 1}]', '[{"id": 1}]', '  ').root.children[0]?.label).toBe('0');
  });
});

describe('sets', () => {
  it('ignores member order', () => {
    expect(diffGraphs(python('{1, 2, 3}'), python('{3, 1, 2}')).root.status).toBe('same');
  });

  it('finds added and removed members', () => {
    const result = diffGraphs(python('{1, 2}'), python('{2, 3}'));
    expect(result.counts).toEqual({ added: 1, removed: 1, changed: 0 });
    expect(new Set(result.root.children.map((child) => child.id)).size).toBe(3);
  });

  it('pairs structurally equal members regardless of their own ordering', () => {
    const left = buildGraph(set('$', [set('$@item0', [str('a', 'x'), str('b', 'y')])]), TEST_SOURCE);
    const right = buildGraph(set('$', [set('$@item0', [str('a', 'x'), str('b', 'y')])]), TEST_SOURCE);
    expect(diffGraphs(left, right).root.status).toBe('same');
  });

  it('keeps duplicate members distinct', () => {
    const left = buildGraph(set('$', [str('a', 'x'), str('b', 'x')]), TEST_SOURCE);
    const right = buildGraph(set('$', [str('a', 'x')]), TEST_SOURCE);
    expect(diffGraphs(left, right).counts.removed).toBe(1);
  });
});

describe('opaque values and refs', () => {
  it('ignores memory addresses, which differ on every run', () => {
    const left = buildGraph(opaque('$', '<Foo object at 0x1>', '0x1'), TEST_SOURCE);
    const right = buildGraph(opaque('$', '<Foo object at 0x2>', '0x2'), TEST_SOURCE);
    expect(diffGraphs(left, right).root.status).toBe('same');
  });

  it('detects a different opaque value', () => {
    const left = buildGraph(opaque('$', '<Foo>'), TEST_SOURCE);
    const right = buildGraph(opaque('$', '<Bar>'), TEST_SOURCE);
    expect(diffGraphs(left, right).root.status).toBe('changed');
  });

  it('compares refs by where they point, so cycles terminate', () => {
    const cyclic = () => buildGraph(seq('$', [str('$[0]', 'a'), ref('$[1]', '$', true)]), TEST_SOURCE);
    expect(diffGraphs(cyclic(), cyclic()).root.status).toBe('same');
  });

  it('detects a ref that now points somewhere else', () => {
    const left = buildGraph(
      seq('$', [seq('$[0]', []), seq('$[1]', []), ref('$[2]', '$[0]')]),
      TEST_SOURCE,
    );
    const right = buildGraph(
      seq('$', [seq('$[0]', []), seq('$[1]', []), ref('$[2]', '$[1]')]),
      TEST_SOURCE,
    );
    expect(at(diffGraphs(left, right), '2').status).toBe('changed');
  });

  it('handles a dangling ref without throwing', () => {
    const graph = () => buildGraph(seq('$', [ref('$[0]', '$missing')]), TEST_SOURCE);
    expect(diffGraphs(graph(), graph()).root.status).toBe('same');
  });
});

describe('limits', () => {
  it('compares deep inputs without overflowing the stack', () => {
    const depth = 20_000;
    const left = buildGraph(deepChain(depth), TEST_SOURCE);
    const right = buildGraph(deepChain(depth), TEST_SOURCE);
    expect(diffGraphs(left, right).root.status).toBe('same');
  });

  it('stops at maxNodes and says so, settling the rest by content', () => {
    const left = json('{"a": [1, 2, 3], "b": [1, 2, 3]}');
    const right = json('{"a": [1, 2, 3], "b": [1, 2, 4]}');
    const result = diffGraphs(left, right, { maxNodes: 2 });

    expect(result.truncated).toBe(true);
    expect(at(result, 'b')).toMatchObject({ status: 'changed', children: [] });
  });

  it('stops descending into one-sided subtrees at maxNodes', () => {
    const result = diffGraphs(json('{}'), json('{"a": [1, 2, 3]}'), { maxNodes: 1 });
    expect(result.truncated).toBe(true);
    expect(at(result, 'a').children).toEqual([]);
  });
});
