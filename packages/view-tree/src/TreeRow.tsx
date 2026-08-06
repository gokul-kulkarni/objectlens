/**
 * One row of the tree.
 *
 * Deliberately dumb: it renders what it is given and reports clicks upward. All state — selection,
 * expansion — lives in the app store, which is what keeps the tree and the graph in sync.
 */

import { isAddressable, type ChildRelation } from '@objectlens/core';
import type { TreeRow as Row } from './rows.js';
import { elide, preview, typeLabel } from './preview.js';

const INDENT_PX = 14;

export interface TreeRowProps {
  readonly row: Row;
  readonly isSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
}

export function TreeRowView({ row, isSelected, onSelect, onToggle }: TreeRowProps) {
  const { node, label, relation, depth, hasChildren, isExpanded, isMatch } = row;

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-expanded={hasChildren ? isExpanded : undefined}
      data-testid={`row-${node.id}`}
      className={rowClass(isSelected, isMatch)}
      style={{ paddingLeft: depth * INDENT_PX + 4 }}
      onClick={() => onSelect(node.id)}
    >
      <button
        type="button"
        aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
        tabIndex={-1}
        className={`w-4 shrink-0 text-slate-400 ${hasChildren ? 'hover:text-slate-100' : 'invisible'}`}
        onClick={(event) => {
          // Without this the row's own onSelect would fire too, so expanding would also move
          // the selection — and with it the graph view's focus.
          event.stopPropagation();
          onToggle(node.id);
        }}
      >
        {hasChildren ? (isExpanded ? '▾' : '▸') : '·'}
      </button>

      {label !== '' && <span className={labelClass(relation)}>{label}</span>}
      {label !== '' && <span className="text-slate-600">:</span>}

      <span className={valueClass(node.kind)}>{elide(preview(node))}</span>

      <span className="ml-auto shrink-0 pl-3 font-mono text-[10px] text-slate-500">
        {typeLabel(node)}
      </span>

      {!isAddressable(node.id) && (
        // Set members and positional args have no access expression, so "copy path" would hand
        // the reader something that does not evaluate. Say so rather than offer a lie.
        <span className="shrink-0 pl-1 text-[10px] text-slate-600" title="No access path">
          ⌀
        </span>
      )}
    </div>
  );
}

function rowClass(isSelected: boolean, isMatch: boolean): string {
  const base =
    'flex items-center gap-1.5 whitespace-nowrap py-[3px] pr-2 font-mono text-xs cursor-default';

  if (isSelected) return `${base} bg-sky-500/25 ring-1 ring-inset ring-sky-400/50`;
  if (isMatch) return `${base} bg-amber-400/15 hover:bg-amber-400/25`;
  return `${base} hover:bg-slate-700/40`;
}

function labelClass(relation: ChildRelation | 'root'): string {
  switch (relation) {
    case 'field':
      return 'shrink-0 text-violet-300';
    case 'key':
      return 'shrink-0 text-fuchsia-300';
    case 'arg':
      return 'shrink-0 text-slate-400';
    case 'item':
      return 'shrink-0 text-slate-500';
    default:
      return 'shrink-0 text-sky-300';
  }
}

function valueClass(kind: string): string {
  switch (kind) {
    case 'scalar':
      return 'truncate text-emerald-300';
    case 'opaque':
      return 'truncate text-orange-300/90 italic';
    case 'ref':
      return 'truncate text-rose-300';
    default:
      return 'truncate text-slate-400';
  }
}
