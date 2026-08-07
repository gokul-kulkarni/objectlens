/**
 * Hostile-input tests for the node reader.
 *
 * A snapshot arrives by drag-and-drop from wherever, so every field in `docs/schema.md` is a trust
 * boundary. The rule these all check is §5's: one malformed node costs one node, not the file.
 */

import { describe, expect, it } from 'vitest';
import { childCount, type MapNode, type ObjectNode, type ScalarNode } from '@objectlens/core';
import { MAX_SNAPSHOT_NODES, validateSnapshot } from './validate.js';

const SOURCE = 'python-live';
const read = (root: unknown) => validateSnapshot(root, SOURCE);
const rootOf = (root: unknown) => read(root).root;

const scalar = (id: string, value: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'scalar',
  source: SOURCE,
  scalarType: 'int',
  value,
  ...extra,
});

describe('reading well-formed nodes', () => {
  it('reads each kind into the matching IR node', () => {
    const kinds = [
      { id: '$', kind: 'map', entries: [] },
      { id: '$', kind: 'sequence', items: [] },
      { id: '$', kind: 'set', items: [] },
      { id: '$', kind: 'object', fields: [] },
      { id: '$', kind: 'opaque', text: '<x>' },
    ];

    expect(kinds.map((node) => rootOf(node).kind)).toEqual([
      'map',
      'sequence',
      'set',
      'object',
      'opaque',
    ]);
  });

  it('keeps typeName and meta, which are the adapter-specific escape hatch', () => {
    const node = rootOf({
      id: '$',
      kind: 'object',
      typeName: 'User',
      meta: { skippedProperties: ['total'] },
      fields: [],
    });

    expect(node.typeName).toBe('User');
    expect(node.meta).toEqual({ skippedProperties: ['total'] });
  });

  it('lets a node name its own producer, falling back to the envelope', () => {
    // A snapshot assembled from several sources keeps that distinction per node.
    expect(rootOf({ id: '$', kind: 'opaque', text: 'x', source: 'java-heap' }).source).toBe(
      'java-heap',
    );
    expect(rootOf({ id: '$', kind: 'opaque', text: 'x' }).source).toBe(SOURCE);
  });

  it('reads object fields including their category and lazy flag', () => {
    const node = rootOf({
      id: '$',
      kind: 'object',
      fields: [{ name: 'total', value: scalar('$.total', 1), category: 'property', lazy: true }],
    }) as ObjectNode;

    expect(node.fields[0]).toMatchObject({ name: 'total', category: 'property', lazy: true });
  });

  it('reads positional args, which is how constructor reprs survive', () => {
    const node = rootOf({
      id: '$',
      kind: 'object',
      typeName: 'Decimal',
      fields: [],
      args: [scalar('$@arg0', 1)],
    }) as ObjectNode;

    expect(node.args).toHaveLength(1);
  });

  it('keeps totalCount so a windowed container still reports its true size', () => {
    const node = rootOf({ id: '$', kind: 'sequence', items: [scalar('$[0]', 1)], totalCount: 900 });
    expect(childCount(node)).toBe(900);
  });
});

describe('scalars', () => {
  it('keeps raw, which is authoritative for bignums and inf/nan', () => {
    const node = rootOf(
      scalar('$', null, { scalarType: 'float', raw: 'inf' }),
    ) as ScalarNode;

    expect(node.value).toBeNull();
    expect(node.raw).toBe('inf');
  });

  it('treats null as a value rather than as absence', () => {
    // `null` is exactly how inf and nan arrive. Substituting a default here would erase them.
    expect((rootOf(scalar('$', null, { scalarType: 'null' })) as ScalarNode).value).toBeNull();
  });

  it('falls back to raw when value is a type JSON cannot carry into the IR', () => {
    const node = rootOf(scalar('$', { nested: true }, { raw: '42' })) as ScalarNode;
    expect(node.value).toBe('42');
  });

  it('warns about an unknown scalarType but still shows the value', () => {
    const { root, diagnostics } = read(scalar('$', 1, { scalarType: 'quaternion' }));

    expect((root as ScalarNode).scalarType).toBe('string');
    expect(diagnostics[0]?.message).toContain('quaternion');
  });
});

describe('degrading rather than discarding', () => {
  it('turns an unknown kind into an opaque node plus a warning', () => {
    const { root, diagnostics } = read({ id: '$', kind: 'hypergraph' });

    expect(root.kind).toBe('opaque');
    expect(diagnostics[0]?.message).toContain('Unknown node kind');
  });

  it('survives a node that is not an object at all', () => {
    for (const value of [null, 42, 'text', [1, 2]]) {
      expect(() => read(value)).not.toThrow();
      expect(read(value).root.kind).toBe('opaque');
    }
  });

  it('keeps the siblings of a broken node', () => {
    // The point of tolerance: one bad node in a 4,000-node export costs one node.
    const node = rootOf({
      id: '$',
      kind: 'sequence',
      items: [scalar('$[0]', 1), 'not a node', scalar('$[2]', 3)],
    });

    expect(childCount(node)).toBe(3);
    expect(read({ id: '$', kind: 'sequence', items: [scalar('$[0]', 1), 'x'] }).root.kind).toBe(
      'sequence',
    );
  });

  it('gives a node with no id its structural position instead', () => {
    const { root, diagnostics } = read({ kind: 'sequence', items: [{ kind: 'opaque', text: 'x' }] });

    expect(root.id).toBe('$');
    expect(childCount(root)).toBe(1);
    expect(diagnostics.some((d) => d.message.includes('no id'))).toBe(true);
  });

  it('handles a container whose children are missing entirely', () => {
    const { root, diagnostics } = read({ id: '$', kind: 'map' });

    expect(childCount(root)).toBe(0);
    expect(diagnostics[0]?.message).toContain('`entries`');
  });

  it('handles a map entry that is not an object', () => {
    const node = rootOf({ id: '$', kind: 'map', entries: ['nope'] }) as MapNode;

    expect(node.entries).toHaveLength(1);
    expect(node.entries[0]?.key.kind).toBe('opaque');
  });

  it('drops a reference with no target rather than pointing nowhere', () => {
    const { root, diagnostics } = read({ id: '$', kind: 'ref', cycle: true });

    expect(root.kind).toBe('opaque');
    expect(diagnostics[0]?.message).toContain('no `target`');
  });

  it('stops reporting after a flood, so the first problem is still readable', () => {
    const items = Array.from({ length: 500 }, () => 'not a node');
    const { diagnostics } = read({ id: '$', kind: 'sequence', items });

    expect(diagnostics.length).toBeLessThan(60);
    expect(diagnostics[diagnostics.length - 1]?.message).toContain('not reported');
  });
});

describe('references', () => {
  it('reads target and cycle, which the graph view styles differently', () => {
    const node = rootOf({
      id: '$',
      kind: 'sequence',
      items: [
        { id: '$[0]', kind: 'map', entries: [] },
        { id: '$[1]', kind: 'ref', target: '$[0]', cycle: false },
        { id: '$[2]', kind: 'ref', target: '$', cycle: true },
      ],
    });

    const items = childCount(node);
    expect(items).toBe(3);
  });

  it('warns when a reference points at a node the snapshot never defines', () => {
    // A half-written export. The graph still renders; the reader is told why an edge goes nowhere.
    const { diagnostics } = read({
      id: '$',
      kind: 'sequence',
      items: [{ id: '$[0]', kind: 'ref', target: '$["gone"]', cycle: false }],
    });

    expect(diagnostics.some((d) => d.message.includes('not in this snapshot'))).toBe(true);
  });

  it('says nothing when every reference resolves', () => {
    const { diagnostics } = read({
      id: '$',
      kind: 'sequence',
      items: [
        { id: '$[0]', kind: 'opaque', text: 'x' },
        { id: '$[1]', kind: 'ref', target: '$[0]', cycle: false },
      ],
    });

    expect(diagnostics).toEqual([]);
  });
});

describe('limits', () => {
  it('stops at a depth that cannot overflow the stack, and says so', () => {
    let node: unknown = { id: '$', kind: 'opaque', text: 'leaf' };
    for (let i = 0; i < 1_000; i += 1) node = { id: `$${i}`, kind: 'sequence', items: [node] };

    const { truncated, diagnostics } = read(node);

    expect(truncated).toBe(true);
    expect(diagnostics.some((d) => d.message.includes('nested deeper'))).toBe(true);
  });

  it('caps total nodes so a hostile file cannot exhaust the tab', () => {
    expect(MAX_SNAPSHOT_NODES).toBeLessThanOrEqual(1_000_000);
  });

  it('never throws, whatever the shape', () => {
    const shapes: unknown[] = [
      undefined,
      { id: '$', kind: 'object', fields: 'not an array' },
      { id: '$', kind: 'object', fields: [{ value: null }] },
      { id: '$', kind: 'sequence', items: { not: 'an array' } },
      { id: '$', kind: 'scalar' },
      { id: 123, kind: 'opaque', text: 456 },
    ];

    for (const shape of shapes) expect(() => read(shape)).not.toThrow();
  });
});
