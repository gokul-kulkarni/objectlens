import { describe, expect, it } from 'vitest';
import { childCount, hasUnloadedChildren, isContainer } from './nodes.js';
import { entry, field, int, map, obj, opaque, ref, seq, set, str } from '../testing/fixtures.js';

describe('isContainer', () => {
  it.each([
    ['map', map('$', [])],
    ['sequence', seq('$', [])],
    ['set', set('$', [])],
    ['object', obj('$', 'User')],
  ])('is true for %s', (_label, node) => {
    expect(isContainer(node)).toBe(true);
  });

  it.each([
    ['scalar', str('$', 'x')],
    ['opaque', opaque('$', '<Foo>')],
    ['ref', ref('$', '$.other')],
  ])('is false for %s', (_label, node) => {
    expect(isContainer(node)).toBe(false);
  });
});

describe('childCount', () => {
  it('counts loaded children', () => {
    expect(childCount(seq('$', [int('$[0]', 1), int('$[1]', 2)]))).toBe(2);
    expect(childCount(map('$', [entry(str('$@key0', 'a'), int('$["a"]', 1))]))).toBe(1);
    expect(childCount(set('$', [int('$@item0', 1)]))).toBe(1);
  });

  it('sums an object’s args and fields', () => {
    const node = obj('$', 'Point', [field('label', str('$.label', 'o'))], [int('$@arg0', 1)]);
    expect(childCount(node)).toBe(2);
  });

  it('prefers totalCount so a partially-loaded container reports its true size', () => {
    // A 1M-element list arrives as a window; the UI must show 1M, not the window length.
    expect(childCount(seq('$', [int('$[0]', 1)], 1_000_000))).toBe(1_000_000);
  });

  it('is zero for leaves', () => {
    expect(childCount(str('$', 'x'))).toBe(0);
    expect(childCount(ref('$', '$.other'))).toBe(0);
  });
});

describe('hasUnloadedChildren', () => {
  it('is true when totalCount exceeds what is loaded', () => {
    expect(hasUnloadedChildren(seq('$', [int('$[0]', 1)], 100))).toBe(true);
    expect(hasUnloadedChildren(set('$', [int('$@item0', 1)], 100))).toBe(true);
    expect(hasUnloadedChildren(map('$', [], 5))).toBe(true);
  });

  it('is false when everything is loaded', () => {
    expect(hasUnloadedChildren(seq('$', [int('$[0]', 1)], 1))).toBe(false);
    expect(hasUnloadedChildren(seq('$', [int('$[0]', 1)]))).toBe(false);
  });

  it('is false for objects and leaves, which are never windowed', () => {
    expect(hasUnloadedChildren(obj('$', 'User'))).toBe(false);
    expect(hasUnloadedChildren(str('$', 'x'))).toBe(false);
  });
});
