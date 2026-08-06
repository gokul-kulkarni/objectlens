import { describe, expect, it } from 'vitest';
import { childrenOf, isAddressable } from '@objectlens/core';
import { parsePython } from './parser.js';

/**
 * These types repr as constructor calls, so the parser gives their contents positional argument
 * ids before it knows the call is a container. Adoption has to repair that, or every entry is
 * reported as unreachable when `counter['a']` is perfectly good Python.
 */
describe('adopted containers get real access paths', () => {
  it.each([
    ["Counter({'a': 2})", `$['a']`],
    ["OrderedDict({'a': 1})", `$['a']`],
    ["defaultdict(<class 'int'>, {'a': 1})", `$['a']`],
  ])('%s exposes %s', (text, expectedId) => {
    const child = childrenOf(parsePython(text).root)[0];

    expect(child?.node.id).toBe(expectedId);
    expect(isAddressable(child?.node.id ?? '')).toBe(true);
  });

  it('rebases nested paths, not just the top level', () => {
    const root = parsePython("Counter({'a': [1, 2]})").root;
    const inner = childrenOf(childrenOf(root)[0]!.node)[1];

    expect(inner?.node.id).toBe(`$['a'][1]`);
  });

  it('leaves frozenset members unaddressable, because sets genuinely are', () => {
    const child = childrenOf(parsePython('frozenset({1, 2})').root)[0];
    expect(isAddressable(child?.node.id ?? '')).toBe(false);
  });
});
