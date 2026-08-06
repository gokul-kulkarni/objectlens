import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Parse diagnostics.
 *
 * Shown as a collapsed strip rather than a blocking error: partial input still produced a usable
 * graph, so the reader gets the graph *and* an honest account of what could not be read.
 */
import { useState } from 'react';
export function DiagnosticsPanel({ diagnostics, onSelect }) {
    const [open, setOpen] = useState(false);
    if (diagnostics.length === 0)
        return null;
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = diagnostics.length - errors;
    return (_jsxs("div", { className: "border-t border-slate-800 bg-slate-900/60 text-xs", children: [_jsxs("button", { type: "button", className: "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/60", onClick: () => setOpen((value) => !value), "aria-expanded": open, children: [_jsx("span", { className: "text-slate-500", children: open ? '▾' : '▸' }), errors > 0 && _jsxs("span", { className: "text-rose-400", children: [errors, " error", errors === 1 ? '' : 's'] }), warnings > 0 && (_jsxs("span", { className: "text-amber-400", children: [warnings, " warning", warnings === 1 ? '' : 's'] })), _jsx("span", { className: "text-slate-500", children: "\u2014 the rest of the input was parsed normally" })] }), open && (_jsx("ul", { className: "max-h-40 overflow-auto border-t border-slate-800", children: diagnostics.map((diagnostic, index) => (_jsxs("li", { className: "flex gap-2 border-b border-slate-800/60 px-3 py-1 last:border-0", children: [_jsx("span", { className: diagnostic.severity === 'error' ? 'text-rose-400' : 'text-amber-400', children: diagnostic.severity === 'error' ? '✕' : '!' }), diagnostic.line !== undefined && (_jsxs("span", { className: "shrink-0 font-mono text-slate-500", children: [diagnostic.line, ":", diagnostic.column ?? 1] })), _jsx("span", { className: "text-slate-300", children: diagnostic.message }), diagnostic.nodeId !== undefined && (_jsx("button", { type: "button", className: "ml-auto shrink-0 text-sky-400 hover:underline", onClick: () => onSelect(diagnostic.nodeId), children: "show" }))] }, `${diagnostic.message}-${index}`))) }))] }));
}
//# sourceMappingURL=DiagnosticsPanel.js.map