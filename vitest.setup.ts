/**
 * Global test setup.
 *
 * Runs before any test module is imported, which matters: patching these from a `beforeAll` inside
 * a test file is too late for code that reads them during module evaluation or first render.
 *
 * jsdom gives every element zero size and ships no `ResizeObserver`. A virtualised list measures
 * its viewport through both, so without these stubs it renders nothing at all — and component
 * tests would happily pass against a component that drew an empty list.
 */

const VIEWPORT = 800;

if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: VIEWPORT,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: VIEWPORT,
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: VIEWPORT,
      height: VIEWPORT,
      top: 0,
      left: 0,
      bottom: VIEWPORT,
      right: VIEWPORT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub implements ResizeObserver {
      readonly #callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }

      observe(target: Element): void {
        // `borderBoxSize` is the field the virtualiser reads first; supplying it avoids relying
        // on the getBoundingClientRect fallback path.
        const size = { inlineSize: VIEWPORT, blockSize: VIEWPORT };

        this.#callback(
          [
            {
              target,
              borderBoxSize: [size],
              contentBoxSize: [size],
              contentRect: { width: VIEWPORT, height: VIEWPORT },
            } as unknown as ResizeObserverEntry,
          ],
          this,
        );
      }

      unobserve(): void {}
      disconnect(): void {}
    }

    globalThis.ResizeObserver = ResizeObserverStub;
  }

  // jsdom implements no Pointer Capture API, so any component using it to track a drag would
  // throw on the first pointerdown.
  if (typeof Element.prototype.setPointerCapture !== 'function') {
    const captured = new WeakMap<Element, Set<number>>();

    Element.prototype.setPointerCapture = function setPointerCapture(pointerId: number): void {
      const ids = captured.get(this) ?? new Set<number>();
      ids.add(pointerId);
      captured.set(this, ids);
    };

    Element.prototype.releasePointerCapture = function releasePointerCapture(id: number): void {
      captured.get(this)?.delete(id);
    };

    Element.prototype.hasPointerCapture = function hasPointerCapture(id: number): boolean {
      return captured.get(this)?.has(id) ?? false;
    };
  }

  // The virtualiser schedules its measurement through requestAnimationFrame, which jsdom never
  // runs inside a synchronous test. Running the callback immediately makes layout observable.
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;

  globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
}
