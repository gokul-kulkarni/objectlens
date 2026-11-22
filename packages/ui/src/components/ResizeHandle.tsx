/**
 * Draggable divider between panels.
 *
 * Width is computed from the pointer's absolute position rather than accumulated deltas, so the
 * handle cannot drift away from the cursor over a long drag.
 *
 * Keyboard-operable on purpose: a divider that only responds to a mouse is invisible to anyone
 * navigating by keyboard, and `role="separator"` promises otherwise.
 */

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react';

/** Pixels moved per arrow press; Shift multiplies for coarse adjustment. */
const STEP = 16;
const COARSE_STEP = 64;

/** Window within which a second press on the handle counts as a reset gesture. */
const DOUBLE_CLICK_MS = 350;

export interface ResizeHandleProps {
  readonly label: string;
  /** Current width of the panel this handle controls. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** Which side the controlled panel is on — decides which way "bigger" is. */
  readonly side: 'left' | 'right';
  /** Absolute width, from dragging. */
  readonly onResize: (width: number) => void;
  /** Relative nudge, from the keyboard — see `adjustPanel` for why these differ. */
  readonly onAdjust: (delta: number) => void;
  readonly onReset: () => void;
}

export function ResizeHandle({
  label,
  value,
  min,
  max,
  side,
  onResize,
  onAdjust,
  onReset,
}: ResizeHandleProps) {
  const ref = useRef<HTMLDivElement>(null);

  const widthFromPointer = useCallback(
    (clientX: number): number => {
      const container = ref.current?.parentElement;
      if (!container) return value;

      const rect = container.getBoundingClientRect();
      return side === 'left' ? clientX - rect.left : rect.right - clientX;
    },
    [side, value],
  );

  const lastPointerDown = useRef(0);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Ignore secondary buttons, or a right-click would start a drag that never ends.
      if (event.button !== 0) return;

      // Double-activation is detected here rather than via `onDoubleClick`, because the
      // `preventDefault()` below suppresses the compatibility mouse events that `dblclick` is one
      // of. Doing it on pointer events also means touch and pen get the same gesture for free.
      //
      // Timed with performance.now() rather than event.timeStamp: the latter's time origin is not
      // consistent across browsers, and it cannot be set on a synthetic event, which would leave
      // this branch untestable.
      const now = performance.now();
      if (now - lastPointerDown.current < DOUBLE_CLICK_MS) {
        lastPointerDown.current = 0;
        onReset();
        return;
      }
      lastPointerDown.current = now;

      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      // Suppress selection while dragging; without it the drag paints the whole UI blue.
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [onReset],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      onResize(widthFromPointer(event.clientX));
    },
    [onResize, widthFromPointer],
  );

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? COARSE_STEP : STEP;
      // Arrow direction is screen direction: on the right panel, "left" means wider.
      const towardsLarger = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
      const towardsSmaller = side === 'left' ? 'ArrowLeft' : 'ArrowRight';

      switch (event.key) {
        case towardsLarger:
          event.preventDefault();
          onAdjust(step);
          break;
        case towardsSmaller:
          event.preventDefault();
          onAdjust(-step);
          break;
        case 'Home':
          event.preventDefault();
          onResize(min);
          break;
        case 'End':
          event.preventDefault();
          onResize(max);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          onReset();
          break;
        default:
          break;
      }
    },
    [max, min, onAdjust, onReset, onResize, side],
  );

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label} — drag, or use arrow keys. Double-click to reset.`}
      className="group relative hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-surface-raised transition-colors hover:bg-brand-strong focus:outline-none focus-visible:bg-brand lg:block"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    >
      {/* A 6px target is hard to hit, so an invisible strip widens it without shifting layout. */}
      <span aria-hidden="true" className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
