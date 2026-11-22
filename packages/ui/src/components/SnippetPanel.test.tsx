// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SnippetPanel } from './SnippetPanel.jsx';

const disclosure = () => screen.getByRole('button', { name: /live Python object/i });

function withClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

describe('SnippetPanel', () => {
  it('starts collapsed, because most visitors do not have this question yet', () => {
    render(<SnippetPanel />);

    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Copy snippet' })).toBeNull();
  });

  it('reveals the snippet when asked', () => {
    render(<SnippetPanel />);
    fireEvent.click(disclosure());

    expect(disclosure().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Copy snippet' })).toBeDefined();
  });

  it('shows the real snippet, not a paraphrase of it', () => {
    // The file is imported raw so there is exactly one copy of it in the repository. A hand-typed
    // duplicate here is how the page ends up offering a version that no longer works.
    render(<SnippetPanel />);
    fireEvent.click(disclosure());

    const text = document.querySelector('pre')?.textContent ?? '';
    expect(text).toContain('def lens(');
    expect(text).toContain('objectlens-snippet/');
  });

  it('copies the snippet and confirms it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    withClipboard(writeText);

    render(<SnippetPanel />);
    fireEvent.click(disclosure());
    // The confirmation lands in a microtask after the clipboard promise settles, so the click has
    // to be awaited inside act or React reports the update as untracked.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy snippet' }));
    });

    expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined();
    expect(writeText.mock.calls[0]?.[0]).toContain('def lens(');
  });

  it('stays usable when the clipboard is denied', async () => {
    // Permission can be refused outright. The snippet is on screen and selectable, so the
    // fallback is the text itself rather than a stuck "Copied" that lied.
    withClipboard(() => Promise.reject(new Error('denied')));

    render(<SnippetPanel />);
    fireEvent.click(disclosure());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy snippet' }));
    });

    expect(screen.getByRole('button', { name: 'Copy snippet' })).toBeDefined();
    expect(document.querySelector('pre')?.textContent).toContain('def lens(');
  });
});
