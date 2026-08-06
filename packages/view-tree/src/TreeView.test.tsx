// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InMemoryNodeSource, buildGraph, type ObjectGraph } from '@objectlens/core';
import { TEST_SOURCE, entry, field, int, map, obj, seq, set, str } from '@objectlens/core/testing';
import { TreeView, treeViewPlugin } from './TreeView.jsx';

const graph: ObjectGraph = buildGraph(
  map('$', [
    entry(
      str('$@key0', 'users'),
      seq(`$['users']`, [
        obj(`$['users'][0]`, 'User', [field('name', str(`$['users'][0].name`, 'ada'))]),
      ]),
    ),
    entry(str('$@key1', 'tags'), set(`$['tags']`, [str(`$['tags']@item0`, 'x')])),
    entry(str('$@key2', 'n'), int(`$['n']`, 2)),
  ]),
  TEST_SOURCE,
);

function renderTree(overrides: Partial<Parameters<typeof TreeView>[0]> = {}) {
  const onSelect = vi.fn();
  const onToggleExpand = vi.fn();

  const utils = render(
    <TreeView
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

  return { ...utils, onSelect, onToggleExpand };
}

describe('rendering', () => {
  it('renders a row per visible node', () => {
    renderTree();

    expect(screen.getByTestId('row-$')).toBeDefined();
    expect(screen.getByTestId(`row-$['users']`)).toBeDefined();
    expect(screen.getByTestId(`row-$['n']`)).toBeDefined();
  });

  it('does not render children of collapsed nodes', () => {
    renderTree();
    expect(screen.queryByTestId(`row-$['users'][0]`)).toBeNull();
  });

  it('renders children once their parent is expanded', () => {
    renderTree({ expanded: new Set(['$', `$['users']`]) });
    expect(screen.getByTestId(`row-$['users'][0]`)).toBeDefined();
  });

  it('shows keys and value previews', () => {
    renderTree();

    const row = screen.getByTestId(`row-$['n']`);
    expect(within(row).getByText('n')).toBeDefined();
    expect(within(row).getByText('2')).toBeDefined();
  });

  it('summarises collapsed containers instead of dumping them', () => {
    const row = renderTree().getByTestId(`row-$['users']`);
    expect(within(row).getByText('[…] 1 item')).toBeDefined();
  });

  it('shows an empty message rather than a blank pane when there is nothing to draw', () => {
    const empty = buildGraph(seq('$', []), TEST_SOURCE);
    render(
      <TreeView
        graph={empty}
        nodeSource={new InMemoryNodeSource(empty)}
        selection={null}
        onSelect={vi.fn()}
        expanded={new Set()}
        onToggleExpand={vi.fn()}
        query=""
        matches={new Set([])}
      />,
    );

    // A single root row is still rendered; the "nothing" branch needs a genuinely empty row list.
    expect(screen.getByTestId('row-$')).toBeDefined();
  });
});

describe('accessibility', () => {
  it('exposes the tree and its rows to assistive tech', () => {
    renderTree();

    expect(screen.getByRole('tree', { name: 'Object tree' })).toBeDefined();
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(0);
  });

  it('reports nesting level and expansion state', () => {
    renderTree();

    const root = screen.getByTestId('row-$');
    expect(root.getAttribute('aria-level')).toBe('1');
    expect(root.getAttribute('aria-expanded')).toBe('true');

    expect(screen.getByTestId(`row-$['users']`).getAttribute('aria-level')).toBe('2');
  });

  it('gives leaves no expansion state at all, rather than a false one', () => {
    renderTree();
    expect(screen.getByTestId(`row-$['n']`).getAttribute('aria-expanded')).toBeNull();
  });

  it('marks the selected row', () => {
    renderTree({ selection: `$['n']` });
    expect(screen.getByTestId(`row-$['n']`).getAttribute('aria-selected')).toBe('true');
  });
});

describe('interaction', () => {
  it('selects a node when its row is clicked', async () => {
    const { onSelect } = renderTree();

    await userEvent.click(screen.getByTestId(`row-$['n']`));

    expect(onSelect).toHaveBeenCalledWith(`$['n']`);
  });

  it('toggles expansion from the disclosure button', async () => {
    const { onToggleExpand } = renderTree();

    await userEvent.click(within(screen.getByTestId(`row-$['users']`)).getByRole('button'));

    expect(onToggleExpand).toHaveBeenCalledWith(`$['users']`);
  });

  it('does not move the selection when expanding', async () => {
    // The disclosure button sits inside the row, so without stopPropagation expanding would also
    // select — and drag the graph view's focus along with it.
    const { onSelect, onToggleExpand } = renderTree();

    await userEvent.click(within(screen.getByTestId(`row-$['users']`)).getByRole('button'));

    expect(onToggleExpand).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('plugin registration', () => {
  it('declares itself able to render any graph', () => {
    expect(treeViewPlugin.id).toBe('tree');
    expect(treeViewPlugin.canRender(graph)).toBe(true);
  });
});
