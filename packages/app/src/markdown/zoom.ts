/**
 * Zoom levels for diagrams.
 *
 * Fixed steps rather than a free multiplier, so zooming in and back out returns to exactly where
 * it started and the percentage shown is always a round number.
 */

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The next step above (`direction` 1) or below (-1) `current`. `current` need not be a step — the
 * fit-to-width scale is arbitrary — so this finds the nearest step strictly past it.
 */
export function stepZoom(current: number, direction: 1 | -1): number {
  const epsilon = 1e-6;
  if (direction === 1) return ZOOM_STEPS.find((step) => step > current + epsilon) ?? MAX_ZOOM;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
    const step = ZOOM_STEPS[i];
    if (step !== undefined && step < current - epsilon) return step;
  }
  return MIN_ZOOM;
}

/** The scale a diagram is drawn at when fitted: shrunk to the available width, never enlarged. */
export function fitScale(naturalWidth: number, availableWidth: number): number {
  if (naturalWidth <= 0 || availableWidth <= 0) return 1;
  return Math.min(1, availableWidth / naturalWidth);
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
