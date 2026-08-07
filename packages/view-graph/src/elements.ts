/**
 * Layout → canvas elements.
 *
 * Kept apart from the component so the interesting decisions — which handle an edge leaves from,
 * which edges get an arrowhead, what `selected` means — are assertable without mounting a canvas.
 * The component below is then thin enough that its own test only has to prove it renders.
 */

import type { NodeId } from '@objectlens/core';
import { MarkerType, type Edge, type Node as FlowNode } from '@xyflow/react';
import { NODE_HEIGHT, NODE_WIDTH, type GraphEdgeShape, type GraphLayout, type GraphNodeShape } from './layout.js';
import { edgeStyle } from './style.js';

/** Handle ids. Containment uses the unnamed left/right pair; references get their own vertical pair. */
export const REF_SOURCE_HANDLE = 'ref-out';
export const REF_TARGET_HANDLE = 'ref-in';

export const LENS_NODE_TYPE = 'lens';

export type LensNodeData = Record<string, unknown> & { readonly shape: GraphNodeShape };
export type LensFlowNode = FlowNode<LensNodeData, typeof LENS_NODE_TYPE>;

// Returns mutable arrays because the canvas's props are typed that way and it would otherwise
// force a defensive copy on every render. Each call builds a fresh array; nothing else holds one.
export function toFlowNodes(layout: GraphLayout, selection: NodeId | null): LensFlowNode[] {
  return layout.nodes.map((shape) => ({
    id: shape.id,
    type: LENS_NODE_TYPE,
    position: { x: shape.x, y: shape.y },
    data: { shape },
    selected: shape.id === selection,
    // Declared up front so the canvas can lay edges out before the DOM has been measured;
    // without it the first paint routes every edge from (0, 0).
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    // Positions come from the layout, so letting the pointer move a card would put it somewhere
    // the next expand would immediately undo.
    draggable: false,
    connectable: false,
    deletable: false,
  }));
}

export function toFlowEdges(layout: GraphLayout): Edge[] {
  return layout.edges.map(toFlowEdge);
}

function toFlowEdge(shape: GraphEdgeShape): Edge {
  const style = edgeStyle(shape.kind);
  const isRef = shape.kind !== 'child';

  return {
    id: shape.id,
    source: shape.source,
    target: shape.target,
    // Containment is orthogonal and tree-like, so a stepped route reads as hierarchy. A reference
    // is an arbitrary jump across the picture, where a curve is far easier to follow.
    type: isRef ? 'default' : 'smoothstep',
    ...(isRef
      ? { sourceHandle: REF_SOURCE_HANDLE, targetHandle: REF_TARGET_HANDLE }
      : {}),
    ...(shape.label === '' ? {} : { label: shape.label }),
    style,
    // Arrowheads only on references: containment direction is already unambiguous from the
    // left-to-right layout, and 1,200 arrowheads would be noise.
    ...(isRef
      ? { markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: style.stroke } }
      : {}),
    // References cross the containment tree, so they have to sit on top of it to stay readable.
    zIndex: isRef ? 1 : 0,
    selectable: false,
    focusable: false,
    labelShowBg: true,
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 3,
    labelStyle: { fill: 'var(--color-ink-subtle)', fontSize: 10 },
    labelBgStyle: { fill: 'var(--color-surface)', fillOpacity: 0.85 },
  };
}

/** Colour the minimap paints each card, so the overview still distinguishes kinds. */
export function miniMapColor(node: LensFlowNode): string {
  return node.data.shape.isMatch ? 'var(--color-caution)' : 'var(--color-line-strong)';
}
