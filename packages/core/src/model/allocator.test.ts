import { describe, expect, it } from 'vitest';
import { createIdAllocator } from './allocator.js';

describe('createIdAllocator', () => {
  it('returns the preferred id when it is free', () => {
    const allocator = createIdAllocator();
    expect(allocator.allocate('$["a"]')).toBe('$["a"]');
    expect(allocator.collisions).toEqual([]);
  });

  it('disambiguates a repeated key rather than dropping the node', () => {
    // `{'a': 1, 'a': 2}` cannot come from a live dict, but hand-edited or truncated text can
    // contain it, and losing the second entry silently would be worse than an ugly id.
    const allocator = createIdAllocator();

    expect(allocator.allocate('$["a"]')).toBe('$["a"]');
    expect(allocator.allocate('$["a"]')).toBe('$["a"]~2');
    expect(allocator.allocate('$["a"]')).toBe('$["a"]~3');
  });

  it('records collisions so they can be surfaced as warnings', () => {
    const allocator = createIdAllocator();
    allocator.allocate('$["a"]');
    allocator.allocate('$["a"]');
    allocator.allocate('$["b"]');

    expect(allocator.collisions).toEqual(['$["a"]']);
  });

  it('does not hand out an id that a previous disambiguation already claimed', () => {
    const allocator = createIdAllocator();
    allocator.allocate('$["a"]~2');
    allocator.allocate('$["a"]');

    expect(allocator.allocate('$["a"]')).toBe('$["a"]~3');
  });

  it('keeps distinct ids independent', () => {
    const allocator = createIdAllocator();
    expect(allocator.allocate('$["a"]')).toBe('$["a"]');
    expect(allocator.allocate('$["b"]')).toBe('$["b"]');
    expect(allocator.collisions).toEqual([]);
  });
});
