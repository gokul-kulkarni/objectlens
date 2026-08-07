/**
 * Where the camera starts.
 *
 * The canvas library's own `fitView` centres the content and will shrink without limit to make it
 * all visible. Neither is right here. A containment tree is read left-to-right from its root, so
 * when the picture is wider than the pane the root is the part that must stay on screen — centring
 * clips it. And a fit that lands at 0.25 produces an "overview" of unreadable smudges; the minimap
 * already carries the shape, so this refuses to go below legibility and lets the reader pan.
 *
 * A pure function of two rectangles, so the arithmetic is assertable without a canvas.
 */

/** Below this, card text stops being readable, so the fit stops shrinking and pans instead. */
export const MIN_FIT_ZOOM = 0.6;
/** A three-node graph blown up to fill the pane looks broken, not helpful. */
export const MAX_FIT_ZOOM = 1;
export const FIT_PADDING = 24;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export function fitViewport(content: Size, pane: Size): Viewport {
  const zoom = fitZoom(content, pane);

  return {
    // Left-aligned, never centred: the root lives at x = 0 and is the entry point to everything.
    x: FIT_PADDING,
    // Centred vertically while it fits, then pinned to the top — a tall graph is read downward
    // from the top, and starting it half-scrolled hides the root's own row.
    y: Math.max(FIT_PADDING, (pane.height - content.height * zoom) / 2),
    zoom,
  };
}

function fitZoom(content: Size, pane: Size): number {
  // An unmeasured pane or an empty graph has no meaningful scale; 1:1 is the honest answer.
  if (content.width <= 0 || content.height <= 0 || pane.width <= 0 || pane.height <= 0) {
    return MAX_FIT_ZOOM;
  }

  const available = {
    width: pane.width - FIT_PADDING * 2,
    height: pane.height - FIT_PADDING * 2,
  };

  if (available.width <= 0 || available.height <= 0) return MIN_FIT_ZOOM;

  const zoom = Math.min(available.width / content.width, available.height / content.height);

  return Math.min(MAX_FIT_ZOOM, Math.max(MIN_FIT_ZOOM, zoom));
}
