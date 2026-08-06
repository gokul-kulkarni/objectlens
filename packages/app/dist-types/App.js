import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * App shell.
 *
 * Holds the layout and owns the state that views share. It resolves which view to render from the
 * registry rather than importing one directly — the switcher lists whatever is registered and can
 * render the current graph, so a new view appears without this file changing.
 */
import { useMemo } from 'react';
import { InMemoryNodeSource } from '@objectlens/core';
import { views } from './registry.js';
import { useViewer } from './state/useViewer.js';
import { InputPanel } from './components/InputPanel.jsx';
import { Inspector } from './components/Inspector.jsx';
import { DiagnosticsPanel } from './components/DiagnosticsPanel.jsx';
import { Search, Spinner } from '@objectlens/icons';
import { ResizeHandle } from './components/ResizeHandle.jsx';
import { PANEL_LIMITS, usePanelSizes } from './state/usePanelSizes.js';
const EMPTY_MATCHES = new Set();
export function App() {
    const viewer = useViewer();
    const { sizes, setPanel, adjustPanel, resetPanel } = usePanelSizes();
    const { state, detections, effectiveAdapterId, searchResult } = viewer;
    const nodeSource = useMemo(() => (state.graph === null ? null : new InMemoryNodeSource(state.graph)), [state.graph]);
    const available = useMemo(() => (state.graph === null ? [] : views.available(state.graph)), [state.graph]);
    const active = available.find((view) => view.id === state.viewId) ?? available[0];
    return (_jsxs("div", { className: "flex h-full flex-col bg-slate-900 text-[color:var(--color-ink)]", children: [_jsxs("header", { className: "flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-2", children: [_jsxs("h1", { className: "text-sm font-semibold tracking-tight", children: ["Object", _jsx("span", { className: "text-[color:var(--color-brand)]", children: "Lens" })] }), _jsx("p", { className: "hidden text-xs text-[color:var(--color-ink-subtle)] sm:block", children: "Explore Python objects, JSON and more" }), state.graph !== null && (_jsxs("div", { className: "ml-auto flex items-center gap-3 text-xs text-[color:var(--color-ink-subtle)]", children: [_jsxs("span", { className: "tabular", children: [state.graph.nodesById.size.toLocaleString(), " nodes \u00B7 ", Math.round(state.elapsedMs), " ms"] }), available.length > 1 && (_jsx("div", { className: "flex overflow-hidden rounded border border-slate-700", children: available.map((view) => (_jsx("button", { type: "button", title: view.description, "aria-pressed": view.id === active?.id, className: `cursor-pointer px-2 py-0.5 transition-colors duration-150 ${view.id === active?.id
                                        ? 'bg-sky-700 text-white'
                                        : 'text-[color:var(--color-ink-muted)] hover:bg-slate-800'}`, onClick: () => viewer.setView(view.id), children: view.label }, view.id))) }))] }))] }), _jsxs("main", { className: "flex min-h-0 flex-1 flex-col lg:flex-row", children: [_jsx("div", { className: "min-h-0 shrink-0 border-b border-slate-800 lg:w-[var(--left-panel)] lg:border-b-0", style: { '--left-panel': `${sizes.left}px` }, children: _jsx(InputPanel, { text: state.text, detections: detections, adapterId: state.adapterId, effectiveAdapterId: effectiveAdapterId, status: state.status, onChangeText: viewer.setInput, onChangeAdapter: viewer.setAdapter, onParse: viewer.parse }) }), _jsx(ResizeHandle, { label: "Resize input panel", value: sizes.left, min: PANEL_LIMITS.left.min, max: PANEL_LIMITS.left.max, side: "left", onResize: (width) => setPanel('left', width), onAdjust: (delta) => adjustPanel('left', delta), onReset: () => resetPanel('left') }), _jsxs("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col", children: [_jsxs("div", { className: "flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-1.5", children: [_jsxs("div", { className: "relative min-w-0 flex-1", children: [_jsx(Search, { className: "pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--color-ink-subtle)]" }), _jsx("input", { type: "search", "aria-label": "Search", placeholder: "Search keys and values\u2026", className: "w-full rounded border border-slate-800 bg-slate-950 py-1 pl-7 pr-2 text-xs transition-colors duration-150 outline-none focus:border-sky-700", value: state.query, onChange: (event) => viewer.setQuery(event.target.value) })] }), searchResult !== null && (_jsxs("span", { role: "status", "aria-live": "polite", className: "tabular shrink-0 text-[11px] text-[color:var(--color-ink-subtle)]", children: [searchResult.matches.size, searchResult.truncated ? '+' : '', " match", searchResult.matches.size === 1 ? '' : 'es'] }))] }), _jsx("div", { className: "min-h-0 flex-1", children: state.graph !== null && nodeSource !== null && active !== undefined ? (_jsx(active.Component, { graph: state.graph, nodeSource: nodeSource, selection: state.selection, onSelect: viewer.select, expanded: state.expanded, onToggleExpand: viewer.toggleExpand, query: state.query, matches: searchResult?.matches ?? EMPTY_MATCHES })) : (_jsx(EmptyState, { status: state.status })) }), _jsx(DiagnosticsPanel, { diagnostics: state.diagnostics, onSelect: viewer.select })] }), _jsx(ResizeHandle, { label: "Resize inspector panel", value: sizes.right, min: PANEL_LIMITS.right.min, max: PANEL_LIMITS.right.max, side: "right", onResize: (width) => setPanel('right', width), onAdjust: (delta) => adjustPanel('right', delta), onReset: () => resetPanel('right') }), _jsx("div", { className: "min-h-0 shrink-0 border-t border-slate-800 lg:w-[var(--right-panel)] lg:border-t-0", style: { '--right-panel': `${sizes.right}px` }, children: state.graph !== null ? (_jsx(Inspector, { graph: state.graph, selection: state.selection, onSelect: viewer.select })) : (_jsx("p", { className: "p-3 text-xs text-[color:var(--color-ink-subtle)]", children: "No object loaded." })) })] })] }));
}
function EmptyState({ status }) {
    if (status === 'parsing') {
        return (_jsxs("div", { role: "status", "aria-live": "polite", className: "flex items-center gap-2 p-6 text-sm text-[color:var(--color-ink-subtle)]", children: [_jsx(Spinner, { className: "text-base" }), "Parsing\u2026"] }));
    }
    if (status === 'failed') {
        return (_jsx("p", { role: "alert", className: "p-6 text-sm text-[color:var(--color-danger)]", children: "Nothing could be parsed from that input \u2014 see the diagnostics below." }));
    }
    return (_jsxs("div", { className: "max-w-md p-6 text-sm text-[color:var(--color-ink-subtle)]", children: [_jsxs("p", { className: "mb-3 leading-relaxed", children: ["Paste a Python ", _jsx("code", { className: "font-mono text-[color:var(--color-node-scalar)]", children: "repr()" }), ' ', "dump or some JSON on the left, then press", ' ', _jsx("kbd", { className: "rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-[color:var(--color-ink-muted)]", children: "\u2318\u23CE" }), "."] }), _jsx("p", { className: "text-xs leading-relaxed", children: "Or load one of the examples below the input \u2014 they cover cycles, bignums, and deliberately malformed text." })] }));
}
//# sourceMappingURL=App.js.map