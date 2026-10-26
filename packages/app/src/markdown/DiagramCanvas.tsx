/**
 * A rendered diagram that can be zoomed and panned.
 *
 * Zooming resizes the SVG itself rather than applying a CSS transform, so the scroll area grows
 * with it and the browser's own scrollbars, trackpad and keyboard scrolling all keep working.
 * Ctrl/⌘ + scroll zooms around the pointer, the way map and design tools do; plain scroll is left
 * alone so the document still scrolls past a diagram.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { fitScale, formatZoom, stepZoom, clampZoom } from './zoom.js';

const CONTROL =
  'cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';

/** Wheel delta that counts as one zoom step; trackpads send many small deltas. */
const WHEEL_STEP = 50;

interface Size {
  readonly width: number;
  readonly height: number;
}

/** A point in the content, as a fraction of its size, and where it sat in the viewport. */
interface Anchor {
  readonly fx: number;
  readonly fy: number;
  readonly vx: number;
  readonly vy: number;
}

export interface DiagramCanvasProps {
  /** Mermaid's output, produced under `securityLevel: 'strict'`. */
  readonly svg: string;
  /** True while the figure is fullscreen, so the canvas fills it instead of capping its height. */
  readonly fullscreen?: boolean;
  /**
   * The figure's own toolbar. The zoom controls join it on the same row rather than floating
   * over the diagram, where they would hide whatever is drawn in that corner.
   */
  readonly toolbar: (zoomControls: ReactNode) => ReactNode;
}

export function DiagramCanvas({ svg, fullscreen = false, toolbar }: DiagramCanvasProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const natural = useRef<Size | null>(null);
  const anchor = useRef<Anchor | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const wheel = useRef(0);
  /** `null` is "fit to width"; a number is an explicit scale. */
  const [zoom, setZoom] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);

  const svgElement = useCallback(() => content.current?.querySelector('svg') ?? null, []);

  // Read the diagram's own size once per render of its source; Mermaid writes it into the viewBox.
  useLayoutEffect(() => {
    natural.current = naturalSize(svgElement());
    setZoom(null);
  }, [svg, svgElement]);

  // Apply the zoom by sizing the SVG, then restore the anchored point under the pointer.
  useLayoutEffect(() => {
    const element = svgElement();
    const size = natural.current;
    if (element === null || size === null) return;

    if (zoom === null) {
      element.style.removeProperty('width');
      element.style.removeProperty('height');
      element.style.maxWidth = `min(100%, ${size.width}px)`;
    } else {
      element.style.maxWidth = 'none';
      element.style.width = `${Math.round(size.width * zoom)}px`;
      element.style.height = `${Math.round(size.height * zoom)}px`;
    }

    const box = viewport.current;
    const pending = anchor.current;
    anchor.current = null;
    if (box !== null && pending !== null) {
      box.scrollLeft = pending.fx * box.scrollWidth - pending.vx;
      box.scrollTop = pending.fy * box.scrollHeight - pending.vy;
    }
  }, [zoom, svg, svgElement]);

  /** The scale currently on screen, including the arbitrary one that fitting produces. */
  const currentScale = useCallback((): number => {
    if (zoom !== null) return zoom;
    const size = natural.current;
    const box = viewport.current;
    return size === null || box === null ? 1 : fitScale(size.width, box.clientWidth - 32);
  }, [zoom]);

  const zoomTo = useCallback((next: number, at?: { x: number; y: number }) => {
    const box = viewport.current;
    if (box !== null) {
      const vx = at?.x ?? box.clientWidth / 2;
      const vy = at?.y ?? box.clientHeight / 2;
      anchor.current = {
        fx: (box.scrollLeft + vx) / Math.max(1, box.scrollWidth),
        fy: (box.scrollTop + vy) / Math.max(1, box.scrollHeight),
        vx,
        vy,
      };
    }
    setZoom(clampZoom(next));
  }, []);

  const step = useCallback(
    (direction: 1 | -1, at?: { x: number; y: number }) => zoomTo(stepZoom(currentScale(), direction), at),
    [currentScale, zoomTo],
  );

  // React's onWheel is passive, so it cannot stop the page from zooming; this listener can.
  useEffect(() => {
    const box = viewport.current;
    if (box === null) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      wheel.current += event.deltaY;
      if (Math.abs(wheel.current) < WHEEL_STEP) return;

      const direction = wheel.current < 0 ? 1 : -1;
      wheel.current = 0;
      const rect = box.getBoundingClientRect();
      step(direction, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };

    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [step]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const box = viewport.current;
    if (box === null || event.button !== 0) return;
    if (box.scrollWidth <= box.clientWidth && box.scrollHeight <= box.clientHeight) return;
    drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.setPointerCapture?.(event.pointerId);
    setPanning(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = viewport.current;
    const start = drag.current;
    if (box === null || start === null) return;
    box.scrollLeft = start.left - (event.clientX - start.x);
    box.scrollTop = start.top - (event.clientY - start.y);
  };

  const endPan = () => {
    drag.current = null;
    setPanning(false);
  };

  const controls = (
    <div role="group" aria-label="Zoom" className="flex items-center gap-0.5 rounded border border-slate-700 p-0.5">
      <button type="button" className={CONTROL} aria-label="Zoom out" title="Zoom out (−)" onClick={() => step(-1)}>
        −
      </button>
      <button
        type="button"
        className={`${CONTROL} tabular min-w-12 text-center`}
        title="Fit to width (0)"
        aria-label={zoom === null ? 'Fit to width (current)' : `Zoom ${formatZoom(zoom)}, fit to width`}
        onClick={() => setZoom(null)}
      >
        {zoom === null ? 'Fit' : formatZoom(zoom)}
      </button>
      <button type="button" className={CONTROL} aria-label="Zoom in" title="Zoom in (+)" onClick={() => step(1)}>
        +
      </button>
      <button type="button" className={CONTROL} title="Actual size (1)" onClick={() => zoomTo(1)}>
        1:1
      </button>
    </div>
  );

  return (
    <>
      {toolbar(controls)}

      <div
        ref={viewport}
        tabIndex={0}
        aria-label="Diagram — Ctrl or ⌘ + scroll to zoom, drag to pan"
        data-testid="diagram-viewport"
        className={`overflow-auto p-4 outline-none ${fullscreen ? 'min-h-0 flex-1' : 'max-h-[75vh]'} ${
          panning ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onKeyDown={(event) => {
          if (event.key === '+' || event.key === '=') step(1);
          else if (event.key === '-' || event.key === '_') step(-1);
          else if (event.key === '0') setZoom(null);
          else if (event.key === '1') zoomTo(1);
          else return;
          event.preventDefault();
        }}
      >
        {/* `w-max min-w-full` lets a zoomed diagram overflow to the right instead of being centred off-screen. */}
        <div ref={content} className="ol-diagram-content mx-auto flex w-max min-w-full justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </>
  );
}

/** The diagram's own size, from its `viewBox` — Mermaid always writes one. */
export function naturalSize(element: SVGSVGElement | null): Size | null {
  const parts = element?.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (parts === undefined || parts.length !== 4) return null;
  const [, , width = 0, height = 0] = parts;
  return width > 0 && height > 0 ? { width, height } : null;
}
