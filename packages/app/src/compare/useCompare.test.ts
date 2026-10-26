import { describe, expect, it } from 'vitest';
import type { ParseResult } from '@objectlens/core';
import { jsonAdapter } from '@objectlens/adapter-json';
import { diffGraphs, indexDiff } from '@objectlens/diff';
import { compareReducer, initialCompareState, stepChange, type CompareState } from './useCompare.js';

const graph = (text: string) => {
  const parsed = (jsonAdapter.parse({ text }, {}) as ParseResult).graph;
  if (parsed === null) throw new Error('fixture failed to parse');
  return parsed;
};

const diff = () => diffGraphs(graph('{"a": 1, "b": {"c": 2}, "d": 3}'), graph('{"a": 9, "b": {"c": 3}, "d": 3}'));

const compared = (state: CompareState = initialCompareState): CompareState =>
  compareReducer(state, {
    type: 'compared',
    diff: diff(),
    leftDiagnostics: [],
    rightDiagnostics: [],
    elapsedMs: 4,
  });

describe('compareReducer', () => {
  it('sets text on one side only, remembering a file name when given', () => {
    const state = compareReducer(initialCompareState, { type: 'setText', side: 'right', text: '{}', filename: 'b.json' });
    expect(state.left.text).toBe('');
    expect(state.right).toEqual({ text: '{}', filename: 'b.json', adapterId: null });
  });

  it('forgets the file name once the text is typed over', () => {
    const named = compareReducer(initialCompareState, { type: 'setText', side: 'left', text: '1', filename: 'a.json' });
    const typed = compareReducer(named, { type: 'setText', side: 'left', text: '12' });
    expect(typed.left).toEqual({ text: '12', adapterId: null });
  });

  it('pins a format per side', () => {
    const state = compareReducer(initialCompareState, { type: 'setAdapter', side: 'left', adapterId: 'yaml' });
    expect(state.left.adapterId).toBe('yaml');
    expect(state.right.adapterId).toBeNull();
  });

  it('swaps the sides wholesale', () => {
    let state = compareReducer(initialCompareState, { type: 'setText', side: 'left', text: 'L' });
    state = compareReducer(state, { type: 'setAdapter', side: 'left', adapterId: 'json' });
    state = compareReducer(state, { type: 'setText', side: 'right', text: 'R' });

    const swapped = compareReducer(state, { type: 'swap' });
    expect(swapped.left).toEqual({ text: 'R', adapterId: null });
    expect(swapped.right).toEqual({ text: 'L', adapterId: 'json' });
  });

  it('loads an example into both sides, back on auto-detection', () => {
    const pinned = compareReducer(initialCompareState, { type: 'setAdapter', side: 'left', adapterId: 'yaml' });
    const loaded = compareReducer(pinned, { type: 'load', left: 'a', right: 'b', arrayKey: 'id' });
    expect(loaded.left).toEqual({ text: 'a', adapterId: null });
    expect(loaded.right).toEqual({ text: 'b', adapterId: null });
    expect(loaded.arrayKey).toBe('id');
  });

  it('opens the path to every change and clears the old selection on a new result', () => {
    const selected = compareReducer(initialCompareState, { type: 'select', id: 'stale' });
    const state = compared(compareReducer(selected, { type: 'started' }));

    expect(state.status).toBe('ready');
    expect(state.selection).toBeNull();
    expect([...state.expanded].sort()).toEqual(['$', '$["b"]']);
  });

  it('reports failure when nothing could be compared', () => {
    const state = compareReducer(initialCompareState, {
      type: 'compared',
      diff: null,
      leftDiagnostics: [],
      rightDiagnostics: [],
      elapsedMs: 1,
    });
    expect(state.status).toBe('failed');
    expect(state.expanded.size).toBe(0);
  });

  it('toggles, expands and collapses', () => {
    let state = compared();
    state = compareReducer(state, { type: 'toggleExpand', id: '$["b"]' });
    expect(state.expanded.has('$["b"]')).toBe(false);
    state = compareReducer(state, { type: 'expand', ids: ['$["b"]'] });
    expect(state.expanded.has('$["b"]')).toBe(true);
    state = compareReducer(state, { type: 'collapseAll' });
    expect([...state.expanded]).toEqual(['$']);
    expect(compareReducer(initialCompareState, { type: 'collapseAll' }).expanded.size).toBe(0);
  });

  it('records options', () => {
    expect(compareReducer(initialCompareState, { type: 'setArrayKey', arrayKey: 'id' }).arrayKey).toBe('id');
    expect(compareReducer(initialCompareState, { type: 'setOnlyChanges', enabled: true }).onlyChanges).toBe(true);
  });
});

describe('stepChange', () => {
  const index = indexDiff(diff());
  const order = new Map([...index.byId.keys()].map((id, position) => [id, position]));

  it('starts at the first change, or the last going backwards', () => {
    expect(stepChange(index.changes, order, null, 1)).toBe('$["a"]');
    expect(stepChange(index.changes, order, null, -1)).toBe('$["b"]["c"]');
  });

  it('moves in document order and wraps', () => {
    expect(stepChange(index.changes, order, '$["a"]', 1)).toBe('$["b"]["c"]');
    expect(stepChange(index.changes, order, '$["b"]["c"]', 1)).toBe('$["a"]');
    expect(stepChange(index.changes, order, '$["a"]', -1)).toBe('$["b"]["c"]');
  });

  it('steps from an unchanged selection to the nearest change in that direction', () => {
    expect(stepChange(index.changes, order, '$["b"]', 1)).toBe('$["b"]["c"]');
    expect(stepChange(index.changes, order, '$["d"]', -1)).toBe('$["b"]["c"]');
  });

  it('has nowhere to go without changes', () => {
    expect(stepChange([], order, null, 1)).toBeNull();
  });
});
