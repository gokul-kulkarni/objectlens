import { describe, expect, it } from 'vitest';
import { childrenOf, keyLabel } from './children.js';
import { entry, field, int, map, obj, opaque, ref, seq, set, str } from '../testing/fixtures.js';

describe('keyLabel', () => {
  it('renders scalar keys inline', () => {
    expect(keyLabel(str('$@key0', 'users'))).toBe('users');
    expect(keyLabel(int('$@key0', 42))).toBe('42');
  });

  it('prefers raw so a bignum key is not rounded', () => {
    expect(keyLabel(int('$@key0', 9007199254740993, '9007199254740993'))).toBe('9007199254740993');
  });

  it('returns null for structural keys, signalling they need their own row', () => {
    // `{(1, 2): 'x'}` is legal Python. Flattening the key to a string would corrupt it.
    expect(keyLabel(seq('$@key0', [int('$@key0[0]', 1)]))).toBeNull();
  });
});

describe('childrenOf', () => {
  it('labels map values by their key', () => {
    const node = map('$', [entry(str('$@key0', 'name'), str('$["name"]', 'ada'))]);
    const children = childrenOf(node);

    expect(children).toHaveLength(1);
    expect(children[0]?.label).toBe('name');
    expect(children[0]?.relation).toBe('value');
    expect(children[0]?.node.id).toBe('$["name"]');
  });

  it('surfaces a structural key as its own child so it stays explorable', () => {
    const key = seq('$@key0', [int('$@key0[0]', 1), int('$@key0[1]', 2)]);
    const node = map('$', [entry(key, str('$@value0', 'x'))]);

    const children = childrenOf(node);

    expect(children.map((c) => c.relation)).toEqual(['key', 'value']);
    expect(children[0]?.node).toBe(key);
  });

  it('labels sequence items by index', () => {
    const node = seq('$', [str('$[0]', 'a'), str('$[1]', 'b')]);
    expect(childrenOf(node).map((c) => c.label)).toEqual(['0', '1']);
  });

  it('does not label set members with indices, which would imply addressability', () => {
    const node = set('$', [str('$@item0', 'a'), str('$@item1', 'b')]);
    const children = childrenOf(node);

    expect(children.map((c) => c.label)).toEqual(['•', '•']);
    expect(children.map((c) => c.index)).toEqual([0, 1]);
  });

  it('orders object positional args before named fields, matching the source repr', () => {
    const node = obj('$', 'Point', [field('label', str('$.label', 'origin'))], [
      int('$@arg0', 1),
      int('$@arg1', 2),
    ]);

    const children = childrenOf(node);

    expect(children.map((c) => c.relation)).toEqual(['arg', 'arg', 'field']);
    expect(children.map((c) => c.label)).toEqual(['0', '1', 'label']);
  });

  it.each([
    ['scalar', str('$', 'x')],
    ['opaque', opaque('$', '<Foo at 0x1>')],
    ['ref', ref('$', '$.other')],
  ])('returns no children for %s', (_label, node) => {
    expect(childrenOf(node)).toEqual([]);
  });
});
