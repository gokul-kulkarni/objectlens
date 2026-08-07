/**
 * The node-link graph view plugin.
 *
 * Answers the question the tree cannot: *what points at what*. A tree has to redraw a shared
 * object once per route to it and can only say "shared" in words; here the second route is a line
 * you can follow back to the one card that object lives on.
 *
 * All the judgement lives in `layout.ts` and `elements.ts`, which are pure and tested directly.
 * This file is wiring: it holds the canvas, forwards clicks, and re-fits when a new graph arrives.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { childrenOf, type NodeId, type ViewPlugin, type ViewProps } from '@objectlens/core';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react';
// The full stylesheet, not `base.css`: the extra 5 kB is the styling for the zoom controls and
// minimap, which would otherwise render as unstyled browser buttons.
import '@xyflow/react/dist/style.css';
import { layout } from './layout.js';
import { fitViewport } from './viewport.js';
import { LENS_NODE_TYPE, miniMapColor, toFlowEdges, toFlowNodes, type LensFlowNode } from './elements.js';
import { GraphCallbacksContext, GraphNodeCard } from './GraphNodeCard.jsx';

// Defined at module scope on purpose: a fresh object here would make the canvas rebuild every
// card on every render, and it warns about exactly that.
const NODE_TYPES: NodeTypes = { [LENS_NODE_TYPE]: GraphNodeCard };

export function GraphView(props: ViewProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({ graph, selection, onSelect, expanded, onToggleExpand, matches }: ViewProps) {
  const { setViewport } = useReactFlow();
  const paneRef = useRef<HTMLDivElement>(null);

  const shape = useMemo(() => layout(graph, { expanded, matches }), [graph, expanded, matches]);
  const nodes = useMemo(() => toFlowNodes(shape, selection), [shape, selection]);
  const edges = useMemo(() => toFlowEdges(shape), [shape]);

  // A new parse is a new picture, and the previous viewport almost certainly points at empty
  // space. Expanding within the same graph deliberately does *not* re-fit — yanking the camera
  // while someone is reading is worse than letting them pan.
  useEffect(() => {
    const pane = paneRef.current?.getBoundingClientRect();
    if (pane === undefined) return;

    setViewport(fitViewport(shape, pane));
    // `shape` is intentionally absent: refitting on every expand would move the camera out from
    // under the reader. Only a new graph resets it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, setViewport]);

  const callbacks = useMemo(() => ({ onToggleExpand }), [onToggleExpand]);

  const handleNodeClick = useCallback<NodeMouseHandler<LensFlowNode>>(
    (_event, node) => onSelect(node.id as NodeId),
    [onSelect],
  );

  const handlePaneClick = useCallback(() => onSelect(null), [onSelect]);

  if (nodes.length === 0) {
    return <p className="p-4 text-sm text-[color:var(--color-ink-subtle)]">Nothing to show.</p>;
  }

  return (
    <GraphCallbacksContext.Provider value={callbacks}>
      <div ref={paneRef} className="h-full w-full" data-testid="graph-canvas">
        <ReactFlow<LensFlowNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          minZoom={0.05}
          maxZoom={2}
          // Positions are computed, so the pointer may pan and select but never rearrange.
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          // At the node cap this is ~1,200 cards; culling keeps panning smooth on a laptop.
          onlyRenderVisibleElements
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          aria-label="Object graph"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-line)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={miniMapColor}
            maskColor="rgb(15 23 42 / 0.7)"
            // Smaller than the 200×150 default: the canvas often sits in a narrow middle pane,
            // where the default overview covers a third of it.
            style={{ width: 140, height: 100 }}
            className="rounded! border! border-slate-700! bg-slate-900!"
          />
          {shape.truncated && (
            <Panel position="top-right">
              <p
                role="status"
                className="rounded border border-amber-400/40 bg-slate-900/95 px-2 py-1 text-[11px] text-[color:var(--color-caution)]"
              >
                Too large to draw in full — collapse a branch to see the rest.
              </p>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </GraphCallbacksContext.Provider>
  );
}

export const graphViewPlugin: ViewPlugin = {
  id: 'graph',
  label: 'Graph',
  description: 'See containment and shared references as a node-link diagram.',
  // A scalar has no structure to diagram, and a one-card canvas is a worse rendering of it than
  // a single tree row. Declining here is what keeps the switcher honest.
  canRender: (graph) => childrenOf(graph.root).length > 0,
  Component: GraphView,
};
