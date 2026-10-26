# ObjectLens

Explore structured objects — Python `repr()` output, JSON, YAML, anything with an adapter — as a
navigable tree and a node-link graph. Compare two of them, in any mix of formats. Read a README,
Mermaid diagrams included.

**→ [gokul-kulkarni.github.io/objectlens](https://gokul-kulkarni.github.io/objectlens/)**

Nothing is uploaded. Parsing happens in a Web Worker in your own tab, and the deployment is a
folder of static files with no backend to send anything to. The one network request ObjectLens
ever makes is the Markdown viewer's **Load**, which fetches the URL you typed — read-only, with no
cookies — and only when you press it.

`print(obj)` gives you an unreadable wall of text, `pprint` gives you a slightly better wall, and a
real debugger needs an IDE and a live process. ObjectLens takes the text you already copied out of
a log and makes it explorable.

## Status

**Runnable and shippable.** Paste `repr()` output or JSON and explore it as a tree or as a
node-link graph. Four formats — Python `repr()`, JSON, YAML, and ObjectLens snapshots — and a
zero-install snippet that exports a *live* Python object with real cycles and shared references.
Parsing runs in a Worker; the build is static with no backend.

| Phase | | |
| --- | --- | --- |
| 1 | Core IR + registries | ✅ done |
| 2 | JSON adapter | ✅ done |
| 3 | Python `repr()` adapter | ✅ done |
| 4 | Tree view | ✅ done |
| 6 | App shell + static site | ✅ done — first shippable milestone |
| 5 | Graph view | ✅ done |
| 7 | Zero-install export snippet | ✅ done |
| 9 | YAML adapter + plugin guide | ✅ done — the extensibility proof held |
| 10 | Compare mode | ✅ done |
| 11 | Markdown / README viewer with Mermaid | ✅ done |
| 8 | Python live mode | ← next |

1047 TypeScript tests + 50 Python tests, 92.4% line coverage. `bun run dev` and paste something.

## Modes

The header switches between three modes; each keeps its state while you look at another, and the
URL hash (`#compare`, `#markdown`) links straight to one.

- **Explore** — one object as a tree or a graph.
- **Compare** — two objects as one merged tree of differences: added, removed, changed, with `n`/`p`
  to step through them. It diffs the IR, not the text, so key order, `1.50` vs `1.5`, and the
  source format do not count as changes — a JSON file and its YAML twin compare equal. Arrays match
  by position, or by an identity field you name (`id`) so reordered records line up as moves.
- **Markdown** — paste, open or fetch a document. GitHub links (`github.com/owner/repo`,
  `…/blob/…`, `…/tree/…`) resolve to the raw file, with relative links and images pointing back at
  the repository. ```` ```mermaid ```` fences are drawn as diagrams. Rendered HTML is sanitised
  with DOMPurify, Mermaid runs in strict mode, and both load only when the mode is first opened.

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

Phase 9 was the matching falsification test: [`docs/plugins.md`](docs/plugins.md) was written *by
following it* to build the YAML adapter, on the theory that a guide written from the architecture's
intentions describes the architecture the author meant rather than the one that exists.

It held. Adding YAML — a format with anchors, tags, complex keys, binary scalars and
multi-document streams — changed four lines outside its own package and nothing at all in `core`,
the views, or the app's components. It needed no new `kind`: `ref`, added for Python's `...`
recursion marker, took YAML's anchors unmodified, so the graph view drew YAML's cycles on the day
the adapter landed without knowing YAML exists. Two rough edges turned up and are now written
down — the parse worker needs its own `register` call, and Tailwind's content scan stops at the
app's package boundary.

## Two deployment targets, one bundle

The public site is static — no backend of any kind. Parsing and rendering are entirely client-side,
so the deliverable is a `dist/` folder on a CDN.

Live attachment needs Python for exactly one reason: walking `__dict__` and following `id()`
requires code running *inside the target interpreter*. Node cannot reach into another process's
heap. So the local package ships the same bundle and serves it from `127.0.0.1`, same-origin with
its own API — which sidesteps the mixed-content and Private Network Access rules that block a
public HTTPS page from fetching `http://localhost`.

### The zero-install on-ramp

`pip install` is a real barrier when you want to look at *one* object on a machine you do not
control, so the site also offers `python/snippets/export.py` behind a copy button. Paste it into
any REPL — standard library only, Python 3.8+ — call `lens(obj)`, and drop the file it writes back
onto the page.

It exists because `repr()` destroys object identity. Once your graph is text, `[{'a': 1}, {'a': 1}]`
and `[shared, shared]` are indistinguishable and a cycle is a bare `...` pointing at nothing.
Walking the live object keeps `id()`, so sharing becomes a real `ref` edge and a cycle a real
back-edge — which is exactly what the graph view is for.

Two rules it does not break: it never calls a property getter (descriptors run arbitrary code, and
a viewer that triggers them is a debugger that changes what it is debugging — skipped properties
are reported, not hidden), and it never trusts `__repr__` or a user container to behave.

The snippet and `@objectlens/adapter-snapshot` are two implementations of `docs/schema.md` §6 in
two languages, so neither can be verified alone. `docs/fixtures/snapshot-corpus.json` is written by
a real interpreter and asserted by the TypeScript suite, which makes the round trip a test rather
than a hope.

## Deploying

The site is static, so hosting it needs no server of any kind — `bun run build` produces
`packages/app/dist` and any file host will do.

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes it to GitHub Pages on
every push to `main`, gated on typecheck and both test suites: this goes to a public URL, and a
broken build reaching it is worse than a deploy that does not happen.

Enabling it on a fresh clone is one setting — **Settings → Pages → Source: GitHub Actions**. The
workflow fails with a permissions error until that is done, which is the only manual step.

`base` is `'./'` rather than an absolute path, so the same build works at a domain root, under a
`/repo/` subpath, and from `file://`. That matters beyond convenience: the local Python package
serves this identical bundle from `127.0.0.1`, and a build hardcoded to one origin could not.

## Development

Requires [Bun](https://bun.sh) (developed against 1.3).

```bash
bun install
bun run test          # vitest, 80% coverage gate
bun run test:python   # the export snippet's suite — stdlib unittest, nothing to install
bun run test:all      # both
bun run typecheck     # tsc project references, strict
bun run dev           # the Vite site on :5173
bun run build         # static output in packages/app/dist
```

The Python suite deliberately needs no `pip install`: the snippet's whole promise is that it runs
anywhere with nothing installed, and a test suite that needed a dependency to prove that would be
a poor witness. `pytest` collects it too, if you have it.

Bun is the package manager and script runner; Vitest and Vite still run on Node under the hood, so
nothing depends on Bun-specific runtime behaviour. Internal packages are wired with the
`workspace:*` protocol, which always resolves to the local copy rather than a version string that
has to be bumped in lockstep.

`esbuild` is listed under `trustedDependencies` because Bun blocks lifecycle scripts by default and
esbuild's postinstall fetches its platform binary — Vite and Vitest are unusable without it.

## Layout

```
packages/core/            IR, registries, node sources, traversal — no React, no adapters
packages/adapter-*/       source format → IR (JSON, Python repr, snapshot, YAML)
packages/view-*/          IR → rendering (tree, graph)
packages/diff/            structural diff of two graphs — depends on core only
packages/icons/           the SVG icon set both views draw with
packages/app/             the Vite site; wires the registries together, and hosts the
                          Compare (src/compare) and Markdown (src/markdown) modes
python/snippets/export.py the zero-install exporter — stdlib only, meant to be pasted
python/tests/             its unittest suite
python/fixtures/          corpus generators; output committed under docs/fixtures/
docs/schema.md            the wire contract shared by all of the above
docs/plugins.md           how to write your own adapter or view
```
