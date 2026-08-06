/**
 * Axis 2 of the hourglass: IR → rendering.
 *
 * A view knows how to draw the IR and nothing about which language produced it. A view containing
 * `if (source === 'python')` has broken the abstraction — reach for `typeName`/`meta` instead.
 *
 * **Selection and expansion state deliberately live outside the view**, in the app store, and
 * arrive as props. That is what keeps the tree and graph in sync, and it means a third-party view
 * inherits that sync for free rather than reimplementing it.
 *
 * `import type` below is erased at compile time, so core carries no React dependency at runtime.
 */

import type { ComponentType } from 'react';
import type { ObjectGraph } from '../model/graph.js';
import type { NodeId } from '../model/ids.js';
import type { NodeSource } from '../source/types.js';

export interface ViewProps {
  readonly graph: ObjectGraph;
  /** Fetches children on demand. Identical interface for parsed and live-attached data. */
  readonly nodeSource: NodeSource;

  readonly selection: NodeId | null;
  readonly onSelect: (id: NodeId | null) => void;

  readonly expanded: ReadonlySet<NodeId>;
  readonly onToggleExpand: (id: NodeId) => void;

  /** Current search query, so views can highlight consistently. Empty string when inactive. */
  readonly query: string;
  /** Ids matching `query`, precomputed once and shared rather than recomputed per view. */
  readonly matches: ReadonlySet<NodeId>;
}

export interface ViewPlugin {
  /** Stable identifier, used in the view switcher and persisted in the URL. */
  readonly id: string;
  readonly label: string;
  /** Short description for the view switcher tooltip. */
  readonly description?: string;

  /**
   * Whether this view can render this particular graph.
   *
   * Enables contextual views — a table view that appears only for a uniform array of records, a
   * DataFrame view only for the matching `typeName`. Must be cheap and must not throw.
   */
  canRender(graph: ObjectGraph): boolean;

  readonly Component: ComponentType<ViewProps>;
}
