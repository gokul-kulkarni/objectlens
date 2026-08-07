import { describe, expect, it } from 'vitest';
import { FIT_PADDING, MAX_FIT_ZOOM, MIN_FIT_ZOOM, fitViewport } from './viewport.js';

const pane = { width: 800, height: 600 };

describe('fitViewport', () => {
  it('shows a small graph at 1:1 rather than blowing it up', () => {
    // Scaling three cards to fill the pane looks like a rendering bug, not like emphasis.
    expect(fitViewport({ width: 200, height: 100 }, pane).zoom).toBe(MAX_FIT_ZOOM);
  });

  it('shrinks to fit a graph that is merely a little too big', () => {
    const zoom = fitViewport({ width: 1_000, height: 400 }, pane).zoom;

    expect(zoom).toBeLessThan(MAX_FIT_ZOOM);
    expect(zoom).toBeGreaterThan(MIN_FIT_ZOOM);
  });

  it('stops shrinking at the legibility floor and lets the reader pan', () => {
    // Fitting this honestly would land near 0.06, where a card is a smudge.
    expect(fitViewport({ width: 12_000, height: 9_000 }, pane).zoom).toBe(MIN_FIT_ZOOM);
  });

  it('constrains on whichever axis binds', () => {
    const wide = fitViewport({ width: 940, height: 100 }, pane);
    const tall = fitViewport({ width: 100, height: 690 }, pane);

    // (800 - 48) / 940 and (600 - 48) / 690 both come to 0.8, above the legibility floor.
    expect(wide.zoom).toBeCloseTo(0.8, 5);
    expect(tall.zoom).toBeCloseTo(0.8, 5);
  });

  it('starts at the left edge, never centred', () => {
    // The root sits at x = 0 and is the entry point to the whole picture; centring a graph wider
    // than the pane pushes it off screen, which is the one card that must never be hidden.
    const wide = fitViewport({ width: 12_000, height: 200 }, pane);
    const small = fitViewport({ width: 200, height: 200 }, pane);

    expect(wide.x).toBe(FIT_PADDING);
    expect(small.x).toBe(FIT_PADDING);
  });

  it('centres vertically while the graph fits', () => {
    const { y } = fitViewport({ width: 200, height: 200 }, pane);
    expect(y).toBe((600 - 200) / 2);
  });

  it('pins a graph taller than the pane to the top', () => {
    // Vertical centring here would open half-scrolled, hiding the root's own row.
    expect(fitViewport({ width: 200, height: 5_000 }, pane).y).toBe(FIT_PADDING);
  });

  it('falls back to 1:1 rather than dividing by zero on an unmeasured pane', () => {
    // The effect can run before layout in some mount orders; a NaN zoom would blank the canvas.
    expect(fitViewport({ width: 500, height: 500 }, { width: 0, height: 0 }).zoom).toBe(
      MAX_FIT_ZOOM,
    );
    expect(fitViewport({ width: 0, height: 0 }, pane).zoom).toBe(MAX_FIT_ZOOM);
  });

  it('survives a pane smaller than its own padding', () => {
    const { zoom } = fitViewport({ width: 500, height: 500 }, { width: 20, height: 20 });

    expect(zoom).toBe(MIN_FIT_ZOOM);
    expect(Number.isFinite(zoom)).toBe(true);
  });
});
