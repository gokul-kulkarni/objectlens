/**
 * One card on the canvas.
 *
 * As dumb as the tree's row, and for the same reason: selection and expansion live in the app
 * store, so a card only draws what it is handed and reports clicks upward. The toggle callback
 * arrives through context rather than through `data` — putting a closure in `data` would give the
 * node a new data object on every render and defeat the canvas's memoisation of every card.
 */

import { createContext, useContext } from 'react';
import { elide, preview, typeLabel, type NodeId } from '@objectlens/core';
import { ChevronDown, ChevronRight, Cycle, SharedRef } from '@objectlens/icons';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { REF_SOURCE_HANDLE, REF_TARGET_HANDLE, type LensFlowNode } from './elements.js';
import { nodeColor, relationColor } from './style.js';

export interface GraphCallbacks {
  readonly onToggleExpand: (id: NodeId) => void;
}

const NOOP_CALLBACKS: GraphCallbacks = { onToggleExpand: () => {} };

export const GraphCallbacksContext = createContext<GraphCallbacks>(NOOP_CALLBACKS);

/** Preview text is much shorter here than on a tree row — a card is 232px wide, not a full line. */
const MAX_PREVIEW = 48;

export function GraphNodeCard({ data, selected }: NodeProps<LensFlowNode>) {
  const { shape } = data;
  const { node, label, relation, hasChildren, isExpanded, isMatch, hiddenChildCount } = shape;
  const { onToggleExpand } = useContext(GraphCallbacksContext);

  return (
    <div
      data-testid={`card-${node.id}`}
      className={cardClass(selected === true, isMatch)}
      style={{ borderLeftColor: nodeColor(node) }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0!" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0!" />
      <Handle
        id={REF_TARGET_HANDLE}
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="opacity-0!"
      />
      <Handle
        id={REF_SOURCE_HANDLE}
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="opacity-0!"
      />

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={isExpanded ? `Collapse ${label || 'root'}` : `Expand ${label || 'root'}`}
          disabled={!hasChildren}
          className={`-m-1 shrink-0 rounded p-1 transition-colors duration-150 ${
            hasChildren
              ? 'cursor-pointer text-[color:var(--color-ink-subtle)] hover:bg-slate-700/60 hover:text-[color:var(--color-ink)]'
              : 'invisible'
          }`}
          onClick={(event) => {
            // The card's own click selects; without this, opening a node would also move the
            // selection — and the tree view's scroll position with it.
            event.stopPropagation();
            onToggleExpand(node.id);
          }}
        >
          {isExpanded ? <ChevronDown className="text-[9px]" /> : <ChevronRight className="text-[9px]" />}
        </button>

        <span
          className="truncate font-mono text-[11px]"
          style={{ color: relationColor(relation) }}
          title={label}
        >
          {label === '' ? '$' : label}
        </span>

        <span className="ml-auto shrink-0 truncate pl-1 font-mono text-[9px] text-[color:var(--color-ink-subtle)]">
          {typeLabel(node)}
        </span>
      </div>

      <div className="mt-0.5 flex items-center gap-1 pl-4">
        {node.kind === 'ref' &&
          (node.cycle ? (
            <Cycle className="shrink-0 text-[10px] text-[color:var(--color-caution)]" />
          ) : (
            <SharedRef className="shrink-0 text-[10px] text-[color:var(--color-node-ref)]" />
          ))}
        <span className="truncate font-mono text-[11px]" style={{ color: nodeColor(node) }}>
          {elide(preview(node), MAX_PREVIEW)}
        </span>
        {hiddenChildCount > 0 && !isExpanded && (
          <span className="tabular ml-auto shrink-0 rounded-full bg-slate-700/70 px-1.5 text-[9px] text-[color:var(--color-ink-muted)]">
            {hiddenChildCount}
          </span>
        )}
      </div>
    </div>
  );
}

function cardClass(selected: boolean, isMatch: boolean): string {
  const base =
    'h-full w-full overflow-hidden rounded-md border border-l-4 bg-slate-900/95 px-2 py-1.5 shadow-sm transition-colors duration-150';

  if (selected) return `${base} border-sky-400 ring-2 ring-sky-400/60`;
  if (isMatch) return `${base} border-amber-400/70 bg-amber-400/10`;
  return `${base} border-slate-700 hover:border-slate-500`;
}
