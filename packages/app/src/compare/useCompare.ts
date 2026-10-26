/**
 * Compare state.
 *
 * Two inputs, each with its own detected format, and the diff between them. Every transition
 * returns new state, like the explorer's `useViewer`; the reducer is exported so its behaviour is
 * testable without a worker.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { expandAll, toggle, type Diagnostic, type RawInput } from '@objectlens/core';
import {
  diffAncestors,
  indexDiff,
  initialDiffExpansion,
  type DiffResult,
} from '@objectlens/diff';
import { adapters } from '../registry.js';
import type { CompareRequest, SourceInput, WorkerResponse } from '../worker/parse.worker.js';

export type Side = 'left' | 'right';

export interface SideState {
  readonly text: string;
  readonly filename?: string;
  /** `null` means "auto-detect"; a string pins the user's explicit choice. */
  readonly adapterId: string | null;
}

export interface CompareState {
  readonly left: SideState;
  readonly right: SideState;
  readonly arrayKey: string;
  readonly onlyChanges: boolean;
  readonly diff: DiffResult | null;
  readonly leftDiagnostics: readonly Diagnostic[];
  readonly rightDiagnostics: readonly Diagnostic[];
  readonly status: 'empty' | 'comparing' | 'ready' | 'failed';
  readonly elapsedMs: number;
  readonly expanded: ReadonlySet<string>;
  readonly selection: string | null;
}

export type CompareAction =
  | { type: 'setText'; side: Side; text: string; filename?: string }
  | { type: 'setAdapter'; side: Side; adapterId: string | null }
  | { type: 'swap' }
  | { type: 'load'; left: string; right: string; arrayKey: string }
  | { type: 'setArrayKey'; arrayKey: string }
  | { type: 'setOnlyChanges'; enabled: boolean }
  | { type: 'started' }
  | {
      type: 'compared';
      diff: DiffResult | null;
      leftDiagnostics: readonly Diagnostic[];
      rightDiagnostics: readonly Diagnostic[];
      elapsedMs: number;
    }
  | { type: 'select'; id: string | null }
  | { type: 'toggleExpand'; id: string }
  | { type: 'expand'; ids: Iterable<string> }
  | { type: 'collapseAll' };

const EMPTY_SIDE: SideState = { text: '', adapterId: null };

export const initialCompareState: CompareState = {
  left: EMPTY_SIDE,
  right: EMPTY_SIDE,
  arrayKey: '',
  onlyChanges: false,
  diff: null,
  leftDiagnostics: [],
  rightDiagnostics: [],
  status: 'empty',
  elapsedMs: 0,
  expanded: new Set(),
  selection: null,
};

export function compareReducer(state: CompareState, action: CompareAction): CompareState {
  switch (action.type) {
    case 'setText': {
      const current = state[action.side];
      const { filename: _dropped, ...rest } = current;
      const next: SideState =
        action.filename === undefined ? { ...rest, text: action.text } : { ...rest, text: action.text, filename: action.filename };
      return { ...state, [action.side]: next };
    }

    case 'setAdapter':
      return { ...state, [action.side]: { ...state[action.side], adapterId: action.adapterId } };

    case 'swap':
      return { ...state, left: state.right, right: state.left };

    case 'load':
      // An example replaces both inputs, so any pinned format belongs to text that is gone.
      return {
        ...state,
        left: { text: action.left, adapterId: null },
        right: { text: action.right, adapterId: null },
        arrayKey: action.arrayKey,
      };

    case 'setArrayKey':
      return { ...state, arrayKey: action.arrayKey };

    case 'setOnlyChanges':
      return { ...state, onlyChanges: action.enabled };

    case 'started':
      return { ...state, status: 'comparing' };

    case 'compared':
      return {
        ...state,
        diff: action.diff,
        leftDiagnostics: action.leftDiagnostics,
        rightDiagnostics: action.rightDiagnostics,
        elapsedMs: action.elapsedMs,
        status: action.diff === null ? 'failed' : 'ready',
        // A new diff invalidates positions from the old one.
        selection: null,
        expanded: action.diff === null ? new Set() : initialDiffExpansion(action.diff),
      };

    case 'select':
      return { ...state, selection: action.id };

    case 'toggleExpand':
      return { ...state, expanded: toggle(state.expanded, action.id) };

    case 'expand':
      return { ...state, expanded: expandAll(state.expanded, action.ids) };

    case 'collapseAll':
      return { ...state, expanded: state.diff === null ? new Set() : new Set([state.diff.root.id]) };
  }
}


function detect(side: SideState) {
  if (side.text.trim() === '') return [];
  const input: RawInput = side.filename === undefined ? { text: side.text } : { text: side.text, filename: side.filename };
  return adapters.detect(input);
}

/**
 * The change after (or before) `selection` in document order, wrapping at either end. With no
 * selection, steps to the first (or last) change.
 */
export function stepChange(
  changes: readonly string[],
  order: ReadonlyMap<string, number>,
  selection: string | null,
  direction: 1 | -1,
): string | null {
  if (changes.length === 0) return null;
  const at = selection === null ? undefined : order.get(selection);

  if (at === undefined) return (direction === 1 ? changes[0] : changes[changes.length - 1]) ?? null;

  if (direction === 1) {
    return changes.find((id) => (order.get(id) ?? -1) > at) ?? changes[0] ?? null;
  }
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const id = changes[i];
    if (id !== undefined && (order.get(id) ?? Infinity) < at) return id;
  }
  return changes[changes.length - 1] ?? null;
}

export function useCompare() {
  const [state, dispatch] = useReducer(compareReducer, initialCompareState);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('../worker/parse.worker.ts', import.meta.url), { type: 'module' });

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      // Ignore superseded requests, or a slow comparison overwrites a newer one.
      if (response.type !== 'compare' || response.id !== requestId.current) return;
      dispatch({
        type: 'compared',
        diff: response.diff,
        leftDiagnostics: response.leftDiagnostics,
        rightDiagnostics: response.rightDiagnostics,
        elapsedMs: response.elapsedMs,
      });
    });

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const leftDetections = useMemo(() => detect(state.left), [state.left]);
  const rightDetections = useMemo(() => detect(state.right), [state.right]);
  const leftAdapter = state.left.adapterId ?? leftDetections[0]?.adapter.id ?? null;
  const rightAdapter = state.right.adapterId ?? rightDetections[0]?.adapter.id ?? null;
  const canCompare = leftAdapter !== null && rightAdapter !== null;

  const compare = useCallback(() => {
    const worker = workerRef.current;
    if (worker === null || leftAdapter === null || rightAdapter === null) return;

    const source = (side: SideState, adapterId: string): SourceInput =>
      side.filename === undefined ? { adapterId, text: side.text } : { adapterId, text: side.text, filename: side.filename };

    requestId.current += 1;
    dispatch({ type: 'started' });
    const request: CompareRequest = {
      type: 'compare',
      id: requestId.current,
      left: source(state.left, leftAdapter),
      right: source(state.right, rightAdapter),
      options: state.arrayKey.trim() === '' ? {} : { arrayKey: state.arrayKey.trim() },
    };
    worker.postMessage(request);
  }, [leftAdapter, rightAdapter, state.left, state.right, state.arrayKey]);

  const index = useMemo(() => (state.diff === null ? null : indexDiff(state.diff)), [state.diff]);
  const order = useMemo(
    () => new Map([...(index?.byId.keys() ?? [])].map((id, position) => [id, position])),
    [index],
  );

  /** Selects the next or previous change, opening whatever hides it. */
  const step = useCallback(
    (direction: 1 | -1) => {
      if (index === null) return;
      const target = stepChange(index.changes, order, state.selection, direction);
      if (target === null) return;
      dispatch({ type: 'expand', ids: diffAncestors(index, target) });
      dispatch({ type: 'select', id: target });
    },
    [index, order, state.selection],
  );

  const expandEverything = useCallback(() => {
    if (index === null) return;
    const containers = [...index.byId.values()].filter((node) => node.children.length > 0).map((node) => node.id);
    dispatch({ type: 'expand', ids: containers });
  }, [index]);

  return {
    state,
    index,
    leftDetections,
    rightDetections,
    leftAdapter,
    rightAdapter,
    canCompare,
    compare,
    step,
    expandEverything,
    setText: useCallback(
      (side: Side, text: string, filename?: string) =>
        dispatch(filename === undefined ? { type: 'setText', side, text } : { type: 'setText', side, text, filename }),
      [],
    ),
    setAdapter: useCallback((side: Side, adapterId: string | null) => dispatch({ type: 'setAdapter', side, adapterId }), []),
    swap: useCallback(() => dispatch({ type: 'swap' }), []),
    load: useCallback(
      (left: string, right: string, arrayKey = '') => dispatch({ type: 'load', left, right, arrayKey }),
      [],
    ),
    setArrayKey: useCallback((arrayKey: string) => dispatch({ type: 'setArrayKey', arrayKey }), []),
    setOnlyChanges: useCallback((enabled: boolean) => dispatch({ type: 'setOnlyChanges', enabled }), []),
    select: useCallback((id: string | null) => dispatch({ type: 'select', id }), []),
    toggleExpand: useCallback((id: string) => dispatch({ type: 'toggleExpand', id }), []),
    collapseAll: useCallback(() => dispatch({ type: 'collapseAll' }), []),
  };
}
