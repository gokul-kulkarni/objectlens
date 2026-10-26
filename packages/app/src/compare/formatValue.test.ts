import { describe, expect, it } from 'vitest';
import type { ParseResult } from '@objectlens/core';
import { field, obj, opaque, ref, seq, set, str } from '@objectlens/core/testing';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
import { formatValue } from './formatValue.js';

const root = (result: ParseResult | Promise<ParseResult>) => {
  const graph = (result as ParseResult).graph;
  if (graph === null) throw new Error('fixture failed to parse');
  return graph.root;
};

describe('formatValue', () => {
  it('prints scalars as their row rendering', () => {
    expect(formatValue(str('$', 'hi'))).toBe("'hi'");
  });

  it('pretty-prints nested containers with indentation', () => {
    expect(formatValue(root(jsonAdapter.parse({ text: '{"a": [1, 2], "b": {}}' }, {})))).toBe(
      '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {}\n}',
    );
  });

  it('prints objects with args and fields, sets, opaque values and refs', () => {
    expect(formatValue(root(pythonAdapter.parse({ text: "Point(1, y=2)" }, {})))).toBe('Point(\n  1,\n  y: 2\n)');
    expect(formatValue(set('$', [str('a', 'x')]))).toBe("set{\n  'x'\n}");
    expect(formatValue(opaque('$', '<Foo>'))).toBe('<Foo>');
    expect(formatValue(seq('$', [ref('$[0]', '$', true)]))).toBe('[\n  <cycle → $>\n]');
    expect(formatValue(obj('$', 'Empty', [field('x', seq('$.x', []))]))).toBe('Empty(\n  x: []\n)');
  });

  it('summarises beyond its depth limit', () => {
    let node = seq('leaf', []);
    for (let i = 0; i < 12; i += 1) node = seq(`d${i}`, [node]);
    expect(formatValue(node)).toContain('[…] 1 item');
  });

  it('truncates very long output', () => {
    const items = Array.from({ length: 5_000 }, (_, i) => str(`$[${i}]`, 'x'.repeat(10)));
    const text = formatValue(seq('$', items));
    expect(text.endsWith('… (truncated)')).toBe(true);
    expect(text.length).toBeLessThan(21_000);
  });
});
