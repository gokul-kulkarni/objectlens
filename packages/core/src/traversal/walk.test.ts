import { describe, expect, it } from 'vitest';
import { countNodes, maxDepth, walk } from './walk.js';
import { deepChain, entry, int, map, ref, seq, str } from '../testing/fixtures.js';

describe('walk', () => {
  it('yields nodes in pre-order, left to right', () => {
    const tree = seq('$', [
      seq('$[0]', [str('$[0][0]', 'a'), str('$[0][1]', 'b')]),
      str('$[1]', 'c'),
    ]);

    expect([...walk(tree)].map((s) => s.node.id)).toEqual([
      '$',
      '$[0]',
      '$[0][0]',
      '$[0][1]',
      '$[1]',
    ]);
  });

  it('reports depth relative to the root', () => {
    const tree = seq('$', [seq('$[0]', [str('$[0][0]', 'deep')])]);
    const depths = new Map([...walk(tree)].map((s) => [s.node.id, s.depth]));

    expect(depths.get('$')).toBe(0);
    expect(depths.get('$[0]')).toBe(1);
    expect(depths.get('$[0][0]')).toBe(2);
  });

  it('yields a ref but does not follow it', () => {
    // Following refs would not terminate — that is the entire reason `ref` is a distinct kind.
    const tree = map('$', [entry(str('$@key0', 'self'), ref('$["self"]', '$', true))]);
    const visited = [...walk(tree)].map((s) => s.node.id);

    expect(visited).toEqual(['$', '$["self"]']);
  });

  it('survives a chain deep enough to overflow a recursive implementation', () => {
    // Node's stack tops out around 11k frames, so 50k would crash a recursive walk.
    const chain = deepChain(50_000);
    expect(() => countNodes(chain)).not.toThrow();
    expect(countNodes(chain)).toBe(50_001);
  });

  it('stays linear in depth rather than quadratic', () => {
    // Guards a regression that already happened once: carrying an ancestor array per step made
    // this O(depth²), and a 50k chain took 8.6s. Linear it is milliseconds, so the budget below
    // is loose enough not to flake but far tighter than any quadratic implementation can meet.
    const chain = deepChain(100_000);

    const started = performance.now();
    expect(countNodes(chain)).toBe(100_001);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(2_000);
  });
});

describe('countNodes', () => {
  it('counts every node including the root', () => {
    expect(countNodes(seq('$', [int('$[0]', 1), int('$[1]', 2)]))).toBe(3);
  });
});

describe('maxDepth', () => {
  it('is 0 for a lone scalar', () => {
    expect(maxDepth(str('$', 'x'))).toBe(0);
  });

  it('reports the deepest branch, not the last one', () => {
    const tree = seq('$', [
      seq('$[0]', [seq('$[0][0]', [str('$[0][0][0]', 'deep')])]),
      str('$[1]', 'shallow'),
    ]);

    expect(maxDepth(tree)).toBe(3);
  });
});
