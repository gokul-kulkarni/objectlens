// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildGraph } from '@objectlens/core';
import { TEST_SOURCE, entry, int, map, scalar, seq, set, str } from '@objectlens/core/testing';
import { Inspector } from './Inspector.jsx';

const graph = buildGraph(
  map('$', [
    entry(str('$@key0', 'n'), int(`$['n']`, 2)),
    entry(str('$@key1', 'tags'), set(`$['tags']`, [str(`$['tags']@item0`, 'x')])),
    entry(str('$@key2', 'big'), int(`$['big']`, 9007199254740992, '9007199254740993')),
    entry(
      str('$@key3', 'users'),
      seq(`$['users']`, [str(`$['users'][0]`, 'ada')]),
    ),
  ]),
  TEST_SOURCE,
);

function renderInspector(selection: string | null) {
  const onSelect = vi.fn();
  render(<Inspector graph={graph} selection={selection} onSelect={onSelect} />);
  return { onSelect };
}

describe('empty and missing states', () => {
  it('prompts when nothing is selected', () => {
    renderInspector(null);
    expect(screen.getByText(/select a node/i)).toBeDefined();
  });

  it('says so when the selection is not in the graph', () => {
    renderInspector('$.gone');
    expect(screen.getByText(/no longer in the graph/i)).toBeDefined();
  });
});

describe('path', () => {
  it('shows the access path for the selected node', () => {
    renderInspector(`$['n']`);
    expect(screen.getByText(`$['n']`)).toBeDefined();
  });

  it('enables copy for an addressable path', () => {
    renderInspector(`$['n']`);
    expect(screen.getByRole('button', { name: 'Copy path' }).hasAttribute('disabled')).toBe(false);
  });

  it('disables copy and explains why for a set member', () => {
    // Offering "copy path" here would hand the reader an expression that does not evaluate.
    renderInspector(`$['tags']@item0`);

    expect(screen.getByRole('button', { name: 'Copy path' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/no access expression/i)).toBeDefined();
  });

  it('copies the path to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderInspector(`$['n']`);
    await userEvent.click(screen.getByRole('button', { name: 'Copy path' }));

    expect(writeText).toHaveBeenCalledWith(`$['n']`);
  });
});

describe('breadcrumb', () => {
  it('shows the chain from the root to the selection', () => {
    renderInspector(`$['users'][0]`);

    expect(screen.getByRole('button', { name: '$' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'users' })).toBeDefined();
  });

  it('navigates when a crumb is clicked', async () => {
    const { onSelect } = renderInspector(`$['users'][0]`);

    await userEvent.click(screen.getByRole('button', { name: 'users' }));

    expect(onSelect).toHaveBeenCalledWith(`$['users']`);
  });
});

describe('type and value', () => {
  it('shows the type name and kind', () => {
    renderInspector(`$['n']`);
    expect(screen.getByText(/int/)).toBeDefined();
  });

  it('warns when the exact source text differs from the parsed value', () => {
    // A bignum silently rounded is the failure this whole `raw` mechanism exists to prevent,
    // so the inspector has to say the displayed number is not the parsed one.
    renderInspector(`$['big']`);

    // The exact text appears twice — in the warning and in the value block — so the assertion
    // is scoped to the warning rather than matching whichever one happens to come first.
    const warning = screen.getByText(/differs from the parsed value/i);
    expect(within(warning).getByText('9007199254740993')).toBeDefined();
  });

  it('does not warn when value and text agree', () => {
    renderInspector(`$['n']`);
    expect(screen.queryByText(/differs from the parsed value/i)).toBeNull();
  });

  it('offers no value block for a container, which has no single value', () => {
    renderInspector(`$['users']`);

    expect(screen.getByRole('button', { name: 'Copy path' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Copy value' })).toBeNull();
  });

  it('distinguishes the two copy buttons for assistive tech', () => {
    renderInspector(`$['n']`);

    expect(screen.getByRole('button', { name: 'Copy path' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeDefined();
  });
});

describe('opaque nodes', () => {
  it('shows the heap address when the repr carried one', () => {
    const withAddress = buildGraph(
      map('$', [
        entry(str('$@key0', 'o'), {
          id: `$['o']`,
          kind: 'opaque' as const,
          source: TEST_SOURCE,
          text: '<Foo object at 0x7f9a>',
          typeName: 'Foo',
          address: '0x7f9a',
        }),
      ]),
      TEST_SOURCE,
    );

    render(<Inspector graph={withAddress} selection={`$['o']`} onSelect={vi.fn()} />);

    // Shown both as the dedicated address line and inside the full repr.
    expect(screen.getAllByText(/0x7f9a/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^at /)).toBeDefined();
  });
});

describe('scalar spellings', () => {
  it('renders the source language spelling of null', () => {
    const pythonish = buildGraph(
      map('$', [entry(str('$@key0', 'x'), scalar(`$['x']`, 'null', null, 'None'))]),
      TEST_SOURCE,
    );

    render(<Inspector graph={pythonish} selection={`$['x']`} onSelect={vi.fn()} />);

    // `None` rather than `null`: the viewer renders the source language's own spelling.
    expect(screen.getAllByText('None').length).toBeGreaterThan(0);
  });
});
