/**
 * Which top-level mode is showing: the explorer, a comparison, or the Markdown viewer.
 *
 * Kept in the URL hash so a link can open straight into a mode, and so the browser's back button
 * moves between modes the way a reader expects. The hash is the only state here; each mode owns
 * everything else it needs.
 */

import { useCallback, useEffect, useState } from 'react';

export const MODES = [
  { id: 'explore', label: 'Explore', description: 'Explore one object as a tree or graph' },
  { id: 'compare', label: 'Compare', description: 'Compare two objects, in any formats' },
  { id: 'markdown', label: 'Markdown', description: 'Read a README or any Markdown, with Mermaid diagrams' },
] as const;

export type Mode = (typeof MODES)[number]['id'];

const DEFAULT_MODE: Mode = 'explore';

/** The mode a hash names, or the default for an empty or unknown hash. */
export function modeFromHash(hash: string): Mode {
  const name = hash.replace(/^#/, '');
  return MODES.find((mode) => mode.id === name)?.id ?? DEFAULT_MODE;
}

export function useMode() {
  const [mode, setModeState] = useState<Mode>(() => modeFromHash(globalThis.location?.hash ?? ''));

  useEffect(() => {
    const onHashChange = () => setModeState(modeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    // The default mode keeps a clean URL rather than a trailing `#explore`.
    const hash = next === DEFAULT_MODE ? '' : `#${next}`;
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  }, []);

  return { mode, setMode };
}
