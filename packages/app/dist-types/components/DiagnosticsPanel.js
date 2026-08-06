import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Parse diagnostics.
 *
 * Shown as a collapsed strip rather than a blocking error: partial input still produced a usable
 * graph, so the reader gets the graph *and* an honest account of what could not be read.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, ErrorIcon, WarningIcon } from '@objectlens/icons';
export function DiagnosticsPanel({ diagnostics, onSelect }) {
    const [open, setOpen] = useState(false);
    if (diagnostics.length === 0)
        return null;
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = diagnostics.length - errors;
    return (_jsxs("div", { className: "border-t border-slate-800 bg-slate-900/60 text-xs", children: [_jsxs("button", { type: "button", className: "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-slate-800/60", onClick: () => setOpen((value) => !value), "aria-expanded": open, children: [open ? (_jsx(ChevronDown, { className: "shrink-0 text-[color:var(--color-ink-subtle)]" })) : (_jsx(ChevronRight, { className: "shrink-0 text-[color:var(--color-ink-subtle)]" })), errors > 0 && _jsxs("span", { className: "text-[color:var(--color-danger)]", children: [errors, " error", errors === 1 ? '' : 's'] }), warnings > 0 && (_jsxs("span", { className: "text-[color:var(--color-caution)]", children: [warnings, " warning", warnings === 1 ? '' : 's'] })), _jsx("span", { className: "text-[color:var(--color-ink-subtle)]", children: "\u2014 the rest of the input was parsed normally" })] }), open && (_jsx("ul", { className: "max-h-40 overflow-auto border-t border-slate-800", children: diagnostics.map((diagnostic, index) => (_jsxs("li", { className: "flex items-start gap-2 border-b border-slate-800/60 px-3 py-1 last:border-0", children: [diagnostic.severity === 'error' ? (_jsx(ErrorIcon, { title: "Error", className: "mt-0.5 shrink-0 text-[color:var(--color-danger)]" })) : (_jsx(WarningIcon, { title: "Warning", className: "mt-0.5 shrink-0 text-[color:var(--color-caution)]" })), diagnostic.line !== undefined && (_jsxs("span", { className: "shrink-0 font-mono text-[color:var(--color-ink-subtle)]", children: [diagnostic.line, ":", diagnostic.column ?? 1] })), _jsx("span", { className: "text-[color:var(--color-ink-muted)]", children: diagnostic.message }), diagnostic.nodeId !== undefined && (_jsx("button", { type: "button", className: "ml-auto shrink-0 cursor-pointer rounded text-[color:var(--color-brand)] hover:underline", onClick: () => onSelect(diagnostic.nodeId), children: "show" }))] }, `${diagnostic.message}-${index}`))) }))] }));
}
//# sourceMappingURL=DiagnosticsPanel.js.map