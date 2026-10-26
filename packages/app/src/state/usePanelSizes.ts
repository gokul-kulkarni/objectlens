/**
 * Side panel widths.
 *
 * Persisted, because a layout you have to re-drag on every reload is more annoying than a fixed
 * one. `localStorage` is an untrusted boundary — the value can be stale from an older build, or
 * hand-edited — so what comes back is validated and clamped rather than believed.
 */

import { useCallback, useEffect, useState } from 'react';

export interface PanelSizes {
  readonly left: number;
  readonly right: number;
}

export type PanelSide = keyof PanelSizes;

export const PANEL_DEFAULTS: PanelSizes = { left: 384, right: 320 };

export const PANEL_LIMITS: Readonly<Record<PanelSide, { min: number; max: number }>> = {
  left: { min: 240, max: 760 },
  right: { min: 220, max: 640 },
};

/** The centre view stops being usable below this, so the side panels yield first. */
const MIN_CENTRE = 320;

const STORAGE_KEY = 'objectlens.panels.v1';

export function clampPanel(side: PanelSide, value: number): number {
  const { min, max } = PANEL_LIMITS[side];
  if (!Number.isFinite(value)) return PANEL_DEFAULTS[side];
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * Shrinks the panels when the window cannot fit them plus a usable centre.
 *
 * Without this, narrowing the window leaves the centre view at zero width with no way to recover
 * except dragging a handle that is now off-screen.
 */
export function fitToWidth(sizes: PanelSizes, available: number): PanelSizes {
  if (!Number.isFinite(available) || available <= 0) return sizes;

  const overflow = sizes.left + sizes.right + MIN_CENTRE - available;
  if (overflow <= 0) return sizes;

  // Take from the wider panel first, so one huge panel does not squeeze a small one to nothing.
  const shrinkable = sizes.left + sizes.right;
  if (shrinkable <= 0) return sizes;

  return {
    left: clampPanel('left', sizes.left - (overflow * sizes.left) / shrinkable),
    right: clampPanel('right', sizes.right - (overflow * sizes.right) / shrinkable),
  };
}

function readStored(): PanelSizes {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return PANEL_DEFAULTS;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return PANEL_DEFAULTS;

    const { left, right } = parsed as Partial<Record<PanelSide, unknown>>;

    return {
      left: clampPanel('left', typeof left === 'number' ? left : PANEL_DEFAULTS.left),
      right: clampPanel('right', typeof right === 'number' ? right : PANEL_DEFAULTS.right),
    };
  } catch {
    // Malformed JSON, or storage blocked entirely by a privacy setting. Neither is worth an error.
    return PANEL_DEFAULTS;
  }
}

export function usePanelSizes() {
  const [sizes, setSizes] = useState<PanelSizes>(readStored);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(sizes));
    } catch {
      // Storage can be full or blocked; losing the preference is not worth breaking the app.
    }
  }, [sizes]);

  // Keep the centre usable as the window narrows.
  useEffect(() => {
    const onResize = () => setSizes((current) => fitToWidth(current, window.innerWidth));

    window.addEventListener('resize', onResize);
    onResize();

    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setPanel = useCallback((side: PanelSide, value: number) => {
    setSizes((current) =>
      fitToWidth({ ...current, [side]: clampPanel(side, value) }, window.innerWidth),
    );
  }, []);

  /**
   * Nudges a panel by a delta.
   *
   * Separate from `setPanel` because keyboard input is inherently *relative* while dragging is
   * absolute. Computing from the latest state matters when a held arrow key fires several times
   * inside one frame — reading a captured prop there would collapse them all into a single step.
   */
  const adjustPanel = useCallback((side: PanelSide, delta: number) => {
    setSizes((current) =>
      fitToWidth({ ...current, [side]: clampPanel(side, current[side] + delta) }, window.innerWidth),
    );
  }, []);

  const resetPanel = useCallback((side: PanelSide) => {
    setSizes((current) => ({ ...current, [side]: PANEL_DEFAULTS[side] }));
  }, []);

  return { sizes, setPanel, adjustPanel, resetPanel };
}

/** What `usePanelSizes` returns — shared by every mode, so panel widths carry across them. */
export type PanelControls = ReturnType<typeof usePanelSizes>;
