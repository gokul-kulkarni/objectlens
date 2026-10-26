/**
 * How wide the rendered document may grow.
 *
 * A fixed reading measure wastes most of a large monitor, but an unbounded one makes prose lines
 * too long to read comfortably — so it is the reader's choice, remembered in this browser.
 */

import { useCallback, useState } from 'react';

export const PREVIEW_WIDTHS = [
  { id: 'readable', label: 'Readable', description: 'A comfortable line length for prose' },
  { id: 'wide', label: 'Wide', description: 'Room for wide tables and diagrams' },
  { id: 'full', label: 'Full', description: 'Use the whole width of the window' },
] as const;

export type PreviewWidth = (typeof PREVIEW_WIDTHS)[number]['id'];

/** Tailwind max-width for each choice. Literal class names, so the class scanner can see them. */
export const PREVIEW_WIDTH_CLASS: Readonly<Record<PreviewWidth, string>> = {
  readable: 'max-w-3xl',
  wide: 'max-w-6xl',
  full: 'max-w-none',
};

const STORAGE_KEY = 'objectlens.markdown.width';
const DEFAULT_WIDTH: PreviewWidth = 'wide';

function isWidth(value: unknown): value is PreviewWidth {
  return PREVIEW_WIDTHS.some((width) => width.id === value);
}

function readStored(): PreviewWidth {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isWidth(value) ? value : DEFAULT_WIDTH;
  } catch {
    // Storage blocked by a privacy setting: fall back to the default rather than fail.
    return DEFAULT_WIDTH;
  }
}

export function usePreviewWidth() {
  const [width, setWidthState] = useState<PreviewWidth>(readStored);

  const setWidth = useCallback((next: PreviewWidth) => {
    setWidthState(next);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      // Losing the preference is not worth breaking the page.
    }
  }, []);

  return { width, setWidth };
}
