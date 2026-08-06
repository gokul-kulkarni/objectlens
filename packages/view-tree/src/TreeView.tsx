/**
 * The virtualised tree view plugin.
 *
 * Virtualisation is mandatory, not an optimisation: a 200k-row graph is an ordinary paste, and
 * rendering that many DOM nodes would hang the tab regardless of how fast the parser was.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ViewPlugin, ViewProps } from '@objectlens/core';
import { flatten } from './rows.js';
import { TreeRowView } from './TreeRow.jsx';

const ROW_HEIGHT = 22;
/** Rows rendered beyond the viewport, so fast scrolling does not show blank space. */
const OVERSCAN = 12;

export function TreeView({
  graph,
  selection,
  onSelect,
  expanded,
  onToggleExpand,
  matches,
}: ViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => flatten(graph, { expanded, matches }), [graph, expanded, matches]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);
  const handleToggle = useCallback((id: string) => onToggleExpand(id), [onToggleExpand]);

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Nothing to show.</p>;
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto" data-testid="tree-scroll">
      <div
        role="tree"
        aria-label="Object tree"
        className="relative w-max min-w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (row === undefined) return null;

          return (
            <div
              key={row.node.id}
              className="absolute left-0 top-0 w-full"
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
            >
              <TreeRowView
                row={row}
                isSelected={row.node.id === selection}
                onSelect={handleSelect}
                onToggle={handleToggle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const treeViewPlugin: ViewPlugin = {
  id: 'tree',
  label: 'Tree',
  description: 'Explore the object structure as a collapsible tree.',
  // The tree can render any graph — every IR node has a kind it knows how to draw.
  canRender: () => true,
  Component: TreeView,
};
