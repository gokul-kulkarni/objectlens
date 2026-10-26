/**
 * The shape of a structural diff.
 *
 * A diff is a single merged tree: every position that exists on either side appears once, tagged
 * with what happened to it. That is what lets one tree view show the whole comparison, rather
 * than two trees the reader has to align by eye.
 *
 * Like the IR it is built from, a diff knows nothing about source formats — a JSON file and the
 * YAML file it was converted to compare equal, because both parse to the same IR.
 */

import type { ChildRelation, Node } from '@objectlens/core';

/**
 * - `same`: equal on both sides, all the way down.
 * - `added` / `removed`: present on one side only.
 * - `changed`: this position itself differs — a different scalar, a different kind, or a
 *   container whose type name changed.
 * - `modified`: a container that is itself unchanged but has changes somewhere beneath it.
 */
export type DiffStatus = 'same' | 'added' | 'removed' | 'changed' | 'modified';

export interface DiffCounts {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

export interface DiffNode {
  /** A path that is stable across both sides, e.g. `$["users"][0].name`. Unique within a diff. */
  readonly id: string;
  /** How the parent labels this position: a key, an index, a field name. Empty for the root. */
  readonly label: string;
  readonly relation: ChildRelation | 'root';
  readonly status: DiffStatus;
  /** The node on the left side. Absent when `added`. */
  readonly left?: Node;
  /** The node on the right side. Absent when `removed`. */
  readonly right?: Node;
  /** True when the kind or type name differs, not merely the value. */
  readonly typeChanged?: boolean;
  /** Set when an array item was matched by identity key and sits at a different index. */
  readonly moved?: { readonly from: number; readonly to: number };
  readonly children: readonly DiffNode[];
  /** Changes at or beneath this node. Zero for `same`. */
  readonly counts: DiffCounts;
}

export interface DiffOptions {
  /**
   * Match array items by this field instead of by position, so reordered records line up. Applied
   * to an array only when every item on both sides is a record with a unique scalar at this key.
   */
  readonly arrayKey?: string;
  /** Stop descending after this many diff nodes. A guard against pathological inputs. */
  readonly maxNodes?: number;
}

export interface DiffResult {
  readonly root: DiffNode;
  readonly counts: DiffCounts;
  /** True when `maxNodes` cut the comparison short; parts of the tree are then unexamined. */
  readonly truncated: boolean;
  /** Human-readable remarks, e.g. an array whose items could not be matched by `arrayKey`. */
  readonly notes: readonly string[];
}
