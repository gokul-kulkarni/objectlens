/**
 * Viewer state.
 *
 * Selection, expansion and search live here rather than inside any view — that is what keeps the
 * tree and the graph in sync, and what lets a third-party view inherit that sync for free.
 *
 * Every transition returns new state; nothing is mutated in place.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { search, type Diagnostic, type NodeId, type ObjectGraph } from '@objectlens/core';
import { expandAll, initialExpansion, toggle } from '@objectlens/view-tree';
import { adapters } from '../registry.js';
import type { ParseRequest, ParseResponse } from '../worker/parse.worker.js';

export interface ViewerState {
  readonly text: string;
  readonly filename?: string;
  /** `null` means "auto-detect"; a string pins the user's explicit choice. */
  readonly adapterId: string | null;
  readonly graph: ObjectGraph | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly status: 'empty' | 'parsing' | 'ready' | 'failed';
  readonly elapsedMs: number;
  readonly selection: NodeId | null;
  readonly expanded: ReadonlySet<NodeId>;
  readonly query: string;
  readonly filterToMatches: boolean;
  readonly viewId: string;
}

type Action =
  | { type: 'setInput'; text: string; filename?: string }
  | { type: 'setAdapter'; adapterId: string | null }
  | { type: 'parseStarted' }
  | { type: 'parsed'; graph: ObjectGraph | null; diagnostics: readonly Diagnostic[]; elapsedMs: number }
  | { type: 'select'; id: NodeId | null }
  | { type: 'toggleExpand'; id: NodeId }
  | { type: 'expand'; ids: Iterable<NodeId> }
  | { type: 'setQuery'; query: string }
  | { type: 'setFilterToMatches'; enabled: boolean }
  | { type: 'setView'; viewId: string };

const initialState: ViewerState = {
  text: '',
  adapterId: null,
  graph: null,
  diagnostics: [],
  status: 'empty',
  elapsedMs: 0,
  selection: null,
  expanded: new Set(),
  query: '',
  filterToMatches: false,
  viewId: 'tree',
};

function reducer(state: ViewerState, action: Action): ViewerState {
  switch (action.type) {
    case 'setInput':
      return {
        ...state,
        text: action.text,
        ...(action.filename === undefined ? {} : { filename: action.filename }),
      };

    case 'setAdapter':
      return { ...state, adapterId: action.adapterId };

    case 'parseStarted':
      return { ...state, status: 'parsing' };

    case 'parsed':
      return {
        ...state,
        graph: action.graph,
        diagnostics: action.diagnostics,
        elapsedMs: action.elapsedMs,
        status: action.graph === null ? 'failed' : 'ready',
        // A new graph invalidates positions from the old one.
        selection: null,
        expanded: action.graph === null ? new Set() : initialExpansion(action.graph),
      };

    case 'select':
      return { ...state, selection: action.id };

    case 'toggleExpand':
      return { ...state, expanded: toggle(state.expanded, action.id) };

    case 'expand':
      return { ...state, expanded: expandAll(state.expanded, action.ids) };

    case 'setQuery':
      return { ...state, query: action.query };

    case 'setFilterToMatches':
      return { ...state, filterToMatches: action.enabled };

    case 'setView':
      return { ...state, viewId: action.viewId };
  }
}

export function useViewer() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('../worker/parse.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event: MessageEvent<ParseResponse>) => {
      // Ignore responses from superseded requests, or fast typing shows stale results.
      if (event.data.id !== requestId.current) return;

      dispatch({
        type: 'parsed',
        graph: event.data.graph,
        diagnostics: event.data.diagnostics,
        elapsedMs: event.data.elapsedMs,
      });
    });

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  /** Adapters ranked for the current input — drives both auto-detection and the picker. */
  const detections = useMemo(() => {
    if (state.text.trim() === '') return [];
    return adapters.detect(
      state.filename === undefined ? { text: state.text } : { text: state.text, filename: state.filename },
    );
  }, [state.text, state.filename]);

  const effectiveAdapterId = state.adapterId ?? detections[0]?.adapter.id ?? null;

  const parse = useCallback(() => {
    const worker = workerRef.current;
    if (worker === null || effectiveAdapterId === null || state.text.trim() === '') return;

    requestId.current += 1;
    dispatch({ type: 'parseStarted' });

    const request: ParseRequest = {
      id: requestId.current,
      adapterId: effectiveAdapterId,
      text: state.text,
      ...(state.filename === undefined ? {} : { filename: state.filename }),
    };
    worker.postMessage(request);
  }, [effectiveAdapterId, state.text, state.filename]);

  const searchResult = useMemo(() => {
    if (state.graph === null || state.query.trim() === '') return null;
    return search(state.graph, state.query, { maxResults: 5_000 });
  }, [state.graph, state.query]);

  // Reveal matches as they are found, so a hit deep in a collapsed subtree is actually visible.
  useEffect(() => {
    if (searchResult !== null && searchResult.reveal.size > 0) {
      dispatch({ type: 'expand', ids: searchResult.reveal });
    }
  }, [searchResult]);

  return {
    state,
    detections,
    effectiveAdapterId,
    searchResult,
    parse,
    setInput: useCallback(
      (text: string, filename?: string) =>
        dispatch(filename === undefined ? { type: 'setInput', text } : { type: 'setInput', text, filename }),
      [],
    ),
    setAdapter: useCallback((adapterId: string | null) => dispatch({ type: 'setAdapter', adapterId }), []),
    select: useCallback((id: NodeId | null) => dispatch({ type: 'select', id }), []),
    toggleExpand: useCallback((id: NodeId) => dispatch({ type: 'toggleExpand', id }), []),
    setQuery: useCallback((query: string) => dispatch({ type: 'setQuery', query }), []),
    setFilterToMatches: useCallback(
      (enabled: boolean) => dispatch({ type: 'setFilterToMatches', enabled }),
      [],
    ),
    setView: useCallback((viewId: string) => dispatch({ type: 'setView', viewId }), []),
  };
}
