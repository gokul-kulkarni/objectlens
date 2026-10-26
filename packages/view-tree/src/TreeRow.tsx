/**
 * One row of the tree.
 *
 * Deliberately dumb: it renders what it is given and reports clicks upward. All state — selection,
 * expansion — lives in the app store, which is what keeps the tree and the graph in sync.
 *
 * Colours come from the shared node-kind tokens rather than literal Tailwind classes, so the
 * graph view will render a scalar the same green without duplicating the mapping.
 */

import { elide, isAddressable, preview, typeLabel, type ChildRelation, type Node } from '@objectlens/core';
import { Bullet, ChevronDown, ChevronRight, Cycle, Dot, NoPath, SharedRef } from '@objectlens/icons';
import type { TreeRow as Row } from './rows.js';

const INDENT_PX = 14;

export interface TreeRowProps {
  readonly row: Row;
  readonly isSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
}

export function TreeRowView({ row, isSelected, onSelect, onToggle }: TreeRowProps) {
  const { node, label, relation, depth, hasChildren, isExpanded, isMatch } = row;
  const addressable = isAddressable(node.id);

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
        // A 16px glyph is a poor target, so the button carries padding and a negative margin:
        // the hit area grows without the row getting taller.
        className={`-my-1 shrink-0 rounded p-1 transition-colors duration-150 ${
          hasChildren
            ? 'cursor-pointer text-ink-subtle hover:bg-surface-hover/60 hover:text-ink'
            : 'pointer-events-none text-[color:var(--color-ink-faint)]'
        }`}
        onClick={(event) => {
          // Without this the row's own onSelect would fire too, so expanding would also move
          // the selection — and with it the graph view's focus.
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

      {label !== '' &&
        (relation === 'item' && label === '•' ? (
          <Bullet className="shrink-0 text-[8px] text-[color:var(--color-label-index)]" />
        ) : (
          <>
            <span className={labelClass(relation)}>{label}</span>
            {/*
              A colon is punctuation, but it is still text content, so it has to clear 4.5:1 —
              `--color-ink-faint` measured 2.35:1 against the row. Kept at the subtle tier rather
              than dropped, because it is what separates a key from a value at a glance.
            */}
            <span className="text-[color:var(--color-ink-subtle)]">:</span>
          </>
        ))}

      <span className={`flex min-w-0 items-center gap-1 ${valueClass(node)}`}>
        {node.kind === 'ref' &&
          (node.cycle ? (
            <Cycle className="shrink-0 text-[11px]" />
          ) : (
            <SharedRef className="shrink-0 text-[11px]" />
          ))}
        <span className="truncate">{elide(preview(node))}</span>
      </span>

      <span className="tabular ml-auto shrink-0 pl-3 font-mono text-[10px] text-[color:var(--color-ink-subtle)]">
        {typeLabel(node)}
      </span>

      {!addressable && (
        // Set members and positional args have no access expression, so "copy path" would hand
        // the reader something that does not evaluate. Say so rather than offer a lie.
        <NoPath
          title="No access path — inside a set, a dict key, or a positional argument"
          className="shrink-0 text-[10px] text-[color:var(--color-ink-subtle)]"
        />
      )}
    </div>
  );
}

function rowClass(isSelected: boolean, isMatch: boolean): string {
  // `cursor-default` is deliberate: this is a file-explorer style list, where a pointer cursor on
  // every row reads as noise. The controls inside it do get `cursor-pointer`.
  const base =
    'flex items-center gap-1.5 whitespace-nowrap py-[3px] pr-2 font-mono text-xs cursor-default transition-colors duration-150';

  // 15%, not 25%: the type chip and container summary are `--color-ink-subtle`, which measured
  // 4.46:1 against a 25% tint — just under AA. The inset ring is the stronger selection cue
  // anyway, so lightening the fill costs nothing and buys 5.40:1.
  if (isSelected) return `${base} bg-brand/15 ring-1 ring-inset ring-brand/60`;
  if (isMatch) return `${base} bg-amber-400/15 hover:bg-amber-400/25`;
  return `${base} hover:bg-surface-raised/70`;
}

function labelClass(relation: ChildRelation | 'root'): string {
  const base = 'shrink-0';

  switch (relation) {
    case 'field':
      return `${base} text-[color:var(--color-label-field)]`;
    case 'key':
      return `${base} text-[color:var(--color-label-keynode)]`;
    case 'arg':
    case 'item':
      return `${base} text-[color:var(--color-label-index)]`;
    default:
      return `${base} text-[color:var(--color-label-key)]`;
  }
}

function valueClass(node: Node): string {
  const base = '';

  switch (node.kind) {
    case 'scalar':
      return `${base} text-[color:var(--color-node-scalar)]`;
    case 'opaque':
      return `${base} text-[color:var(--color-node-opaque)] italic`;
    case 'ref':
      return `${base} text-[color:var(--color-node-ref)]`;
    default:
      return `${base} text-[color:var(--color-node-container)]`;
  }
}
