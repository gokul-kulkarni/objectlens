/**
 * Mermaid, loaded on demand.
 *
 * Mermaid is large — larger than the rest of the app — and most documents have no diagrams, so it
 * is a dynamic import that only a document with a diagram ever triggers. `securityLevel: 'strict'`
 * makes Mermaid sanitise labels and refuse click handlers, since diagram source may come from a
 * fetched README.
 *
 * Renders run one at a time: Mermaid keeps global state while rendering, and two concurrent
 * renders can corrupt each other's output.
 */

import type { Mermaid } from 'mermaid';

export type DiagramResult = { readonly ok: true; readonly svg: string } | { readonly ok: false; readonly error: string };

let loading: Promise<Mermaid> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

function load(): Promise<Mermaid> {
  loading ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
      fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif',
    });
    return mermaid;
  });
  return loading;
}

export function renderDiagram(source: string): Promise<DiagramResult> {
  const run = async (): Promise<DiagramResult> => {
    counter += 1;
    const id = `ol-mermaid-${counter}`;
    try {
      const mermaid = await load();
      const { svg } = await mermaid.render(id, source);
      return { ok: true, svg };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      // A failed render can leave its scratch element behind in <body>.
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(id)?.remove();
    }
  };

  const result = queue.then(run, run);
  queue = result;
  return result;
}
