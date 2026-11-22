// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResizeHandle } from './ResizeHandle.jsx';

function renderHandle(overrides: Partial<Parameters<typeof ResizeHandle>[0]> = {}) {
  const onResize = vi.fn();
  const onAdjust = vi.fn();
  const onReset = vi.fn();

  render(
    <ResizeHandle
      label="Resize input panel"
      value={400}
      min={240}
      max={760}
      side="left"
      onResize={onResize}
      onAdjust={onAdjust}
      onReset={onReset}
      {...overrides}
    />,
  );

  return { handle: screen.getByRole('separator'), onResize, onAdjust, onReset };
}

describe('accessibility', () => {
  it('exposes itself as a separator with its current and permitted values', () => {
    const { handle } = renderHandle();

    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-label')).toBe('Resize input panel');
    expect(handle.getAttribute('aria-valuenow')).toBe('400');
    expect(handle.getAttribute('aria-valuemin')).toBe('240');
    expect(handle.getAttribute('aria-valuemax')).toBe('760');
  });

  it('is reachable by keyboard', async () => {
    // `role="separator"` with a value promises operability; without a tab stop that is a lie.
    renderHandle();

    await userEvent.tab();

    expect(screen.getByRole('separator')).toBe(document.activeElement);
  });
});

describe('keyboard resizing', () => {
  it('nudges a left panel with the arrow keys', () => {
    const { handle, onAdjust } = renderHandle();

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onAdjust).toHaveBeenLastCalledWith(16);

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onAdjust).toHaveBeenLastCalledWith(-16);
  });

  it('inverts the arrow directions for a right panel', () => {
    // Arrow direction is screen direction: on the right panel, "left" means wider.
    const { handle, onAdjust } = renderHandle({ side: 'right' });

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onAdjust).toHaveBeenLastCalledWith(16);

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onAdjust).toHaveBeenLastCalledWith(-16);
  });

  it('uses a coarse step with Shift', () => {
    const { handle, onAdjust } = renderHandle();

    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });

    expect(onAdjust).toHaveBeenLastCalledWith(64);
  });

  it('reports each key press separately, so a held key accumulates', () => {
    // Arrows nudge by a delta rather than setting `value + step`. Reading the captured prop
    // would collapse every press inside one frame into a single step — which is exactly what
    // holding an arrow key does.
    const { handle, onAdjust } = renderHandle();

    for (let i = 0; i < 5; i += 1) fireEvent.keyDown(handle, { key: 'ArrowRight' });

    expect(onAdjust).toHaveBeenCalledTimes(5);
    expect(onAdjust.mock.calls.every(([delta]) => delta === 16)).toBe(true);
  });

  it('jumps to the limits with Home and End', () => {
    const { handle, onResize } = renderHandle();

    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(240);

    fireEvent.keyDown(handle, { key: 'End' });
    expect(onResize).toHaveBeenLastCalledWith(760);
  });

  it('resets on Enter or Space', () => {
    const { handle, onReset } = renderHandle();

    fireEvent.keyDown(handle, { key: 'Enter' });
    fireEvent.keyDown(handle, { key: ' ' });

    expect(onReset).toHaveBeenCalledTimes(2);
  });

  it('ignores unrelated keys', () => {
    const { handle, onResize, onAdjust, onReset } = renderHandle();

    fireEvent.keyDown(handle, { key: 'a' });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });

    expect(onResize).not.toHaveBeenCalled();
    expect(onAdjust).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
  });
});

describe('pointer dragging', () => {
  it('reports a width measured from the container edge', () => {
    const { handle, onResize } = renderHandle();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 520 });

    // jsdom reports a zero-origin container rect, so the width is the client X itself.
    expect(onResize).toHaveBeenLastCalledWith(520);
  });

  it('measures a right panel from the opposite edge', () => {
    const { handle, onResize } = renderHandle({ side: 'right' });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300 });

    // The shared test setup gives every element an 800px-wide rect, so this is 800 - 300.
    // The point is the direction: moving left widens a right-hand panel.
    expect(onResize).toHaveBeenLastCalledWith(500);
  });

  it('ignores movement when no drag is in progress', () => {
    const { handle, onResize } = renderHandle();

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 520 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it('stops responding after the pointer is released', () => {
    const { handle, onResize } = renderHandle();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 600 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it('ignores non-primary buttons', () => {
    // A right-click starting a drag that never ends is a classic way to wedge a splitter.
    const { handle, onResize } = renderHandle();

    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 520 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it('restores the document cursor and selection after a drag', () => {
    const { handle } = renderHandle();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    expect(document.body.style.userSelect).toBe('none');

    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
  });

  it('cleans up when the pointer is cancelled rather than released', () => {
    const { handle } = renderHandle();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(document.body.style.userSelect).toBe('');
  });
});

describe('double activation', () => {
  it('resets on a second press within the double-click window', () => {
    // Detected on pointerdown rather than via onDoubleClick, because preventDefault() on
    // pointerdown suppresses the compatibility mouse events that dblclick is one of. This test
    // exists because that exact bug shipped and had to be found in the browser.
    const { handle, onReset } = renderHandle();

    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(1000);
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    now.mockReturnValue(1100);
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });

    expect(onReset).toHaveBeenCalledOnce();
    now.mockRestore();
  });

  it('does not reset on two slow presses', () => {
    const { handle, onReset } = renderHandle();

    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(1000);
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    now.mockReturnValue(5000);
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });

    expect(onReset).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('does not treat a third press as another reset', () => {
    const { handle, onReset } = renderHandle();

    const now = vi.spyOn(performance, 'now');

    for (const at of [1000, 1100, 1200]) {
      now.mockReturnValue(at);
      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
      fireEvent.pointerUp(handle, { pointerId: 1 });
    }

    expect(onReset).toHaveBeenCalledOnce();
    now.mockRestore();
  });
});
