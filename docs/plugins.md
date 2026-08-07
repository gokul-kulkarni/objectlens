# Writing a plugin

ObjectLens is an hourglass: **N source formats → one IR → M views**. The two axes are independent,
so there are exactly two kinds of plugin, and each one is a single interface.

- A **`SourceAdapter`** turns some format into the IR. Write one to add YAML, TOML, a Java heap
  dump, or your company's log format.
- A **`ViewPlugin`** renders the IR. Write one to add a table view, a diff view, a DataFrame view.

Both depend on `@objectlens/core` and nothing else. Core has no runtime dependencies and no React
import that survives compilation, so a plugin never inherits a parser, a view, or a framework it
did not ask for.

This guide was written *by following it* to build `@objectlens/adapter-yaml`. That was deliberate:
a guide written from the architecture's intentions describes the architecture the author meant,
not the one that exists. Where the seams turned out to be rough, this says so.

---

## Adding a source format

### 1. The whole interface

```ts
export interface SourceAdapter {
  readonly id: SourceId;                    // also written into every node's `source`
  readonly label: string;                   // shown in the format picker
  readonly extensions: readonly string[];   // ['.yaml', '.yml']
  readonly mimeTypes?: readonly string[];

  sniff(input: RawInput): Confidence;       // 0–1. Cheap. Must not throw.
  parse(input: RawInput, context: ParseContext): ParseResult | Promise<ParseResult>;
}
```

That is all of it. `parse` returns `{ graph, diagnostics }`, and `graph` may be `null` only when
nothing at all could be salvaged.

### 2. Two rules that are not negotiable

**`parse` must not throw.** Unreadable input becomes an `opaque` node plus a diagnostic, so the
readable 3,999 lines of a 4,000-line file survive the one bad one. The registry defends against
violations, but an adapter that relies on that has already lost the reader everything after the
first bad token. See `docs/schema.md` §5.

**`sniff` must be cheap and must not throw.** It runs for every registered adapter on every paste.
Look at a fixed head of the input — `packages/adapter-yaml/src/sniff.ts` uses 4 KB — and never
parse. Fully parsing a 25 MB paste to decide who should parse it costs more than the parse.

### 3. Do not write the parser if one exists

The YAML adapter does not contain a YAML parser. YAML is a large specification — anchors, tags,
three scalar styles, block and flow collections, directives, multi-document streams — and the
`yaml` package already implements it with byte ranges and non-fatal errors, which is the exact
shape this contract wants.

So the adapter is a *mapping*, not a grammar: `convert.ts` walks the library's document tree and
emits IR nodes. That is the normal case. Write a grammar only when your format has no library, as
`@objectlens/adapter-python` does for `repr()` output.

### 4. Map onto `kind`, keep detail in `typeName` and `meta`

`kind` is a **closed** set — `map | sequence | set | object | scalar | opaque | ref` — that views
switch on exhaustively. Adding a source language must never require adding a `kind`. Everything
your format knows that the IR does not goes in `typeName` (a string) or `meta` (anything).

The YAML mappings, as a worked example:

| YAML | `kind` | why |
| --- | --- | --- |
| block or flow mapping | `map` | keys are **nodes**, so `? [1, 2]` survives |
| sequence | `sequence` | |
| `!!set` | `set` | written as a mapping with null values, but it is a set |
| mapping with a custom tag (`!User`) | `object` | the author is saying "typed thing" |
| scalar | `scalar` | `scalarType` from the source text, not the parsed value |
| `!!binary` | `scalar`, `scalarType: 'bytes'` | |
| alias (`*base`) | `ref` | |
| a stream of documents | `sequence`, `typeName: 'documents'` | |

Two decisions there are worth copying:

- **`scalarType` comes from the source text, not the value.** `1.0` is a float that happens to be
  integral and JavaScript cannot tell it from `1`. Same reason `raw` exists: `0x1f` reads as 31,
  and an integer past 2⁵³ has already been rounded by the time it is a JS number. Set `raw`
  wherever the written form and the parsed value differ — views render it in preference to `value`.
- **`ref` needs `cycle` computed by you.** A back-edge into an ancestor and a second route to a
  sibling are both `ref`, and a view cannot recover the difference. Keep a set of ids on the
  current path; `cycle` is membership in it. Getting this wrong is easy in one specific way: the
  set has to be popped on the way back up, or every later reference to an earlier node reads as a
  cycle. There is a test for exactly that in `convert.test.ts`.

### 5. Node ids are access expressions

An `id` is the structural path from the root, and doubles as React key, selection handle, and the
value behind "copy path". Where the source language has a legal access expression, **the id *is*
that expression**. Build them with the helpers in core rather than by hand:

```ts
keyChild(parent, literal)   // $["users"]      — literal in your language's syntax
indexChild(parent, i)       // $["users"][0]
fieldChild(parent, name)    // $["users"][0].name
keyNodeChild(parent, i)     // $@key0    — a map key, which is itself a node
keyValueChild(parent, i)    // $@value0  — the value behind a key with no literal form
setItemChild(parent, i)     // $@item0
argChild(parent, i)         // $@arg0
```

The `@` forms mark positions with no addressable expression, which is the signal to disable "copy
path" rather than hand the reader something that will not evaluate. Do not invent an id that looks
addressable when it is not — that is a lie the UI will faithfully repeat.

Use `createIdAllocator()` if your format permits duplicate keys. YAML does (invalidly, but people
write it), and colliding ids make `buildGraph` drop a node.

### 6. Sniffing: the interesting problem is what to *concede*

Detection is arbitration, not classification. The YAML adapter's hardest case is that **JSON is
valid YAML** — a naive sniff wins on every JSON paste and renders it correctly but with the wrong
adapter's labels. So `sniffYaml` returns `0` for anything starting with `{` or `[`, and earns its
score only from things JSON does not have: block mappings, block sequences, `---`, anchors,
comments.

Score conservatively. A user can always override the picker; an adapter that grabs input it merely
*can* read makes that necessary every time.

### 7. Register it

```ts
// packages/app/src/registry.ts
adapters.register(yamlAdapter);
```

**And again in the worker.** `packages/app/src/worker/parse.worker.ts` keeps its own registry,
because functions cannot cross a `postMessage` boundary and the worker cannot share the main
thread's. This is a genuine papercut — forgetting it means the picker offers your format and
parsing silently falls back to another adapter. If a third registry ever appears, this should
become one shared module.

### 8. Test it against reality

Two suites, and they catch different things:

- **Unit tests over the grammar**, case by case. This is where the subtle mistakes live —
  `.inf`, `0x1f`, quoted `"20"`, `1.2.3`.
- **A corpus of what people actually paste.** `docs/fixtures/yaml-corpus.yaml` is a CI workflow, a
  compose file, and a Kubernetes manifest. The failure it catches is more embarrassing than a
  grammar bug: an adapter that handles every corner of the spec and then chokes on a file everyone
  has open right now.

Where ground truth exists outside your parser, capture it rather than writing it from memory —
`python/fixtures/generate_corpus.py` dumps real `repr()` output from a real interpreter, because
the details that break parsers are exactly the ones easy to misremember.

---

## Adding a view

```ts
export interface ViewPlugin {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  canRender(graph: ObjectGraph): boolean;   // cheap, must not throw
  readonly Component: ComponentType<ViewProps>;
}
```

### Selection and expansion are not yours

They arrive as props and live in the app store. That is what keeps the tree and the graph in sync,
and it means your view inherits that sync for free rather than reimplementing it. A view that keeps
its own selection state has broken the thing the architecture exists to provide.

```ts
interface ViewProps {
  graph: ObjectGraph;
  nodeSource: NodeSource;        // fetches children; identical for parsed and live data
  selection: NodeId | null;      onSelect: (id: NodeId | null) => void;
  expanded: ReadonlySet<NodeId>; onToggleExpand: (id: NodeId) => void;
  query: string;                 matches: ReadonlySet<NodeId>;
}
```

### Never switch on the source language

A view containing `if (source === 'python')` has broken the abstraction. Read `kind` exhaustively;
reach for `typeName` and `meta` when you want richer display, and degrade gracefully when they are
absent. Your view will be handed graphs from formats that did not exist when you wrote it.

### `canRender` is for contextual views

Returning `false` removes your view from the switcher for that graph. `@objectlens/view-graph`
declines a graph whose root has no children — a one-card canvas is a worse rendering of a scalar
than a single tree row. This is also how a table view appears only for a uniform array of records.

### Colour comes from tokens

Node-kind colours are CSS custom properties (`--color-node-scalar`, `--color-label-field`, …)
defined once in `packages/app/src/index.css`. Resolve those rather than picking your own, or a
scalar will be one green in your view and a different green in the tree, and the two stop reading
as one picture.

**If your view is a separate package, add it to the `@source` list** in `index.css`. Tailwind's
automatic scan stops at the app's package boundary and skips `node_modules`, which is how workspace
packages resolve — so classes only your package uses are silently dropped from the CSS with no
error at all. This bit us for real.

### Virtualise

A 200k-node graph is an ordinary paste. `@objectlens/view-tree` uses `@tanstack/react-virtual`;
`@objectlens/view-graph` caps drawn cards and says so rather than trying. Whatever you do, do not
render one DOM node per graph node.

---

## Registration is build-time

A plugin author depends on `@objectlens/core`, implements the interface, registers it at bootstrap,
and deploys their own build. Simple, safe, no security surface.

Runtime loading via `?plugin=<url>` and dynamic `import()` is deliberately deferred: it is
arbitrary third-party code executing in the page, which on a public site needs an explicit trust
prompt and ideally a sandboxed worker. The interfaces above are shaped so that adding it later is
an addition rather than a rewrite — which is why core stays free of build-time-only assumptions
like `import.meta.glob` discovery, and why registries are populated explicitly at runtime.

---

## What building the YAML adapter actually cost

This phase existed as a falsification test: if adding a genuinely different format was hard, the
seams were in the wrong place and the time to move them was then.

**Changed outside the new package:** four lines of wiring — one `register` call in
`registry.ts`, one in `parse.worker.ts`, one dependency in `packages/app/package.json`, one
reference in its `tsconfig.json`. Plus one bundled example, which is optional.

**Changed in `@objectlens/core`, the views, or the app's components:** nothing.

**Rough edges found, both now documented above:** the duplicate registration in the worker, and
Tailwind's scan boundary (which applies to views, not adapters).

The IR needed no new `kind` for a format with anchors, tags, complex keys, binary scalars, and
multi-document streams. `ref` — added for Python's `...` recursion marker and used again by the
live exporter — took YAML's anchors without modification, so the graph view drew YAML's cycles on
the day the adapter landed without knowing YAML exists. That is the claim the hourglass makes, and
it held.
