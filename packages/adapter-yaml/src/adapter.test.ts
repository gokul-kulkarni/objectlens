import { describe, expect, it } from 'vitest';
import { hasErrors, type ParseResult } from '@objectlens/core';
import { yamlAdapter } from './adapter.js';

const parse = (text: string, context = {}) =>
  yamlAdapter.parse({ text }, context) as ParseResult;

describe('the adapter surface', () => {
  it('declares the extensions and mime types uploads arrive with', () => {
    expect(yamlAdapter.extensions).toEqual(['.yaml', '.yml']);
    expect(yamlAdapter.mimeTypes).toContain('application/yaml');
  });

  it('writes its own id into every node it produces', () => {
    const { graph } = parse('a: 1');
    for (const node of graph?.nodesById.values() ?? []) expect(node.source).toBe('yaml');
  });
});

describe('guards', () => {
  it('refuses an input over the size limit without attempting it', () => {
    const { graph, diagnostics } = parse('a: 1', { maxBytes: 2 });

    expect(graph).toBeNull();
    expect(diagnostics[0]?.message).toContain('over the');
  });

  it('refuses empty input with a message rather than an empty graph', () => {
    const { graph, diagnostics } = parse('   \n  ');

    expect(graph).toBeNull();
    expect(hasErrors(diagnostics)).toBe(true);
  });

  it('never throws', () => {
    for (const text of ['a: [1', '\t', '&&&', '---\n\t\n---', '%YAML 9.9\n---\na: 1']) {
      expect(() => parse(text)).not.toThrow();
    }
  });
});

describe('partial results', () => {
  it('returns a graph alongside diagnostics when input is only partly readable', () => {
    // The contract's core promise: one bad line costs one line, not the file.
    const { graph, diagnostics } = parse('good: 1\n\tbad: 2\n');

    expect(graph).not.toBeNull();
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('marks the graph truncated when a limit cut the walk short', () => {
    const deep = Array.from({ length: 400 }, (_, i) => `${'  '.repeat(i)}a:`).join('\n');
    expect(parse(deep).graph?.truncated).toBe(true);
  });
});
