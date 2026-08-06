import { describe, expect, it } from 'vitest';
import { SourceAdapterRegistry, hasErrors } from '@objectlens/core';
import { pythonAdapter } from './adapter.js';

const parse = (text: string, context = {}) => pythonAdapter.parse({ text }, context);

describe('adapter metadata', () => {
  it('declares the identity used in node.source and the format picker', () => {
    expect(pythonAdapter.id).toBe('python-repr');
    expect(pythonAdapter.label).toBe('Python repr()');
    expect(pythonAdapter.extensions).toContain('.py');
  });
});

describe('graph assembly', () => {
  it('stamps the source on the graph and its nodes', async () => {
    const { graph } = await parse("{'a': 1}");

    expect(graph?.source).toBe('python-repr');
    expect(graph?.root.source).toBe('python-repr');
  });

  it('indexes nodes by their Python-pasteable path', async () => {
    const { graph } = await parse("{'users': [{'name': 'ada'}]}");

    expect(graph?.nodesById.has(`$['users'][0]['name']`)).toBe(true);
  });

  it('resolves a cycle ref to a node that exists in the graph', async () => {
    // A dangling ref would render as a broken link in the graph view.
    const { graph } = await parse("{'self': {...}}");
    const ref = [...(graph?.nodesById.values() ?? [])].find((n) => n.kind === 'ref');

    expect(ref).toBeDefined();
    expect(graph?.nodesById.has((ref as { target: string }).target)).toBe(true);
  });

  it('still returns a graph when the input had errors', async () => {
    const { graph } = await parse("{'good': 1, 'bad': @@@}");
    expect(graph).not.toBeNull();
  });

  it('surfaces diagnostics on both the result and the graph', async () => {
    const result = await parse("{'a': @@@}");

    expect(hasErrors(result.diagnostics)).toBe(true);
    expect(result.graph?.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('input guards', () => {
  it('rejects empty input with an explanation', async () => {
    const result = await parse('   ');

    expect(result.graph).toBeNull();
    expect(result.diagnostics[0]?.message).toContain('empty');
  });

  it('refuses input over the size cap rather than freezing the tab', async () => {
    const result = await parse("{'a': 1}", { maxBytes: 4 });

    expect(result.graph).toBeNull();
    expect(result.diagnostics[0]?.message).toContain('limit');
  });

  it('accepts input at exactly the cap', async () => {
    const text = "{'a': 1}";
    expect((await parse(text, { maxBytes: text.length })).graph).not.toBeNull();
  });
});

describe('registry integration', () => {
  it('parses through the registry without throwing on hostile input', async () => {
    const registry = new SourceAdapterRegistry();
    registry.register(pythonAdapter);

    for (const text of ['{{{{', "'''", '<<<<', 'set(set(set(']) {
      const result = await registry.parseWith('python-repr', { text });
      expect(result.graph, text).not.toBeNull();
    }
  });
});
