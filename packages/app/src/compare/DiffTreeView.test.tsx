// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ParseResult } from '@objectlens/core';
import { jsonAdapter } from '@objectlens/adapter-json';
import { diffGraphs, indexDiff, initialDiffExpansion } from '@objectlens/diff';
import { DiffTreeView } from './DiffTreeView.jsx';
import { DiffDetail } from './DiffDetail.jsx';

const graph = (text: string) => {
  const parsed = (jsonAdapter.parse({ text }, {}) as ParseResult).graph;
  if (parsed === null) throw new Error('fixture failed to parse');
  return parsed;
};

const diff = diffGraphs(
  graph('{"same": 1, "changed": 1, "typed": 1, "gone": true, "rows": [{"id": 1}, {"id": 2}]}'),
  graph('{"same": 1, "changed": 2, "typed": "1", "added": [1], "rows": [{"id": 2}, {"id": 1}]}'),
  { arrayKey: 'id' },
);

function renderTree(overrides: Partial<Parameters<typeof DiffTreeView>[0]> = {}) {
  const onSelect = vi.fn();
  const onToggle = vi.fn();
  render(
    <div style={{ height: 600 }}>
      <DiffTreeView
        diff={diff}
        expanded={new Set(['$', '$["rows"]'])}
        onlyChanges={false}
        selection={null}
        onSelect={onSelect}
        onToggle={onToggle}
        {...overrides}
      />
    </div>,
  );
  return { onSelect, onToggle };
}

// jsdom has no layout, so the virtualiser sees a zero-height viewport; give it one.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });

describe('DiffTreeView', () => {
  it('names each row with its status, not only its colour', () => {
    renderTree();

    expect(screen.getByRole('treeitem', { name: 'changed, changed' })).toBeDefined();
    expect(screen.getByRole('treeitem', { name: 'gone, removed' })).toBeDefined();
    expect(screen.getByRole('treeitem', { name: 'added, added' })).toBeDefined();
    expect(screen.getByRole('treeitem', { name: 'same, unchanged' })).toBeDefined();
  });

  it('shows both sides of a changed value and flags a type change', () => {
    renderTree();
    const row = screen.getByTestId('diff-row-$["typed"]');
    expect(row.textContent).toContain('1');
    expect(row.textContent).toContain("'1'");
    expect(row.textContent).toContain('int → string');
  });

  it('shows when a keyed record moved', () => {
    renderTree();
    expect(screen.getByTestId('diff-row-$["rows"]@where(id=1)').textContent).toContain('moved 0 → 1');
  });

  it('hides unchanged rows when filtering to changes', () => {
    renderTree({ onlyChanges: true });
    expect(screen.queryByTestId('diff-row-$["same"]')).toBeNull();
    expect(screen.getByTestId('diff-row-$["changed"]')).toBeDefined();
  });

  it('selects on click and toggles without selecting', async () => {
    const { onSelect, onToggle } = renderTree();

    await userEvent.click(screen.getByTestId('diff-row-$["changed"]'));
    expect(onSelect).toHaveBeenCalledWith('$["changed"]');

    onSelect.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse rows' }));
    expect(onToggle).toHaveBeenCalledWith('$["rows"]');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the selected row', () => {
    renderTree({ selection: '$["gone"]', expanded: initialDiffExpansion(diff) });
    expect(screen.getByTestId('diff-row-$["gone"]').getAttribute('aria-selected')).toBe('true');
  });
});

describe('DiffDetail', () => {
  const index = indexDiff(diff);

  it('asks for a selection when there is none', () => {
    render(<DiffDetail node={undefined} />);
    expect(screen.getByText('Select a row to see both sides.')).toBeDefined();
  });

  it('shows the path, the status and both values', () => {
    render(<DiffDetail node={index.byId.get('$["typed"]')} />);

    expect(screen.getByText('$["typed"]')).toBeDefined();
    expect(screen.getByText(/the type changed/)).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText("'1'")).toBeDefined();
  });

  it('says a side is missing for an addition', () => {
    render(<DiffDetail node={index.byId.get('$["added"]')} />);
    expect(screen.getByText('Added on the right')).toBeDefined();
    expect(screen.getByText('Not present')).toBeDefined();
  });

  it('disables copying a path that is not an access expression', () => {
    render(<DiffDetail node={index.byId.get('$["rows"]@where(id=1)')} />);
    expect(screen.getByRole('button', { name: 'Copy path' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/moved from index 0 to 1/)).toBeDefined();
  });

  it('copies an addressable path', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<DiffDetail node={index.byId.get('$["changed"]')} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy path' }));
    expect(writeText).toHaveBeenCalledWith('$["changed"]');
  });
});
