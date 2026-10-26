/**
 * `@objectlens/diff` — structural comparison of two object graphs.
 *
 * Depends on `@objectlens/core` and nothing else. Works on the IR, so any two formats with an
 * adapter can be compared with each other.
 */

export { diffGraphs } from './diff.js';
export {
  flattenDiff,
  indexDiff,
  diffAncestors,
  initialDiffExpansion,
  isChange,
  type DiffRow,
  type DiffIndex,
  type FlattenDiffOptions,
} from './flatten.js';
export { scalarKey, canonicalText } from './canonical.js';
export type { DiffCounts, DiffNode, DiffOptions, DiffResult, DiffStatus } from './types.js';
