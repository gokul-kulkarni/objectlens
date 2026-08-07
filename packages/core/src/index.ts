/**
 * `@objectlens/core` — the contract shared by every adapter, view, and node source.
 *
 * This package deliberately has no runtime dependencies and no React import that survives
 * compilation. A third-party plugin depends on this and nothing else.
 */

// Model
export {
  ROOT_ID,
  isIdentifier,
  keyChild,
  indexChild,
  fieldChild,
  argChild,
  keyNodeChild,
  keyValueChild,
  setItemChild,
  isAddressable,
  disambiguate,
  type NodeId,
  type SourceId,
} from './model/ids.js';

export { createIdAllocator, type IdAllocator } from './model/allocator.js';

export {
  isContainer,
  childCount,
  hasUnloadedChildren,
  type Node,
  type NodeKind,
  type ScalarType,
  type FieldCategory,
  type ContainerNode,
  type MapNode,
  type MapEntry,
  type SequenceNode,
  type SetNode,
  type ObjectNode,
  type ObjectField,
  type ScalarNode,
  type OpaqueNode,
  type RefNode,
} from './model/nodes.js';

export {
  diagnostic,
  parseError,
  parseWarning,
  hasErrors,
  positionAt,
  type Diagnostic,
  type Severity,
} from './model/diagnostics.js';

export {
  initialExpansion,
  toggle,
  expandAll,
} from './model/expansion.js';

export {
  buildGraph,
  pathTo,
  ancestorsOf,
  resolveRef,
  type ObjectGraph,
  type BuildGraphOptions,
} from './model/graph.js';

// Adapters (axis 1: source format -> IR)
export type {
  Confidence,
  ParseContext,
  ParseResult,
  RawInput,
  SourceAdapter,
} from './adapter/types.js';

export { SourceAdapterRegistry, sourceAdapters, type Detection } from './adapter/registry.js';
export { MAX_PARSE_DEPTH, MAX_INPUT_BYTES } from './adapter/limits.js';

// Views (axis 2: IR -> rendering)
export type { ViewPlugin, ViewProps } from './view/types.js';
export { ViewRegistry, viewPlugins } from './view/registry.js';

// Node sources (static vs live, made indistinguishable to views)
export type { ChildRange, ChildWindow, NodeSource } from './source/types.js';
export { InMemoryNodeSource } from './source/memory.js';

// Formatting (shared by every view, so two views cannot render the same bignum differently)
export { preview, formatScalar, summarise, typeLabel, elide } from './format/preview.js';

// Traversal
export { childrenOf, keyLabel, type ChildRef, type ChildRelation } from './traversal/children.js';
export { walk, countNodes, maxDepth, type WalkStep } from './traversal/walk.js';
export { search, searchableText, type SearchOptions, type SearchResult } from './traversal/search.js';
