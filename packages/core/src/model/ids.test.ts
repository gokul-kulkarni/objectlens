import { describe, expect, it } from 'vitest';
import {
  ROOT_ID,
  argChild,
  disambiguate,
  fieldChild,
  indexChild,
  isAddressable,
  isIdentifier,
  keyChild,
  keyNodeChild,
  keyValueChild,
  setItemChild,
} from './ids.js';

describe('path construction', () => {
  it('builds an id that is itself a legal access expression', () => {
    const users = keyChild(ROOT_ID, '"users"');
    const first = indexChild(users, 0);
    const name = fieldChild(first, 'name');

    expect(name).toBe('$["users"][0].name');
  });

  it('emits key literals verbatim so the path pastes into the source language', () => {
    // The adapter renders the literal; ids.ts must not reformat it, or a Python path would
    // come back with JSON quoting.
    expect(keyChild(ROOT_ID, "'users'")).toBe("$['users']");
    expect(keyChild(ROOT_ID, '(1, 2)')).toBe('$[(1, 2)]');
  });
});

describe('isIdentifier', () => {
  it.each(['name', '_private', '$dollar', 'a1'])('accepts %s', (name) => {
    expect(isIdentifier(name)).toBe(true);
  });

  it.each(['odd name', '1leading', '', 'has-dash', 'a.b'])('rejects %s', (name) => {
    expect(isIdentifier(name)).toBe(false);
  });
});

describe('fieldChild', () => {
  it('uses dot access for identifier-shaped names', () => {
    expect(fieldChild(ROOT_ID, 'name')).toBe('$.name');
  });

  it('falls back to a non-addressable form for names set via setattr', () => {
    // `setattr(obj, "odd name", 1)` is legal Python, so this is not merely theoretical.
    const id = fieldChild(ROOT_ID, 'odd name');
    expect(id).toBe('$@field(odd name)');
    expect(isAddressable(id)).toBe(false);
  });
});

describe('isAddressable', () => {
  it('is true for paths made only of subscripts and attributes', () => {
    expect(isAddressable('$["users"][0].name')).toBe(true);
  });

  it.each([
    ['set members', setItemChild('$.tags', 0)],
    ['dict keys', keyNodeChild(ROOT_ID, 0)],
    ['positional args', argChild('$.created', 0)],
    ['values behind a structural key', keyValueChild(ROOT_ID, 0)],
  ])('is false for %s, which have no access expression', (_label, id) => {
    expect(isAddressable(id)).toBe(false);
  });

  it('stays false once any segment is non-addressable', () => {
    // A field reached *through* a set member is still unreachable by expression.
    const viaSet = fieldChild(setItemChild('$.tags', 0), 'name');
    expect(isAddressable(viaSet)).toBe(false);
  });
});

describe('keyValueChild', () => {
  it('does not collide with the key node it sits beside', () => {
    // Both describe entry 0 of the same map. Sharing an id would silently drop one of them.
    expect(keyValueChild(ROOT_ID, 0)).not.toBe(keyNodeChild(ROOT_ID, 0));
  });
});

describe('disambiguate', () => {
  it('suffixes the attempt number', () => {
    expect(disambiguate('$["a"]', 2)).toBe('$["a"]~2');
    expect(disambiguate('$["a"]', 3)).toBe('$["a"]~3');
  });
});
