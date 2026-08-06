// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseError, parseWarning } from '@objectlens/core';
import { DiagnosticsPanel } from './DiagnosticsPanel.jsx';

describe('visibility', () => {
  it('renders nothing when there are no diagnostics', () => {
    const { container } = render(<DiagnosticsPanel diagnostics={[]} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('summarises counts without expanding', () => {
    render(
      <DiagnosticsPanel
        diagnostics={[parseError('bad'), parseError('worse'), parseWarning('odd')]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('2 errors')).toBeDefined();
    expect(screen.getByText('1 warning')).toBeDefined();
  });

  it('says the rest of the input still parsed, because it did', () => {
    // The panel must not read as a total failure — a partial graph is the normal outcome.
    render(<DiagnosticsPanel diagnostics={[parseError('bad')]} onSelect={vi.fn()} />);
    expect(screen.getByText(/parsed normally/i)).toBeDefined();
  });

  it('uses singular wording for one item', () => {
    render(<DiagnosticsPanel diagnostics={[parseError('bad')]} onSelect={vi.fn()} />);
    expect(screen.getByText('1 error')).toBeDefined();
  });
});

describe('expansion', () => {
  it('starts collapsed and reveals messages when opened', async () => {
    render(<DiagnosticsPanel diagnostics={[parseError('unterminated string')]} onSelect={vi.fn()} />);

    expect(screen.queryByText('unterminated string')).toBeNull();

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('unterminated string')).toBeDefined();
  });

  it('shows line and column when the diagnostic carries a position', async () => {
    render(
      <DiagnosticsPanel
        diagnostics={[parseError('bad token', { line: 12, column: 5 })]}
        onSelect={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('12:5')).toBeDefined();
  });
});

describe('navigation', () => {
  it('jumps to the node a diagnostic points at', async () => {
    const onSelect = vi.fn();
    render(
      <DiagnosticsPanel
        diagnostics={[parseError('bad', { nodeId: `$['a']` })]}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { expanded: false }));
    await userEvent.click(screen.getByRole('button', { name: 'show' }));

    expect(onSelect).toHaveBeenCalledWith(`$['a']`);
  });

  it('offers no jump when the diagnostic has no node', async () => {
    render(<DiagnosticsPanel diagnostics={[parseError('bad')]} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.queryByRole('button', { name: 'show' })).toBeNull();
  });
});
