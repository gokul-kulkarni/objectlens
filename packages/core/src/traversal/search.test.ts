import { describe, expect, it } from 'vitest';
import { search, searchableText } from './search.js';
import { buildGraph } from '../model/graph.js';
import { TEST_SOURCE, entry, field, map, obj, opaque, seq, str } from '../testing/fixtures.js';

const graph = () =>
  buildGraph(
    map('$', [
      entry(
        str('$@key0', 'users'),
        seq('$["users"]', [
          obj('$["users"][0]', 'User', [field('name', str('$["users"][0].name', 'ada'))]),
          obj('$["users"][1]', 'User', [field('name', str('$["users"][1].name', 'grace'))]),
        ]),
      ),
      entry(str('$@key1', 'total'), str('$["total"]', '2')),
    ]),
    TEST_SOURCE,
  );

describe('searchableText', () => {
  it('includes a scalar’s raw form so bignums are findable as written', () => {
    const node = { ...str('$', '1'), raw: '9007199254740993' };
    expect(searchableText(node)).toContain('9007199254740993');
  });

  it('includes an object’s type name and field names', () => {
    const text = searchableText(obj('$', 'User', [field('email', str('$.email', 'a@b.c'))]));
    expect(text).toContain('User');
    expect(text).toContain('email');
  });

  it('includes an opaque node’s repr', () => {
    expect(searchableText(opaque('$', '<User: id=1>'))).toContain('<User: id=1>');
  });
});

describe('search', () => {
  it('returns nothing for an empty or whitespace query', () => {
    expect(search(graph(), '').matches.size).toBe(0);
    expect(search(graph(), '   ').matches.size).toBe(0);
  });

  it('matches a node by its value', () => {
    expect([...search(graph(), 'grace').matches]).toContain('$["users"][1].name');
  });

  it('matches a node by the label its parent gave it', () => {
    // "users" is a property of the edge, not of the node it points at. Searching for a dict key
    // is the common case, so edge labels have to be part of the haystack.
    expect([...search(graph(), 'users').matches]).toContain('$["users"]');
  });

  it('matches by type name', () => {
    expect([...search(graph(), 'User').matches]).toEqual(
      expect.arrayContaining(['$["users"][0]', '$["users"][1]']),
    );
  });

  it('is case-insensitive by default', () => {
    expect(search(graph(), 'ADA').matches.size).toBeGreaterThan(0);
  });

  it('respects caseSensitive', () => {
    expect(search(graph(), 'ADA', { caseSensitive: true }).matches.size).toBe(0);
    expect(search(graph(), 'ada', { caseSensitive: true }).matches.size).toBeGreaterThan(0);
  });

  it('reveals every ancestor of a match so the tree can expand to it', () => {
    const { reveal } = search(graph(), 'grace');

    expect([...reveal].sort()).toEqual(
      ['$', '$["users"]', '$["users"][1]', '$["users"][1].name'].sort(),
    );
  });

  it('includes matches themselves in reveal', () => {
    const { matches, reveal } = search(graph(), 'grace');
    for (const id of matches) expect(reveal.has(id)).toBe(true);
  });

  it('stops at maxResults and says so', () => {
    const result = search(graph(), 'a', { maxResults: 1 });

    expect(result.matches.size).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('is not truncated when everything fits', () => {
    expect(search(graph(), 'grace', { maxResults: 100 }).truncated).toBe(false);
  });
});
