// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const initialize = vi.fn();
const render = vi.fn();
vi.mock('mermaid', () => ({ default: { initialize, render } }));

const { renderDiagram } = await import('./mermaid.js');

describe('renderDiagram', () => {
  it('initialises Mermaid once, in strict mode, and returns its SVG', async () => {
    render.mockResolvedValue({ svg: '<svg/>' });

    await expect(renderDiagram('graph TD; A')).resolves.toEqual({ ok: true, svg: '<svg/>' });
    await renderDiagram('graph TD; B');

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' }));
  });

  it('turns a render failure into an error result and cleans up the scratch element', async () => {
    render.mockImplementation(async (id: string) => {
      const scratch = document.createElement('div');
      scratch.id = `d${id}`;
      document.body.append(scratch);
      throw new Error('Parse error on line 1');
    });

    await expect(renderDiagram('graph ??')).resolves.toEqual({ ok: false, error: 'Parse error on line 1' });
    expect(document.body.children).toHaveLength(0);
  });

  it('renders one diagram at a time, in order', async () => {
    const order: string[] = [];
    render.mockImplementation(async (_id: string, source: string) => {
      order.push(`start ${source}`);
      await new Promise((resolve) => setTimeout(resolve, source === 'a' ? 10 : 0));
      order.push(`end ${source}`);
      return { svg: source };
    });

    await Promise.all([renderDiagram('a'), renderDiagram('b')]);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('reports a non-Error rejection as text', async () => {
    render.mockRejectedValue('bad');
    await expect(renderDiagram('x')).resolves.toEqual({ ok: false, error: 'bad' });
  });
});
