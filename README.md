# ObjectLens

Explore structured objects — Python `repr()` output, JSON, YAML, anything with an adapter — as a
navigable tree and a node-link graph.

`print(obj)` gives you an unreadable wall of text, `pprint` gives you a slightly better wall, and a
real debugger needs an IDE and a live process. ObjectLens takes the text you already copied out of
a log and makes it explorable.

## Status

**Runnable and shippable.** Paste `repr()` output or JSON and explore it as a tree. Parsing runs
in a Worker; the build is static with no backend.

| Phase | | |
| --- | --- | --- |
| 1 | Core IR + registries | ✅ done |
| 2 | JSON adapter | ✅ done |
| 3 | Python `repr()` adapter | ✅ done |
| 4 | Tree view | ✅ done |
| 6 | App shell + static site | ✅ done — first shippable milestone |
| 5 | Graph view | ← next |
| 7 | Zero-install export snippet | |
| 8 | Python live mode | |
| 9 | YAML adapter + plugin guide | extensibility proof |

461 tests, 86.9% line coverage. `npm run dev` and paste something.

## Architecture

An hourglass. N source formats narrow to one language-neutral IR, which fans out to M views:

```
 Python repr ─┐                                                     ┌─ Tree view
 JSON ────────┤                                                     ├─ Graph view
 YAML ────────┼─► [SourceAdapter] ─► ObjectGraph ─► [ViewPlugin] ───┼─ Table view
 Java ────────┤                          ▲                          ├─ Raw view
 <yours> ─────┘                          │                          └─ <yours>
                                    NodeSource
                            (in-memory | remote/lazy)
```

The two axes are independent, which is the entire point:

- **Adapters never know which views exist.** Adding YAML is one new adapter.
- **Views never know which language produced the data.** A view containing `if (source === 'python')`
  has broken the abstraction; `typeName` and `meta` exist for that instead.
- **`NodeSource` hides whether data is parsed or live.** Views page children the same way against a
  pasted snapshot and an attached Python process, so live mode required no view-layer changes.

`@objectlens/core` has no runtime dependencies and no React import that survives compilation — a
third-party plugin depends on it and nothing else. See [`docs/schema.md`](docs/schema.md) for the
IR and wire contract.

### Why JSON before Python

The Python `repr()` parser is the hard, interesting part, and it is deliberately *not* built first.
An interface with one implementation is always wrong, so JSON — quick, and different enough from
Python to matter (no sets, no tuples, no object identity) — validates the IR before it sets.

Phase 9 is the matching falsification test: the plugin guide gets written *by following it* to
build the YAML adapter. If that is hard, the seams are in the wrong place and we move them then,
rather than discovering it in year two.

## Two deployment targets, one bundle

The public site is static — no backend of any kind. Parsing and rendering are entirely client-side,
so the deliverable is a `dist/` folder on a CDN.

Live attachment needs Python for exactly one reason: walking `__dict__` and following `id()`
requires code running *inside the target interpreter*. Node cannot reach into another process's
heap. So the local package ships the same bundle and serves it from `127.0.0.1`, same-origin with
its own API — which sidesteps the mixed-content and Private Network Access rules that block a
public HTTPS page from fetching `http://localhost`.

## Development

```bash
npm install
npm test              # vitest, 80% coverage gate
npm run typecheck     # tsc project references, strict
npm run dev           # (from phase 6) the Vite site
```

## Layout

```
packages/core/            IR, registries, node sources, traversal — no React, no adapters
packages/adapter-*/       source format → IR
packages/view-*/          IR → rendering
packages/app/             the Vite site; wires the registries together
python/                   live-mode package + zero-install export snippet
docs/schema.md            the wire contract shared by all of the above
```
