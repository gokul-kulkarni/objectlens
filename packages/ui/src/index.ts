/**
 * The ObjectLens UI, as a library.
 *
 * Each app (the public site, the Orca editor) is a thin shell around these pieces. The Markdown
 * mode is exported separately (`@objectlens/ui/markdown`) so an app can load it lazily: it pulls
 * in Mermaid, which outweighs everything else combined.
 */

export { ExploreMode } from './modes/ExploreMode.jsx';
export { CompareMode } from './modes/CompareMode.jsx';
export { ObjectExplorer, type ObjectExplorerProps, type Viewer } from './components/ObjectExplorer.jsx';
export { SegmentedControl } from './components/SegmentedControl.jsx';
export { useViewer, type ViewerState } from './state/useViewer.js';
export { MODES, modeFromHash, useMode, type Mode } from './state/useMode.js';
export { PANEL_DEFAULTS, PANEL_LIMITS, usePanelSizes, type PanelControls } from './state/usePanelSizes.js';
export { adapters, views } from './registry.js';
export { createAdapterRegistry } from './adapters.js';
export { createParseClient, type ParseClient, type WorkerFactory } from './parse/client.js';
