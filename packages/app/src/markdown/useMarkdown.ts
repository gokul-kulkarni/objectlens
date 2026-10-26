/**
 * Markdown mode state: the source text, where it came from, and a debounced render of it.
 *
 * Rendering is debounced rather than run per keystroke — highlighting a long README's code
 * blocks is not free — and each new fetch cancels the one before it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMarkdown } from './fetchMarkdown.js';
import { renderMarkdown, type RenderedMarkdown } from './render.js';
import { resolveSource, type Bases } from './resolveUrl.js';

const RENDER_DELAY_MS = 150;

export type FetchStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly message: string };

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useMarkdown() {
  const [text, setTextState] = useState('');
  const [label, setLabel] = useState<string | null>(null);
  const [bases, setBases] = useState<Bases | undefined>(undefined);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<FetchStatus>({ state: 'idle' });
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => () => inflight.current?.abort(), []);

  const debouncedText = useDebounced(text, RENDER_DELAY_MS);
  const rendered: RenderedMarkdown = useMemo(
    () => renderMarkdown(debouncedText, bases === undefined ? {} : { bases }),
    [debouncedText, bases],
  );

  /** Typing keeps the document's origin, so its relative links still resolve. */
  const setText = useCallback((next: string, filename?: string) => {
    setTextState(next);
    if (filename !== undefined) {
      // A local file has no origin to resolve against.
      setLabel(filename);
      setBases(undefined);
    }
  }, []);

  const loadText = useCallback((next: string, name: string) => {
    inflight.current?.abort();
    setTextState(next);
    setLabel(name);
    setBases(undefined);
    setStatus({ state: 'idle' });
  }, []);

  const load = useCallback(async () => {
    const resolved = resolveSource(url);
    if (!resolved.ok) {
      setStatus({ state: 'error', message: resolved.error });
      return;
    }

    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setStatus({ state: 'loading' });

    const result = await fetchMarkdown(resolved.source, { signal: controller.signal });
    if (controller.signal.aborted) return;

    if (!result.ok) {
      setStatus({ state: 'error', message: result.error });
      return;
    }
    setTextState(result.text);
    setLabel(resolved.source.label);
    setBases(resolved.source.bases);
    setStatus({ state: 'idle' });
  }, [url]);

  return { text, label, url, status, rendered, setText, loadText, setUrl, load };
}
