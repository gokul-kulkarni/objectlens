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
const EMPTY_MATCHES = new Set();
export function App() {
    const viewer = useViewer();
    const { state, detections, effectiveAdapterId, searchResult } = viewer;
    const nodeSource = useMemo(() => (state.graph === null ? null : new InMemoryNodeSource(state.graph)), [state.graph]);
    const available = useMemo(() => (state.graph === null ? [] : views.available(state.graph)), [state.graph]);
    const active = available.find((view) => view.id === state.viewId) ?? available[0];
    return (_jsxs("div", { className: "flex h-full flex-col bg-slate-900 text-slate-200", children: [_jsxs("header", { className: "flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-2", children: [_jsxs("h1", { className: "text-sm font-semibold tracking-tight", children: ["Object", _jsx("span", { className: "text-sky-400", children: "Lens" })] }), _jsx("p", { className: "hidden text-xs text-slate-500 sm:block", children: "Explore Python objects, JSON and more" }), state.graph !== null && (_jsxs("div", { className: "ml-auto flex items-center gap-3 text-xs text-slate-500", children: [_jsxs("span", { children: [state.graph.nodesById.size.toLocaleString(), " nodes \u00B7 ", Math.round(state.elapsedMs), " ms"] }), available.length > 1 && (_jsx("div", { className: "flex overflow-hidden rounded border border-slate-700", children: available.map((view) => (_jsx("button", { type: "button", title: view.description, className: `px-2 py-0.5 ${view.id === active?.id
                                        ? 'bg-sky-600 text-white'
                                        : 'text-slate-300 hover:bg-slate-800'}`, onClick: () => viewer.setView(view.id), children: view.label }, view.id))) }))] }))] }), _jsxs("main", { className: "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,26rem)_1fr_minmax(240px,20rem)]", children: [_jsx("div", { className: "min-h-0 border-b border-slate-800 lg:border-b-0 lg:border-r", children: _jsx(InputPanel, { text: state.text, detections: detections, adapterId: state.adapterId, effectiveAdapterId: effectiveAdapterId, status: state.status, onChangeText: viewer.setInput, onChangeAdapter: viewer.setAdapter, onParse: viewer.parse }) }), _jsxs("div", { className: "flex min-h-0 flex-col", children: [_jsxs("div", { className: "flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-1.5", children: [_jsx("input", { type: "search", "aria-label": "Search", placeholder: "Search keys and values\u2026", className: "min-w-0 flex-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-sky-700", value: state.query, onChange: (event) => viewer.setQuery(event.target.value) }), searchResult !== null && (_jsxs("span", { className: "shrink-0 text-[11px] text-slate-500", children: [searchResult.matches.size, searchResult.truncated ? '+' : '', " match", searchResult.matches.size === 1 ? '' : 'es'] }))] }), _jsx("div", { className: "min-h-0 flex-1", children: state.graph !== null && nodeSource !== null && active !== undefined ? (_jsx(active.Component, { graph: state.graph, nodeSource: nodeSource, selection: state.selection, onSelect: viewer.select, expanded: state.expanded, onToggleExpand: viewer.toggleExpand, query: state.query, matches: searchResult?.matches ?? EMPTY_MATCHES })) : (_jsx(EmptyState, { status: state.status })) }), _jsx(DiagnosticsPanel, { diagnostics: state.diagnostics, onSelect: viewer.select })] }), _jsx("div", { className: "min-h-0 border-t border-slate-800 lg:border-l lg:border-t-0", children: state.graph !== null ? (_jsx(Inspector, { graph: state.graph, selection: state.selection, onSelect: viewer.select })) : (_jsx("p", { className: "p-3 text-xs text-slate-500", children: "No object loaded." })) })] })] }));
}
function EmptyState({ status }) {
    if (status === 'parsing') {
        return _jsx("p", { className: "p-6 text-sm text-slate-500", children: "Parsing\u2026" });
    }
    if (status === 'failed') {
        return (_jsx("p", { className: "p-6 text-sm text-rose-400", children: "Nothing could be parsed from that input \u2014 see the diagnostics below." }));
    }
    return (_jsxs("div", { className: "p-6 text-sm text-slate-500", children: [_jsxs("p", { className: "mb-3", children: ["Paste a Python ", _jsx("code", { className: "text-slate-300", children: "repr()" }), " dump or some JSON on the left, then press ", _jsx("kbd", { className: "rounded border border-slate-700 px-1", children: "\u2318\u23CE" }), "."] }), _jsx("p", { className: "text-xs", children: "Or load one of the examples to see what it does." })] }));
}
//# sourceMappingURL=App.js.map