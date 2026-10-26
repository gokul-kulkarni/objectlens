/**
 * Detail for the selected position in a comparison: where it is, what happened, and both values
 * in full. The row can only show a one-line preview; this is where a changed record is read.
 */

import { useState } from 'react';
import { isAddressable, typeLabel, type Node } from '@objectlens/core';
import type { DiffNode } from '@objectlens/diff';
import { Check, Copy } from '@objectlens/icons';
import { formatValue } from './formatValue.js';

const STATUS_TEXT: Readonly<Record<DiffNode['status'], string>> = {
  same: 'Unchanged',
  modified: 'Contains changes',
  added: 'Added on the right',
  removed: 'Removed from the left',
  changed: 'Changed',
};

const HEADING = 'mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]';

export function DiffDetail({ node }: { readonly node: DiffNode | undefined }) {
  const [copied, setCopied] = useState(false);

  if (node === undefined) {
    return <p className="p-3 text-xs text-[color:var(--color-ink-subtle)]">Select a row to see both sides.</p>;
  }

  const addressable = isAddressable(node.id);
  const copyPath = () => {
    void navigator.clipboard.writeText(node.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-xs">
      <div>
        <h2 className={HEADING}>Path</h2>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-slate-950 p-1.5 text-[11px] text-[color:var(--color-ink-muted)]">
            {node.id}
          </code>
          <button
            type="button"
            aria-label="Copy path"
            disabled={!addressable}
            title={addressable ? 'Copy path' : 'This position has no access expression'}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-700 px-1.5 py-1 text-[11px] text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
            onClick={copyPath}
          >
            {copied ? <Check className="text-[color:var(--color-node-scalar)]" /> : <Copy />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div>
        <h2 className={HEADING}>Status</h2>
        <p className="text-[color:var(--color-ink-muted)]">
          {STATUS_TEXT[node.status]}
          {node.typeChanged === true && ' — the type changed, not just the value'}
          {node.moved !== undefined && ` — moved from index ${node.moved.from} to ${node.moved.to}`}
        </p>
      </div>

      <Side title="Left" node={node.left} tone="text-[color:var(--color-diff-removed)]" />
      <Side title="Right" node={node.right} tone="text-[color:var(--color-diff-added)]" />
    </div>
  );
}

function Side({ title, node, tone }: { readonly title: string; readonly node: Node | undefined; readonly tone: string }) {
  return (
    <div className="min-h-0">
      <h2 className={HEADING}>
        {title}
        {node !== undefined && (
          <span className="ml-2 font-mono normal-case tracking-normal text-[color:var(--color-ink-subtle)]">
            {typeLabel(node)}
          </span>
        )}
      </h2>
      {node === undefined ? (
        <p className="italic text-[color:var(--color-ink-subtle)]">Not present</p>
      ) : (
        <pre className={`max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-1.5 text-[11px] ${tone}`}>
          {formatValue(node)}
        </pre>
      )}
    </div>
  );
}
