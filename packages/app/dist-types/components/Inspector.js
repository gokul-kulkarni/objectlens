import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Detail panel for the selected node: its access path, type, and full value.
 *
 * The path is the payload here — "which expression gets me this value" is the question a debugging
 * session actually needs answered, and the tree row can only show a truncated preview.
 */
import { useState } from 'react';
import { isAddressable, pathTo } from '@objectlens/core';
import { formatScalar, typeLabel } from '@objectlens/view-tree';
export function Inspector({ graph, selection, onSelect }) {
    const [copied, setCopied] = useState(null);
    if (selection === null) {
        return _jsx("p", { className: "p-3 text-xs text-slate-500", children: "Select a node to inspect it." });
    }
    const node = graph.nodesById.get(selection);
    if (node === undefined) {
        return _jsx("p", { className: "p-3 text-xs text-slate-500", children: "That node is no longer in the graph." });
    }
    const addressable = isAddressable(node.id);
    const ancestors = pathTo(graph, node.id);
    const copy = (label, value) => {
        void navigator.clipboard.writeText(value).then(() => {
            setCopied(label);
            setTimeout(() => setCopied(null), 1200);
        });
    };
    const fullValue = node.kind === 'scalar'
        ? formatScalar(node)
        : node.kind === 'opaque'
            ? node.text
            : node.kind === 'ref'
                ? `→ ${node.target}`
                : '';
    return (_jsxs("div", { className: "flex h-full flex-col gap-3 overflow-auto p-3 text-xs", children: [_jsxs("div", { children: [_jsx("h2", { className: "mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500", children: "Breadcrumb" }), _jsx("div", { className: "flex flex-wrap items-center gap-1", children: ancestors.map((id, index) => (_jsxs("span", { className: "flex items-center gap-1", children: [index > 0 && _jsx("span", { className: "text-slate-700", children: "\u203A" }), _jsx("button", { type: "button", className: "rounded px-1 font-mono text-[11px] text-sky-300 hover:bg-slate-800", onClick: () => onSelect(id), children: index === 0 ? '$' : (graph.labelById.get(id) ?? '?') })] }, id))) })] }), _jsxs("div", { children: [_jsx("h2", { className: "mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500", children: "Path" }), _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("code", { className: "min-w-0 flex-1 break-all rounded bg-slate-950 p-1.5 text-[11px] text-slate-300", children: node.id }), _jsx("button", { type: "button", "aria-label": "Copy path", disabled: !addressable, title: addressable
                                    ? 'Copy path'
                                    : 'This position has no access expression — it is inside a set, a dict key, or a positional argument', className: "shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-30", onClick: () => copy('path', node.id), children: copied === 'path' ? 'Copied' : 'Copy' })] }), !addressable && (_jsx("p", { className: "mt-1 text-[11px] text-slate-500", children: "No access expression: this value sits inside a set, a dict key, or a positional argument, so there is nothing that would evaluate to it." }))] }), _jsxs("div", { children: [_jsx("h2", { className: "mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500", children: "Type" }), _jsxs("p", { className: "font-mono text-[11px] text-slate-300", children: [typeLabel(node), " ", _jsxs("span", { className: "text-slate-600", children: ["(", node.kind, ")"] })] }), node.kind === 'opaque' && node.address !== undefined && (_jsxs("p", { className: "mt-0.5 font-mono text-[11px] text-slate-500", children: ["at ", node.address] })), node.kind === 'scalar' && node.raw !== undefined && String(node.value) !== node.raw && (_jsxs("p", { className: "mt-1 text-[11px] text-amber-300/80", children: ["Exact source text differs from the parsed value \u2014 displaying", ' ', _jsx("code", { className: "text-amber-200", children: node.raw }), "."] }))] }), fullValue !== '' && (_jsxs("div", { className: "min-h-0", children: [_jsxs("h2", { className: "mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500", children: ["Value", _jsx("button", { type: "button", "aria-label": "Copy value", className: "rounded border border-slate-700 px-1 py-0 text-[10px] normal-case text-slate-300 hover:bg-slate-800", onClick: () => copy('value', fullValue), children: copied === 'value' ? 'Copied' : 'Copy' })] }), _jsx("pre", { className: "max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-1.5 text-[11px] text-emerald-300", children: fullValue })] }))] }));
}
//# sourceMappingURL=Inspector.js.map