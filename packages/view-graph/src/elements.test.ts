import { describe, expect, it } from 'vitest';
import { buildGraph } from '@objectlens/core';
import { TEST_SOURCE, int, ref, seq } from '@objectlens/core/testing';
import {
  LENS_NODE_TYPE,
  REF_SOURCE_HANDLE,
  REF_TARGET_HANDLE,
  miniMapColor,
  toFlowEdges,
  toFlowNodes,
} from './elements.js';
import { NODE_HEIGHT, NODE_WIDTH, layout } from './layout.js';

const graph = buildGraph(
  seq('$', [int('$[0]', 1), ref('$[1]', '$[0]', false), ref('$[2]', '$', true)]),
  TEST_SOURCE,
);

const shape = () => layout(graph, { expanded: new Set(['$']) });

describe('toFlowNodes', () => {
  it('positions each card where the layout put it', () => {
    const laid = shape();
    const nodes = toFlowNodes(laid, null);

    expect(nodes.map((node) => node.position)).toEqual(
      laid.nodes.map((node) => ({ x: node.x, y: node.y })),
    );
  });

  it('declares card dimensions up front', () => {
    // Without these the canvas routes every edge from the origin until it has measured the DOM,
    // which is a visible flash of wrong lines on first paint.
    const [node] = toFlowNodes(shape(), null);

    expect(node?.width).toBe(NODE_WIDTH);
    expect(node?.height).toBe(NODE_HEIGHT);
  });

  it('uses the custom card type so the built-in node renderer never appears', () => {
    expect(toFlowNodes(shape(), null).every((node) => node.type === LENS_NODE_TYPE)).toBe(true);
  });

  it('marks exactly the selected node, reflecting store state rather than canvas state', () => {
    const nodes = toFlowNodes(shape(), '$[1]');

    expect(nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(['$[1]']);
  });

  it('marks nothing when there is no selection', () => {
    expect(toFlowNodes(shape(), null).some((node) => node.selected)).toBe(false);
  });

  it('forbids dragging, because positions are computed and a drag would be undone', () => {
    expect(toFlowNodes(shape(), null).every((node) => node.draggable === false)).toBe(true);
  });
});

describe('toFlowEdges', () => {
  const edges = () => toFlowEdges(shape());
  const find = (id: string) => edges().find((edge) => edge.id.startsWith(id));

  it('routes containment through the default left/right handles', () => {
    const child = find('child:');

    expect(child?.type).toBe('smoothstep');
    expect(child?.sourceHandle).toBeUndefined();
    expect(child?.targetHandle).toBeUndefined();
  });

  it('routes references through their own vertical handles', () => {
    // Sharing the containment handles would send a back-edge looping right and around; leaving
    // downward and arriving from above keeps it legible.
    const reference = find('ref:');

    expect(reference?.sourceHandle).toBe(REF_SOURCE_HANDLE);
    expect(reference?.targetHandle).toBe(REF_TARGET_HANDLE);
    expect(reference?.type).toBe('default');
  });

  it('puts an arrowhead only on references', () => {
    // Containment direction is already unambiguous from the left-to-right layout, so arrowheads
    // there would be 1,200 pieces of noise.
    expect(find('child:')?.markerEnd).toBeUndefined();
    expect(find('ref:')?.markerEnd).toBeDefined();
  });

  it('draws references above containment so a crossing line stays readable', () => {
    expect(find('ref:')?.zIndex ?? 0).toBeGreaterThan(find('child:')?.zIndex ?? 0);
  });

  it('labels containment with the accessor and leaves references unlabelled', () => {
    expect(find('child:')?.label).toBe('0');
    expect(find('ref:')?.label).toBeUndefined();
  });

  it('never lets an edge steal selection from a node', () => {
    expect(edges().every((edge) => edge.selectable === false)).toBe(true);
  });

  it('gives a cycle a different stroke from a share', () => {
    const all = edges();
    const cycle = all.find((edge) => edge.source === '$[2]');
    const shared = all.find((edge) => edge.source === '$[1]');

    expect(cycle?.style?.stroke).not.toBe(shared?.style?.stroke);
  });
});

describe('miniMapColor', () => {
  it('highlights search matches, so the overview shows where the hits are', () => {
    const matched = layout(graph, { expanded: new Set(['$']), matches: new Set(['$[0]']) });
    const nodes = toFlowNodes(matched, null);

    const hit = nodes.find((node) => node.id === '$[0]');
    const miss = nodes.find((node) => node.id === '$[1]');

    expect(hit).toBeDefined();
    expect(miss).toBeDefined();
    expect(hit && miniMapColor(hit)).toBe('var(--color-caution)');
    expect(miss && miniMapColor(miss)).not.toBe('var(--color-caution)');
  });
});
