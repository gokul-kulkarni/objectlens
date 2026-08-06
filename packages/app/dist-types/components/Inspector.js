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
import { Check, ChevronSeparator, Copy } from '@objectlens/icons';
export function Inspector({ graph, selection, onSelect }) {
    const [copied, setCopied] = useState(null);
    if (selection === null) {
        return _jsx("p", { className: "p-3 text-xs text-[color:var(--color-ink-subtle)]", children: "Select a node to inspect it." });
    }
    const node = graph.nodesById.get(selection);
    if (node === undefined) {
        return _jsx("p", { className: "p-3 text-xs text-[color:var(--color-ink-subtle)]", children: "That node is no longer in the graph." });
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
    return (_jsxs("div", { className: "flex h-full flex-col gap-3 overflow-auto p-3 text-xs", children: [_jsxs("div", { children: [_jsx("h2", { className: "mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]", children: "Breadcrumb" }), _jsx("div", { className: "flex flex-wrap items-center gap-1", children: ancestors.map((id, index) => (_jsxs("span", { className: "flex items-center gap-1", children: [index > 0 && (_jsx(ChevronSeparator, { className: "text-[9px] text-[color:var(--color-ink-faint)]" })), _jsx("button", { type: "button", className: "cursor-pointer rounded px-1 font-mono text-[11px] text-[color:var(--color-label-key)] transition-colors duration-150 hover:bg-slate-800", onClick: () => onSelect(id), children: index === 0 ? '$' : (graph.labelById.get(id) ?? '?') })] }, id))) })] }), _jsxs("div", { children: [_jsx("h2", { className: "mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]", children: "Path" }), _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("code", { className: "min-w-0 flex-1 break-all rounded bg-slate-950 p-1.5 text-[11px] text-[color:var(--color-ink-muted)]", children: node.id }), _jsxs("button", { type: "button", "aria-label": "Copy path", disabled: !addressable, title: addressable
                                    ? 'Copy path'
                                    : 'This position has no access expression — it is inside a set, a dict key, or a positional argument', className: "flex shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-700 px-1.5 py-1 text-[11px] text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30", onClick: () => copy('path', node.id), children: [copied === 'path' ? _jsx(Check, { className: "text-[color:var(--color-node-scalar)]" }) : _jsx(Copy, {}), copied === 'path' ? 'Copied' : 'Copy'] })] }), !addressable && (_jsx("p", { className: "mt-1 text-[11px] text-[color:var(--color-ink-subtle)]", children: "No access expression: this value sits inside a set, a dict key, or a positional argument, so there is nothing that would evaluate to it." }))] }), _jsxs("div", { children: [_jsx("h2", { className: "mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]", children: "Type" }), _jsxs("p", { className: "font-mono text-[11px] text-[color:var(--color-ink-muted)]", children: [typeLabel(node), " ", _jsxs("span", { className: "text-[color:var(--color-ink-subtle)]", children: ["(", node.kind, ")"] })] }), node.kind === 'opaque' && node.address !== undefined && (_jsxs("p", { className: "mt-0.5 font-mono text-[11px] text-[color:var(--color-ink-subtle)]", children: ["at ", node.address] })), node.kind === 'scalar' && node.raw !== undefined && String(node.value) !== node.raw && (_jsxs("p", { className: "mt-1 text-[11px] text-amber-300/80", children: ["Exact source text differs from the parsed value \u2014 displaying", ' ', _jsx("code", { className: "text-amber-200", children: node.raw }), "."] }))] }), fullValue !== '' && (_jsxs("div", { className: "min-h-0", children: [_jsxs("h2", { className: "mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]", children: ["Value", _jsxs("button", { type: "button", "aria-label": "Copy value", className: "flex cursor-pointer items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] normal-case text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800", onClick: () => copy('value', fullValue), children: [copied === 'value' ? _jsx(Check, { className: "text-[color:var(--color-node-scalar)]" }) : _jsx(Copy, {}), copied === 'value' ? 'Copied' : 'Copy'] })] }), _jsx("pre", { className: "max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-1.5 text-[11px] text-emerald-300", children: fullValue })] }))] }));
}
//# sourceMappingURL=Inspector.js.map