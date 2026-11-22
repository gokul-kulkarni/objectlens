// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  PANEL_DEFAULTS,
  PANEL_LIMITS,
  clampPanel,
  fitToWidth,
  usePanelSizes,
} from './usePanelSizes.js';

const STORAGE_KEY = 'objectlens.panels.v1';

beforeEach(() => {
  localStorage.clear();
  window.innerWidth = 1600;
});

describe('clampPanel', () => {
  it('keeps values inside the panel limits', () => {
    expect(clampPanel('left', 10)).toBe(PANEL_LIMITS.left.min);
    expect(clampPanel('left', 99_999)).toBe(PANEL_LIMITS.left.max);
    expect(clampPanel('left', 400)).toBe(400);
  });

  it('rounds to whole pixels', () => {
    expect(clampPanel('left', 400.6)).toBe(401);
  });

  it('falls back to the default for a non-finite value', () => {
    // Reachable from corrupt storage; NaN would otherwise propagate into a CSS width. Infinity
    // is treated the same way — it is corrupt data, not a request for the maximum.
    expect(clampPanel('left', Number.NaN)).toBe(PANEL_DEFAULTS.left);
    expect(clampPanel('right', Number.POSITIVE_INFINITY)).toBe(PANEL_DEFAULTS.right);
  });
});

describe('fitToWidth', () => {
  it('leaves panels alone when they fit', () => {
    const sizes = { left: 384, right: 320 };
    expect(fitToWidth(sizes, 1600)).toEqual(sizes);
  });

  it('shrinks both panels when the centre would be squeezed out', () => {
    // Without this, narrowing the window leaves the centre at zero width and the handles
    // off-screen — unrecoverable without clearing storage.
    const fitted = fitToWidth({ left: 700, right: 600 }, 900);

    expect(fitted.left).toBeLessThan(700);
    expect(fitted.right).toBeLessThan(600);
  });

  it('takes proportionally more from the wider panel', () => {
    const fitted = fitToWidth({ left: 700, right: 300 }, 900);
    expect(700 - fitted.left).toBeGreaterThan(300 - fitted.right);
  });

  it('never shrinks a panel below its minimum', () => {
    const fitted = fitToWidth({ left: 700, right: 600 }, 100);

    expect(fitted.left).toBeGreaterThanOrEqual(PANEL_LIMITS.left.min);
    expect(fitted.right).toBeGreaterThanOrEqual(PANEL_LIMITS.right.min);
  });

  it('ignores a nonsensical available width', () => {
    const sizes = { left: 400, right: 300 };
    expect(fitToWidth(sizes, 0)).toEqual(sizes);
    expect(fitToWidth(sizes, Number.NaN)).toEqual(sizes);
  });
});

describe('usePanelSizes', () => {
  it('starts at the defaults with empty storage', () => {
    const { result } = renderHook(() => usePanelSizes());
    expect(result.current.sizes).toEqual(PANEL_DEFAULTS);
  });

  it('restores persisted sizes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: 500, right: 400 }));

    const { result } = renderHook(() => usePanelSizes());

    expect(result.current.sizes).toEqual({ left: 500, right: 400 });
  });

  it('persists a change', () => {
    const { result } = renderHook(() => usePanelSizes());

    act(() => result.current.setPanel('left', 512));

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ left: 512 });
  });

  it('clamps a value set beyond the limits', () => {
    const { result } = renderHook(() => usePanelSizes());

    act(() => result.current.setPanel('left', 99_999));

    expect(result.current.sizes.left).toBe(PANEL_LIMITS.left.max);
  });

  it('resets one panel without disturbing the other', () => {
    const { result } = renderHook(() => usePanelSizes());

    act(() => result.current.setPanel('left', 500));
    act(() => result.current.setPanel('right', 400));
    act(() => result.current.resetPanel('left'));

    expect(result.current.sizes.left).toBe(PANEL_DEFAULTS.left);
    expect(result.current.sizes.right).toBe(400);
  });

  describe('untrusted storage', () => {
    // localStorage is a boundary: the value can be stale from an older build or hand-edited.

    it.each([
      ['malformed JSON', 'not json at all'],
      ['a JSON primitive', '42'],
      ['null', 'null'],
      ['wrong value types', '{"left":"wide","right":[]}'],
      ['missing keys', '{}'],
    ])('falls back to defaults for %s', (_label, stored) => {
      localStorage.setItem(STORAGE_KEY, stored);

      const { result } = renderHook(() => usePanelSizes());

      expect(result.current.sizes).toEqual(PANEL_DEFAULTS);
    });

    it('clamps out-of-range stored values rather than trusting them', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: -900, right: 99_999 }));

      const { result } = renderHook(() => usePanelSizes());

      expect(result.current.sizes.left).toBe(PANEL_LIMITS.left.min);
      expect(result.current.sizes.right).toBe(PANEL_LIMITS.right.max);
    });
  });

  it('accumulates repeated nudges', () => {
    const { result } = renderHook(() => usePanelSizes());

    act(() => {
      // All inside one batch, as a held arrow key would be.
      result.current.adjustPanel('left', 16);
      result.current.adjustPanel('left', 16);
      result.current.adjustPanel('left', 16);
    });

    expect(result.current.sizes.left).toBe(PANEL_DEFAULTS.left + 48);
  });

  it('clamps a nudge at the limit rather than running past it', () => {
    const { result } = renderHook(() => usePanelSizes());

    act(() => result.current.adjustPanel('left', 99_999));

    expect(result.current.sizes.left).toBe(PANEL_LIMITS.left.max);
  });

  it('shrinks panels when the window is resized narrow', () => {
    const { result } = renderHook(() => usePanelSizes());

    act(() => result.current.setPanel('left', 700));
    act(() => {
      window.innerWidth = 800;
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.sizes.left).toBeLessThan(700);
  });
});
