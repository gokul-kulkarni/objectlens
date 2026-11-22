// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { EditorApp } from './EditorApp.jsx';
import type { DocumentFeed } from './orca.js';

/** No `Worker` in jsdom, so the parse client falls back to the main thread — the same path a
 *  frame that refuses workers takes. */
function feedOf(text: string) {
  let listener: (text: string) => void = () => {};
  const feed: DocumentFeed = {
    text,
    subscribe: (next) => {
      listener = next;
      return { dispose: () => {} };
    },
  };
  return { feed, replace: (next: string) => act(() => listener(next)) };
}

describe('EditorApp', () => {
  it('shows the open file without being asked to parse', async () => {
    const { feed } = feedOf('{"name": "billing", "replicas": 3}');
    render(<EditorApp feed={feed} />);
    expect((await screen.findAllByText(/billing/)).length).toBeGreaterThan(0);
  });

  it('re-parses when the file changes outside the editor', async () => {
    const { feed, replace } = feedOf('name: billing\n');
    render(<EditorApp feed={feed} />);
    await screen.findAllByText(/billing/);

    replace('name: payments\n');
    expect((await screen.findAllByText(/payments/)).length).toBeGreaterThan(0);
  });

  it('points an empty file at Source', () => {
    const { feed } = feedOf('');
    render(<EditorApp feed={feed} />);
    expect(screen.getByText(/This file is empty/)).toBeTruthy();
  });
});
