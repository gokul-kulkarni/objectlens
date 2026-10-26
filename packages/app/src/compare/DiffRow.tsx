/**
 * One row of the merged diff tree.
 *
 * Status is carried three ways — a glyph, a colour, and the row's accessible name — so it never
 * depends on colour alone. A changed value shows both sides inline (`old → new`), which is what
 * makes a merged tree readable without a second pane.
 */

import { elide, preview, typeLabel } from '@objectlens/core';
import type { DiffRow as Row, DiffStatus } from '@objectlens/diff';
import { ChevronDown, ChevronRight, Dot } from '@objectlens/icons';

const INDENT_PX = 14;
const MAX_PREVIEW = 80;

const STATUS: Readonly<Record<DiffStatus, { glyph: string; word: string; tone: string; tint: string }>> = {
  same: { glyph: '', word: 'unchanged', tone: '', tint: '' },
  modified: { glyph: '', word: 'contains changes', tone: '', tint: '' },
  added: {
    glyph: '+',
    word: 'added',
    tone: 'text-[color:var(--color-diff-added)]',
    tint: 'bg-emerald-500/10',
  },
  removed: {
    glyph: '−',
    word: 'removed',
    tone: 'text-[color:var(--color-diff-removed)]',
    tint: 'bg-rose-500/10',
  },
  changed: {
    glyph: '~',
    word: 'changed',
    tone: 'text-[color:var(--color-diff-changed)]',
    tint: 'bg-amber-500/10',
  },
};

export interface DiffRowProps {
  readonly row: Row;
  readonly isSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
}

export function DiffRowView({ row, isSelected, onSelect, onToggle }: DiffRowProps) {
  const { node, depth, hasChildren, isExpanded } = row;
  const status = STATUS[node.status];
  const label = node.label === '' ? 'root' : node.label;

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-label={`${label}, ${status.word}`}
      data-testid={`diff-row-${node.id}`}
      data-status={node.status}
      className={`flex h-full cursor-pointer items-center gap-1.5 whitespace-nowrap pr-3 font-mono text-xs transition-colors duration-100 ${
        isSelected ? 'bg-accent-wash ring-1 ring-inset ring-brand' : `${status.tint} hover:bg-surface-raised/70`
      }`}
      style={{ paddingLeft: depth * INDENT_PX + 4 }}
      onClick={() => onSelect(node.id)}
    >
      <span aria-hidden className={`w-3 shrink-0 text-center font-semibold ${status.tone}`}>
        {status.glyph}
      </span>

      <button
        type="button"
        aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
        tabIndex={-1}
        className={`-my-1 shrink-0 rounded p-1 transition-colors duration-150 ${
          hasChildren
            ? 'cursor-pointer text-ink-subtle hover:bg-surface-hover/60 hover:text-ink'
            : 'pointer-events-none text-[color:var(--color-ink-faint)]'
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(node.id);
        }}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="text-[10px]" />
          ) : (
            <ChevronRight className="text-[10px]" />
          )
        ) : (
          <Dot className="text-[10px]" />
        )}
      </button>

      {node.label !== '' && (
        <>
          <span className={node.relation === 'field' ? 'text-[color:var(--color-label-field)]' : 'text-[color:var(--color-label-key)]'}>
            {node.label}
          </span>
          <span className="text-[color:var(--color-ink-subtle)]">:</span>
        </>
      )}

      <Values row={row} />

      {node.typeChanged === true && node.left !== undefined && node.right !== undefined && (
        <span className="rounded bg-amber-500/15 px-1 text-[10px] text-[color:var(--color-diff-changed)]">
          {typeLabel(node.left)} → {typeLabel(node.right)}
        </span>
      )}
      {node.moved !== undefined && (
        <span className="rounded bg-surface-raised px-1 text-[10px] text-[color:var(--color-ink-subtle)]">
          moved {node.moved.from} → {node.moved.to}
        </span>
      )}
      {node.status === 'modified' && (
        <span className="tabular text-[10px] text-[color:var(--color-ink-subtle)]">{summarise(row)}</span>
      )}
    </div>
  );
}

function Values({ row }: { readonly row: Row }) {
  const { node } = row;
  const show = (value: Parameters<typeof preview>[0]) => elide(preview(value), MAX_PREVIEW);

  if (node.status === 'changed' && node.left !== undefined && node.right !== undefined) {
    return (
      <>
        <span className="text-[color:var(--color-diff-removed)] line-through decoration-rose-300/60">{show(node.left)}</span>
        <span aria-hidden className="text-[color:var(--color-ink-subtle)]">→</span>
        <span className="text-[color:var(--color-diff-changed)]">{show(node.right)}</span>
      </>
    );
  }

  if (node.status === 'removed' && node.left !== undefined) {
    return <span className="text-[color:var(--color-diff-removed)] line-through decoration-rose-300/60">{show(node.left)}</span>;
  }

  const value = node.right ?? node.left;
  if (value === undefined) return null;
  const tone = node.status === 'added' ? 'text-[color:var(--color-diff-added)]' : 'text-[color:var(--color-ink-muted)]';
  return <span className={tone}>{show(value)}</span>;
}

function summarise(row: Row): string {
  const { added, removed, changed } = row.node.counts;
  return [
    added > 0 ? `+${added}` : '',
    removed > 0 ? `−${removed}` : '',
    changed > 0 ? `~${changed}` : '',
  ]
    .filter((part) => part !== '')
    .join(' ');
}
