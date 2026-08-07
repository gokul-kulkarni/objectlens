// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InMemoryNodeSource, buildGraph, type ViewProps } from '@objectlens/core';
import { TEST_SOURCE, entry, int, ref, seq, str, map } from '@objectlens/core/testing';
import { GraphView, graphViewPlugin } from './GraphView.jsx';

const graph = buildGraph(
  map('$', [
    entry(str('$@key0', 'items'), seq(`$['items']`, [int(`$['items'][0]`, 1)])),
    entry(str('$@key1', 'again'), ref(`$['again']`, `$['items']`, false)),
  ]),
  TEST_SOURCE,
);

function renderView(overrides: Partial<ViewProps> = {}) {
  const onSelect = vi.fn();
  const onToggleExpand = vi.fn();

  const result = render(
    <GraphView
      graph={graph}
      nodeSource={new InMemoryNodeSource(graph)}
      selection={null}
      onSelect={onSelect}
      expanded={new Set(['$'])}
      onToggleExpand={onToggleExpand}
      query=""
      matches={new Set()}
      {...overrides}
    />,
  );

  return { ...result, onSelect, onToggleExpand };
}

describe('GraphView', () => {
  it('draws a card per visible node', () => {
    renderView();

    expect(screen.getByTestId('card-$')).toBeDefined();
    expect(screen.getByTestId(`card-$['items']`)).toBeDefined();
    expect(screen.getByTestId(`card-$['again']`)).toBeDefined();
  });

  it('does not draw nodes under a collapsed parent', () => {
    renderView();
    expect(screen.queryByTestId(`card-$['items'][0]`)).toBeNull();
  });

  it('reports a click on a card as a selection', () => {
    // `fireEvent` rather than `userEvent`: a full pointer sequence starts d3-zoom's pan gesture,
    // which reads `event.view.document` — and jsdom hands testing-library's synthetic mousedown a
    // null `view` on a non-configurable own property, so it cannot be stubbed. The click is what
    // this test is about; the pan gesture is the canvas library's business.
    const { onSelect } = renderView();

    fireEvent.click(screen.getByTestId(`card-$['items']`));
    expect(onSelect).toHaveBeenCalledWith(`$['items']`);
  });

  it('toggles expansion without also moving the selection', () => {
    // The disclosure control sits inside the card, so without stopPropagation opening a node
    // would drag the tree view's scroll position along with it.
    const { onSelect, onToggleExpand } = renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Expand items' }));

    expect(onToggleExpand).toHaveBeenCalledWith(`$['items']`);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the selected card, so selection made in the tree shows up here', () => {
    renderView({ selection: `$['items']` });

    expect(screen.getByTestId(`card-$['items']`).className).toContain('ring-2');
    expect(screen.getByTestId('card-$').className).not.toContain('ring-2');
  });

  it('badges a collapsed card with the number of children it is hiding', () => {
    // Without this a collapsed branch is indistinguishable from a leaf, and the picture quietly
    // understates how much data there is.
    renderView();
    expect(screen.getByTestId(`card-$['items']`).textContent).toContain('1');
  });

  it('shows a reference by its wording, not only by the edge', () => {
    // The edge can be off-screen or omitted entirely when its target is collapsed, so the card
    // has to carry the fact too.
    renderView();
    expect(screen.getByTestId(`card-$['again']`).textContent).toContain('shared');
  });

  it('gives a disclosure control only to cards with children', () => {
    renderView();

    expect(screen.getByRole('button', { name: 'Expand items' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Expand again/ })?.className).toContain('invisible');
  });

  it('renders nothing to select when the graph is empty of drawable nodes', () => {
    const empty = buildGraph(int('$', 1), TEST_SOURCE);
    renderView({ graph: empty, expanded: new Set() });

    expect(screen.getByTestId('card-$')).toBeDefined();
  });
});

describe('graphViewPlugin', () => {
  it('declines a graph with no structure, because one card is worse than one tree row', () => {
    expect(graphViewPlugin.canRender(buildGraph(int('$', 1), TEST_SOURCE))).toBe(false);
  });

  it('accepts anything with children', () => {
    expect(graphViewPlugin.canRender(graph)).toBe(true);
  });
});
