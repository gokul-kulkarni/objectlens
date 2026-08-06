/**
 * View plugin registration.
 *
 * Mirrors the adapter registry, including its distrust of plugin code: a `canRender` that throws
 * excludes that view from the switcher rather than breaking the page.
 */

import type { ObjectGraph } from '../model/graph.js';
import type { ViewPlugin } from './types.js';

export class ViewRegistry {
  readonly #views = new Map<string, ViewPlugin>();
  readonly #order: string[] = [];

  /** Registers a view, replacing any with the same id while preserving its position. */
  register(view: ViewPlugin): ViewPlugin | undefined {
    const previous = this.#views.get(view.id);
    if (previous === undefined) this.#order.push(view.id);
    this.#views.set(view.id, view);
    return previous;
  }

  unregister(id: string): boolean {
    const index = this.#order.indexOf(id);
    if (index >= 0) this.#order.splice(index, 1);
    return this.#views.delete(id);
  }

  get(id: string): ViewPlugin | undefined {
    return this.#views.get(id);
  }

  /** All registered views in registration order, which is the order the switcher shows. */
  list(): readonly ViewPlugin[] {
    return this.#order.flatMap((id) => {
      const view = this.#views.get(id);
      return view === undefined ? [] : [view];
    });
  }

  /** Views that can render this graph — what the switcher should actually offer. */
  available(graph: ObjectGraph): readonly ViewPlugin[] {
    return this.list().filter((view) => {
      try {
        return view.canRender(graph);
      } catch {
        return false;
      }
    });
  }
}

/** The registry the app wires its built-in views into. */
export const viewPlugins = new ViewRegistry();
