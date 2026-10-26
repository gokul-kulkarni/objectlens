/**
 * The merged diff tree, virtualised like the explorer's tree — a diff of two large documents is
 * at least as many rows as either one.
 *
 * Scrolls the selection into view whenever it changes, which is what makes next/prev-change
 * navigation land on screen rather than somewhere below the fold.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { flattenDiff, type DiffResult } from '@objectlens/diff';
import { DiffRowView } from './DiffRow.jsx';

const ROW_HEIGHT = 22;
const OVERSCAN = 12;

export interface DiffTreeViewProps {
  readonly diff: DiffResult;
  readonly expanded: ReadonlySet<string>;
  readonly onlyChanges: boolean;
  readonly selection: string | null;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
}

export function DiffTreeView({ diff, expanded, onlyChanges, selection, onSelect, onToggle }: DiffTreeViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => flattenDiff(diff, { expanded, onlyChanges }), [diff, expanded, onlyChanges]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  useEffect(() => {
    if (selection === null) return;
    const index = rows.findIndex((row) => row.node.id === selection);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [selection, rows, virtualizer]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto" data-testid="diff-scroll">
      <div
        role="tree"
        aria-label="Differences"
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
              <DiffRowView row={row} isSelected={row.node.id === selection} onSelect={onSelect} onToggle={onToggle} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
