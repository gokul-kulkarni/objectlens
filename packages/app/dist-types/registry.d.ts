/**
 * Wiring: the one place that knows which adapters and views exist.
 *
 * Everything else talks to the registries, so adding a format or a view means adding a line here
 * and nothing more. This is also exactly what a third-party plugin author does — depend on
 * `@objectlens/core`, implement the interface, register it at bootstrap.
 */
import { SourceAdapterRegistry, ViewRegistry } from '@objectlens/core';
export declare const adapters: SourceAdapterRegistry;
export declare const views: ViewRegistry;
//# sourceMappingURL=registry.d.ts.map