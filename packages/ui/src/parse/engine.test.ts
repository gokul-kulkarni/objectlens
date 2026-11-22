import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../adapters.js';
import { handleRequest } from './engine.js';

const registry = createAdapterRegistry();

describe('handleRequest', () => {
  it('parses one source', async () => {
    const response = await handleRequest(registry, {
      type: 'parse',
      id: 7,
      adapterId: 'yaml',
      text: 'a: 1\nb: [2, 3]\n',
      filename: 'config.yaml',
    });
    expect(response).toMatchObject({ type: 'parse', id: 7 });
    expect(response.type === 'parse' && response.graph).not.toBeNull();
  });

  it('compares two sources in different formats', async () => {
    const response = await handleRequest(registry, {
      type: 'compare',
      id: 3,
      left: { adapterId: 'json', text: '{"a": 1}' },
      right: { adapterId: 'yaml', text: 'a: 2\n' },
      options: {},
    });
    expect(response).toMatchObject({ type: 'compare', id: 3 });
    expect(response.type === 'compare' && response.diff).not.toBeNull();
  });

  it('returns no diff when a side cannot be parsed at all', async () => {
    const response = await handleRequest(registry, {
      type: 'compare',
      id: 4,
      left: { adapterId: 'json', text: '{"a": 1}' },
      right: { adapterId: 'json', text: '' },
      options: {},
    });
    expect(response.type === 'compare' && response.diff).toBeNull();
  });
});
