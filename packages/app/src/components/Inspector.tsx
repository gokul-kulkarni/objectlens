/**
 * Detail panel for the selected node: its access path, type, and full value.
 *
 * The path is the payload here — "which expression gets me this value" is the question a debugging
 * session actually needs answered, and the tree row can only show a truncated preview.
 */

import { useState } from 'react';
import { isAddressable, pathTo, type NodeId, type ObjectGraph } from '@objectlens/core';
import { formatScalar, typeLabel } from '@objectlens/view-tree';
import { Check, ChevronSeparator, Copy } from '@objectlens/icons';

export interface InspectorProps {
  readonly graph: ObjectGraph;
  readonly selection: NodeId | null;
  readonly onSelect: (id: NodeId) => void;
}

export function Inspector({ graph, selection, onSelect }: InspectorProps) {
  const [copied, setCopied] = useState<string | null>(null);

  if (selection === null) {
    return <p className="p-3 text-xs text-[color:var(--color-ink-subtle)]">Select a node to inspect it.</p>;
  }

  const node = graph.nodesById.get(selection);
  if (node === undefined) {
    return <p className="p-3 text-xs text-[color:var(--color-ink-subtle)]">That node is no longer in the graph.</p>;
  }

  const addressable = isAddressable(node.id);
  const ancestors = pathTo(graph, node.id);

  const copy = (label: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  };

  const fullValue =
    node.kind === 'scalar'
      ? formatScalar(node)
      : node.kind === 'opaque'
        ? node.text
        : node.kind === 'ref'
          ? `→ ${node.target}`
          : '';

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-xs">
      <div>
        <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]">
          Breadcrumb
        </h2>
        <div className="flex flex-wrap items-center gap-1">
          {ancestors.map((id, index) => (
            <span key={id} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronSeparator className="text-[9px] text-[color:var(--color-ink-faint)]" />
              )}
              <button
                type="button"
                className="cursor-pointer rounded px-1 font-mono text-[11px] text-[color:var(--color-label-key)] transition-colors duration-150 hover:bg-slate-800"
                onClick={() => onSelect(id)}
              >
                {index === 0 ? '$' : (graph.labelById.get(id) ?? '?')}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]">
          Path
        </h2>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-slate-950 p-1.5 text-[11px] text-[color:var(--color-ink-muted)]">
            {node.id}
          </code>
          <button
            type="button"
            aria-label="Copy path"
            disabled={!addressable}
            title={
              addressable
                ? 'Copy path'
                : 'This position has no access expression — it is inside a set, a dict key, or a positional argument'
            }
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-700 px-1.5 py-1 text-[11px] text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => copy('path', node.id)}
          >
            {copied === 'path' ? <Check className="text-[color:var(--color-node-scalar)]" /> : <Copy />}
            {copied === 'path' ? 'Copied' : 'Copy'}
          </button>
        </div>
        {!addressable && (
          <p className="mt-1 text-[11px] text-[color:var(--color-ink-subtle)]">
            No access expression: this value sits inside a set, a dict key, or a positional
            argument, so there is nothing that would evaluate to it.
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]">
          Type
        </h2>
        <p className="font-mono text-[11px] text-[color:var(--color-ink-muted)]">
          {typeLabel(node)} <span className="text-[color:var(--color-ink-subtle)]">({node.kind})</span>
        </p>
        {node.kind === 'opaque' && node.address !== undefined && (
          <p className="mt-0.5 font-mono text-[11px] text-[color:var(--color-ink-subtle)]">at {node.address}</p>
        )}
        {node.kind === 'scalar' && node.raw !== undefined && String(node.value) !== node.raw && (
          <p className="mt-1 text-[11px] text-amber-300/80">
            Exact source text differs from the parsed value — displaying{' '}
            <code className="text-amber-200">{node.raw}</code>.
          </p>
        )}
      </div>

      {fullValue !== '' && (
        <div className="min-h-0">
          <h2 className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]">
            Value
            <button
              type="button"
              aria-label="Copy value"
              className="flex cursor-pointer items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] normal-case text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800"
              onClick={() => copy('value', fullValue)}
            >
              {copied === 'value' ? <Check className="text-[color:var(--color-node-scalar)]" /> : <Copy />}
              {copied === 'value' ? 'Copied' : 'Copy'}
            </button>
          </h2>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-1.5 text-[11px] text-emerald-300">
            {fullValue}
          </pre>
        </div>
      )}
    </div>
  );
}
