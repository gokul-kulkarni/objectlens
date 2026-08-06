import { describe, expect, it } from 'vitest';
import { SourceAdapterRegistry, hasErrors } from '@objectlens/core';
import { jsonAdapter } from './adapter.js';

const parse = (text: string, context = {}) => jsonAdapter.parse({ text }, context);

describe('adapter metadata', () => {
  it('declares the identity used in node.source and the format picker', () => {
    expect(jsonAdapter.id).toBe('json');
    expect(jsonAdapter.label).toBe('JSON');
    expect(jsonAdapter.extensions).toContain('.json');
  });
});

describe('graph assembly', () => {
  it('returns a graph with the source stamped on it', async () => {
    const { graph } = await parse('{"a": 1}');

    expect(graph?.source).toBe('json');
    expect(graph?.root.source).toBe('json');
  });

  it('indexes nodes so they are addressable by path', async () => {
    const { graph } = await parse('{"users": [{"name": "ada"}]}');

    expect(graph?.nodesById.has('$["users"][0]["name"]')).toBe(true);
  });

  it('surfaces parse diagnostics on both the result and the graph', async () => {
    const result = await parse('{"a": @@@}');

    expect(hasErrors(result.diagnostics)).toBe(true);
    expect(result.graph?.diagnostics.length).toBeGreaterThan(0);
  });

  it('still returns a graph when the input had errors', async () => {
    // Partial rendering is the point; returning null here would throw away the good 99%.
    const { graph } = await parse('{"good": 1, "bad": @@@}');
    expect(graph).not.toBeNull();
  });
});

describe('input guards', () => {
  it('rejects empty input with an explanation', async () => {
    const result = await parse('   ');

    expect(result.graph).toBeNull();
    expect(result.diagnostics[0]?.message).toContain('empty');
  });

  it('refuses input over the size cap rather than freezing the tab', async () => {
    const result = await parse('{"a": 1}', { maxBytes: 4 });

    expect(result.graph).toBeNull();
    expect(result.diagnostics[0]?.message).toContain('limit');
  });

  it('reports sizes in human units', async () => {
    const big = `{"a": "${'x'.repeat(2 * 1024 * 1024)}"}`;
    const result = await parse(big, { maxBytes: 1024 * 1024 });

    expect(result.diagnostics[0]?.message).toMatch(/MB/);
  });

  it('accepts input at exactly the cap', async () => {
    const text = '{"a": 1}';
    expect((await parse(text, { maxBytes: text.length })).graph).not.toBeNull();
  });
});

describe('registry integration', () => {
  it('wins auto-detection for JSON input', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(jsonAdapter);

    expect(registry.detectBest({ text: '{"a": 1}' })?.id).toBe('json');
  });

  it('is not offered for input it cannot handle', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(jsonAdapter);

    expect(registry.detectBest({ text: 'not json at all' })).toBeUndefined();
  });

  it('parses through the registry without throwing on hostile input', async () => {
    const registry = new SourceAdapterRegistry();
    registry.register(jsonAdapter);

    const result = await registry.parseWith('json', { text: '{{{{{' });
    expect(result.graph).not.toBeNull();
  });
});
