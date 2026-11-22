// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clampZoom, fitScale, formatZoom, MAX_ZOOM, MIN_ZOOM, stepZoom } from './zoom.js';
import { DiagramCanvas, naturalSize } from './DiagramCanvas.jsx';
import { PREVIEW_WIDTH_CLASS, usePreviewWidth } from './usePreviewWidth.js';

const toolbar = (controls: ReactNode) => <div>{controls}</div>;

const SVG = '<svg viewBox="0 0 400 200" width="100%" style="max-width: 400px"><rect/></svg>';

describe('zoom steps', () => {
  it('steps to the next round level in either direction', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
  });

  it('steps from an arbitrary fitted scale to the nearest level past it', () => {
    expect(stepZoom(0.62, 1)).toBe(0.67);
    expect(stepZoom(0.62, -1)).toBe(0.5);
  });

  it('stops at the ends', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
  });

  it('fits by shrinking, never by enlarging', () => {
    expect(fitScale(800, 400)).toBe(0.5);
    expect(fitScale(200, 400)).toBe(1);
    expect(fitScale(0, 400)).toBe(1);
  });

  it('formats as a percentage', () => {
    expect(formatZoom(1.25)).toBe('125%');
  });
});

describe('naturalSize', () => {
  const svg = (viewBox: string | null) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (viewBox !== null) element.setAttribute('viewBox', viewBox);
    return element;
  };

  it('reads the viewBox, with spaces or commas', () => {
    expect(naturalSize(svg('0 0 400 200'))).toEqual({ width: 400, height: 200 });
    expect(naturalSize(svg('-8,-8,120,60'))).toEqual({ width: 120, height: 60 });
  });

  it('gives up on a missing or degenerate viewBox', () => {
    expect(naturalSize(null)).toBeNull();
    expect(naturalSize(svg(null))).toBeNull();
    expect(naturalSize(svg('0 0 0 10'))).toBeNull();
  });
});

describe('DiagramCanvas', () => {
  const svgStyle = () => (document.querySelector('[data-testid="diagram-viewport"] svg') as SVGElement).style;

  it('starts fitted to the width', () => {
    render(<DiagramCanvas svg={SVG} toolbar={toolbar} />);
    expect(screen.getByRole('button', { name: 'Fit to width (current)' })).toBeDefined();
    expect(svgStyle().maxWidth).toBe('min(100%, 400px)');
  });

  it('zooms with the buttons by resizing the SVG, and returns to fit', async () => {
    render(<DiagramCanvas svg={SVG} toolbar={toolbar} />);

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    // jsdom has no layout, so the fitted scale reads as 1 and the next step is 110%.
    expect(screen.getByRole('button', { name: /Zoom 110%/ })).toBeDefined();
    expect(svgStyle().width).toBe('440px');
    expect(svgStyle().height).toBe('220px');
    expect(svgStyle().maxWidth).toBe('none');

    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByRole('button', { name: /Zoom 90%/ })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /fit to width/ }));
    expect(svgStyle().width).toBe('');
    expect(svgStyle().maxWidth).toBe('min(100%, 400px)');

    await userEvent.click(screen.getByRole('button', { name: '1:1' }));
    expect(svgStyle().width).toBe('400px');
  });

  it('zooms from the keyboard when focused', async () => {
    render(<DiagramCanvas svg={SVG} toolbar={toolbar} />);
    screen.getByTestId('diagram-viewport').focus();

    await userEvent.keyboard('+');
    expect(screen.getByRole('button', { name: /Zoom 110%/ })).toBeDefined();
    await userEvent.keyboard('-');
    expect(screen.getByRole('button', { name: /Zoom 100%/ })).toBeDefined();
    await userEvent.keyboard('0');
    expect(screen.getByRole('button', { name: 'Fit to width (current)' })).toBeDefined();
    await userEvent.keyboard('1');
    expect(screen.getByRole('button', { name: /Zoom 100%/ })).toBeDefined();
  });

  it('zooms with Ctrl/⌘ + scroll and leaves plain scrolling alone', () => {
    render(<DiagramCanvas svg={SVG} toolbar={toolbar} />);
    const viewport = screen.getByTestId('diagram-viewport');

    const plain = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    viewport.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(screen.getByRole('button', { name: 'Fit to width (current)' })).toBeDefined();

    const pinch = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
    act(() => {
      viewport.dispatchEvent(pinch);
    });
    expect(pinch.defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: /Zoom 110%/ })).toBeDefined();

    // Small trackpad deltas accumulate before a step is taken.
    act(() => {
      viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, metaKey: true, cancelable: true }));
    });
    expect(screen.getByRole('button', { name: /Zoom 110%/ })).toBeDefined();
  });

  it('pans by dragging only when there is something to pan', () => {
    render(<DiagramCanvas svg={SVG} toolbar={toolbar} />);
    const viewport = screen.getByTestId('diagram-viewport');

    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100 });
    expect(viewport.className).toContain('cursor-grab');
    expect(viewport.className).not.toContain('cursor-grabbing');

    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 1000 });
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 300 });
    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100 });
    expect(viewport.className).toContain('cursor-grabbing');

    fireEvent.pointerMove(viewport, { clientX: 60, clientY: 100 });
    expect(viewport.scrollLeft).toBe(40);

    fireEvent.pointerUp(viewport);
    expect(viewport.className).not.toContain('cursor-grabbing');
  });

  it('fills a fullscreen figure instead of capping its height', () => {
    render(<DiagramCanvas svg={SVG} fullscreen toolbar={toolbar} />);
    expect(screen.getByTestId('diagram-viewport').className).toContain('flex-1');
  });
});

describe('usePreviewWidth', () => {
  afterEach(() => localStorage.clear());

  it('defaults to wide and remembers a choice', () => {
    const first = renderHook(() => usePreviewWidth());
    expect(first.result.current.width).toBe('wide');

    act(() => first.result.current.setWidth('full'));
    expect(first.result.current.width).toBe('full');
    expect(renderHook(() => usePreviewWidth()).result.current.width).toBe('full');
  });

  it('ignores a stored value it does not recognise', () => {
    localStorage.setItem('objectlens.markdown.width', 'enormous');
    expect(renderHook(() => usePreviewWidth()).result.current.width).toBe('wide');
  });

  it('maps every width to a max-width class', () => {
    expect(PREVIEW_WIDTH_CLASS).toEqual({ readable: 'max-w-3xl', wide: 'max-w-6xl', full: 'max-w-none' });
  });
});
