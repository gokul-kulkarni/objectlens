// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMarkdown } from './useMarkdown.js';

afterEach(() => vi.unstubAllGlobals());

describe('useMarkdown', () => {
  it('renders typed text after a short debounce', async () => {
    const { result } = renderHook(() => useMarkdown());

    act(() => result.current.setText('# Hello'));
    expect(result.current.text).toBe('# Hello');
    await waitFor(() => expect(result.current.rendered.headings).toEqual([{ depth: 1, text: 'Hello', id: 'user-content-hello' }]));
  });

  it('labels a document with its file or example name', () => {
    const { result } = renderHook(() => useMarkdown());

    act(() => result.current.setText('x', 'NOTES.md'));
    expect(result.current.label).toBe('NOTES.md');

    act(() => result.current.loadText('y', 'Example'));
    expect(result.current.label).toBe('Example');
    expect(result.current.text).toBe('y');
  });

  it('reports an unusable URL without fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useMarkdown());

    act(() => result.current.setUrl('ftp://example.com/x.md'));
    await act(() => result.current.load());

    expect(result.current.status).toEqual({ state: 'error', message: 'Only http and https URLs can be loaded.' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads a GitHub README and resolves its relative images against the repo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# Repo\n\n![logo](docs/logo.png)')));
    const { result } = renderHook(() => useMarkdown());

    act(() => result.current.setUrl('github.com/o/r'));
    await act(() => result.current.load());

    expect(result.current.status).toEqual({ state: 'idle' });
    expect(result.current.label).toBe('o/r');
    await waitFor(() => {
      const html = result.current.rendered.segments.map((segment) => (segment.kind === 'html' ? segment.html : '')).join('');
      expect(html).toContain('src="https://raw.githubusercontent.com/o/r/HEAD/docs/logo.png"');
    });
  });

  it('shows a fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const { result } = renderHook(() => useMarkdown());

    act(() => result.current.setUrl('https://example.com/missing.md'));
    await act(() => result.current.load());

    expect(result.current.status).toMatchObject({ state: 'error', message: expect.stringContaining('Not found') });
  });
});
