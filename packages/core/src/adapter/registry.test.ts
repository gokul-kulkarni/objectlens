import { describe, expect, it, vi } from 'vitest';
import { SourceAdapterRegistry } from './registry.js';
import type { RawInput, SourceAdapter } from './types.js';
import { buildGraph } from '../model/graph.js';
import { str } from '../testing/fixtures.js';

function adapter(id: string, confidence: number, overrides: Partial<SourceAdapter> = {}): SourceAdapter {
  return {
    id,
    label: id,
    extensions: [],
    sniff: () => confidence,
    parse: () => ({ graph: buildGraph(str('$', id), id), diagnostics: [] }),
    ...overrides,
  };
}

const input: RawInput = { text: '{}' };

describe('registration', () => {
  it('registers and retrieves an adapter', () => {
    const registry = new SourceAdapterRegistry();
    const json = adapter('json', 1);

    expect(registry.register(json)).toBeUndefined();
    expect(registry.get('json')).toBe(json);
    expect(registry.has('json')).toBe(true);
  });

  it('replaces on duplicate id and returns the previous adapter', () => {
    // Replacing rather than throwing is what keeps dev-server hot reload usable.
    const registry = new SourceAdapterRegistry();
    const first = adapter('json', 1);
    const second = adapter('json', 0.5);

    registry.register(first);

    expect(registry.register(second)).toBe(first);
    expect(registry.get('json')).toBe(second);
    expect(registry.list()).toHaveLength(1);
  });

  it('unregisters', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('json', 1));

    expect(registry.unregister('json')).toBe(true);
    expect(registry.unregister('json')).toBe(false);
    expect(registry.has('json')).toBe(false);
  });
});

describe('detect', () => {
  it('ranks adapters by confidence, best first', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('low', 0.2));
    registry.register(adapter('high', 0.9));
    registry.register(adapter('mid', 0.5));

    expect(registry.detect(input).map((d) => d.adapter.id)).toEqual(['high', 'mid', 'low']);
  });

  it('excludes adapters scoring zero from auto-detection', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('never', 0));
    registry.register(adapter('maybe', 0.3));

    expect(registry.detect(input).map((d) => d.adapter.id)).toEqual(['maybe']);
  });

  it('clamps confidence above 1', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('eager', 42));

    expect(registry.detect(input)[0]?.confidence).toBe(1);
  });

  it('ignores a non-finite confidence rather than sorting NaN', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('broken', Number.NaN));
    registry.register(adapter('good', 0.4));

    expect(registry.detect(input).map((d) => d.adapter.id)).toEqual(['good']);
  });

  it('survives a plugin whose sniff throws', () => {
    // One broken third-party adapter must not make the other formats undetectable.
    const registry = new SourceAdapterRegistry();
    registry.register(
      adapter('hostile', 1, {
        sniff: () => {
          throw new Error('boom');
        },
      }),
    );
    registry.register(adapter('good', 0.4));

    expect(registry.detect(input).map((d) => d.adapter.id)).toEqual(['good']);
  });

  it('returns nothing when no adapter recognises the input', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('never', 0));

    expect(registry.detect(input)).toEqual([]);
    expect(registry.detectBest(input)).toBeUndefined();
  });

  it('detectBest picks the highest scorer', () => {
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('low', 0.2));
    registry.register(adapter('high', 0.9));

    expect(registry.detectBest(input)?.id).toBe('high');
  });
});

describe('parseWith', () => {
  it('parses with the named adapter', async () => {
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('json', 1));

    const result = await registry.parseWith('json', input);

    expect(result.graph?.root.id).toBe('$');
    expect(result.diagnostics).toEqual([]);
  });

  it('awaits an adapter that parses asynchronously', async () => {
    const registry = new SourceAdapterRegistry();
    registry.register(
      adapter('async', 1, {
        parse: async () => ({ graph: buildGraph(str('$', 'async'), 'async'), diagnostics: [] }),
      }),
    );

    const result = await registry.parseWith('async', input);
    expect(result.graph).not.toBeNull();
  });

  it('reports an unknown adapter id as a diagnostic rather than throwing', async () => {
    const result = await new SourceAdapterRegistry().parseWith('nope', input);

    expect(result.graph).toBeNull();
    expect(result.diagnostics[0]?.message).toContain('nope');
  });

  it('converts a thrown exception into a diagnostic', async () => {
    // Adapters are contractually non-throwing; this is the backstop that keeps a violation a
    // visible message instead of a white screen.
    const registry = new SourceAdapterRegistry();
    registry.register(
      adapter('hostile', 1, {
        parse: () => {
          throw new Error('kaboom');
        },
      }),
    );

    const result = await registry.parseWith('hostile', input);

    expect(result.graph).toBeNull();
    expect(result.diagnostics[0]?.severity).toBe('error');
    expect(result.diagnostics[0]?.message).toContain('kaboom');
  });

  it('handles a rejected promise from an async adapter', async () => {
    const registry = new SourceAdapterRegistry();
    registry.register(
      adapter('hostile', 1, { parse: () => Promise.reject(new Error('async kaboom')) }),
    );

    const result = await registry.parseWith('hostile', input);
    expect(result.diagnostics[0]?.message).toContain('async kaboom');
  });

  it('handles a thrown non-Error value', async () => {
    const registry = new SourceAdapterRegistry();
    registry.register(
      adapter('hostile', 1, {
        parse: () => {
          throw 'just a string';
        },
      }),
    );

    const result = await registry.parseWith('hostile', input);
    expect(result.diagnostics[0]?.message).toContain('just a string');
  });

  it('passes the parse context through to the adapter', async () => {
    const parse = vi.fn(() => ({ graph: null, diagnostics: [] }));
    const registry = new SourceAdapterRegistry();
    registry.register(adapter('spy', 1, { parse }));

    await registry.parseWith('spy', input, { maxBytes: 1024 });

    expect(parse).toHaveBeenCalledWith(input, { maxBytes: 1024 });
  });
});
