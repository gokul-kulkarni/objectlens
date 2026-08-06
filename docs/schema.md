# ObjectLens IR & Wire Schema

**Status:** unstable until two genuinely different source languages validate it (JSON + Python).
Do not treat as frozen before then. See `../README.md` for why that ordering matters.

This document is the single source of truth shared by three implementations:

| Producer | Language | Location |
| --- | --- | --- |
| Source adapters | TypeScript | `packages/adapter-*` |
| Live-mode server | Python | `python/src/objectlens/schema.py` |
| Zero-install snippet | Python | `python/snippets/export.py` |

A change here is a change to all three. The snapshot format is versioned by `schemaVersion`;
consumers must reject a major version they do not understand rather than guessing.

---

## 1. Design constraints

The IR is the narrow waist of an hourglass: **N source formats → IR → M views**. It therefore has
to satisfy two opposing pressures.

- **Universal enough** that a view can render *any* source without knowing which one produced it.
  A tree view must never contain `if (source === 'python')`.
- **Lossless enough** that Python's `frozenset` is distinguishable from `set`, and a YAML anchor
  survives the trip.

These are reconciled by splitting every node into a **universal `kind`** (a closed set that views
switch on) and **open per-adapter detail** (`typeName`, `meta`) that views may consult for richer
display but never *need* to. Adding a source language must not require adding a `kind`.

---

## 2. Node kinds

`kind` is closed. Adapters map their language onto it; they do not extend it.

| `kind` | Meaning | Python | JSON | YAML | Java |
| --- | --- | --- | --- | --- | --- |
| `map` | Keyed collection, **keys are themselves nodes** | `dict` | object | mapping | `Map` |
| `sequence` | Ordered, indexable | `list`, `tuple` | array | sequence | `List`, `[]` |
| `set` | Unordered, unindexed | `set`, `frozenset` | — | — | `Set` |
| `object` | Typed instance with named fields and/or positional args | instance, dataclass | — | tagged | POJO |
| `scalar` | Atomic value | `str`/`int`/`float`/`bool`/`None` | string/number/bool/null | scalar | primitive |
| `opaque` | Known to exist, contents unavailable | `<Foo at 0x7f…>` | — | — | `Foo@1a2b` |
| `ref` | Pointer to a node already present in the graph | shared object / cycle | — | anchor | shared |

Notes on choices that are easy to get wrong:

- **`map` keys are nodes, not strings.** Python permits `{(1, 2): 'x'}` and `{frozenset({1}): 'y'}`.
  Modelling keys as strings would silently corrupt them. JSON adapters simply emit string scalars.
- **`set` is distinct from `sequence`** because it renders differently (no meaningful indices) even
  though it is structurally a bag. Collapsing them would leak a rendering decision into the IR.
- **`object` carries both `fields` and `args`** so constructor-style reprs survive:
  `Decimal('1.5')` is args-only, `User(id=1)` is fields-only, and both forms can co-occur.

## 3. Node shape

```jsonc
{
  "id": "$[\"users\"][0]",   // REQUIRED, unique within the graph — see §4
  "kind": "object",          // REQUIRED, from the table above
  "typeName": "User",        // OPTIONAL, source language's own name for the type
  "source": "python-repr",   // REQUIRED, id of the adapter that produced this node
  "meta": {}                 // OPTIONAL, adapter-specific; views must tolerate absence
}
```

Per-kind additions:

```jsonc
// map
{ "entries": [ { "key": <Node>, "value": <Node> } ], "totalCount": 12 }

// sequence | set
{ "items": [ <Node> ], "totalCount": 1000000 }

// object
{
  "fields": [ { "name": "id", "value": <Node>, "category": "data", "lazy": false } ],
  "args":   [ <Node> ]
}

// scalar
{ "scalarType": "int", "value": 9007199254740993, "raw": "9007199254740993" }

// opaque
{ "text": "<User: id=1>", "address": "0x7f9a2c" }

// ref
{ "target": "$[\"owner\"]", "cycle": true }
```

### `totalCount` — lazy loading is part of the contract

`items`/`entries` may hold a *window* of the children, not all of them. `totalCount` is the true
size. When `totalCount > items.length`, more children are fetchable via `NodeSource.getChildren`.
Static adapters set them equal; the live server pages. **This is why views work identically in
static and live mode** — they read `totalCount` and ask for what they need, and never learn which
mode they are in.

### `scalar.raw` — precision is not optional

`value` is the convenient JS/JSON form; `raw` is the exact source text. They diverge in cases that
matter and that a naive implementation loses:

- Python bignums and Java `long` exceed `Number.MAX_SAFE_INTEGER`, so `value` is lossy — **`raw` is
  authoritative for `scalarType: "int"`** and views must render `raw` when present.
- `inf`, `-inf`, `nan` have no JSON representation; `value` is `null` and `raw` carries the text.
- `-0.0`, `1e400`, and trailing-zero decimals (`1.50`) survive only in `raw`.

`scalarType` is one of `string | int | float | bool | null | bytes | complex`.

### `object.fields[].category` and `lazy`

Live mode only; static adapters may omit both.

- `category`: `data` (instance attribute) · `property` (descriptor) · `method` · `dunder`.
  Views group and filter by this so `dir()` noise is collapsible.
- `lazy: true` means **the value has not been computed and must not be computed automatically.**
  Property getters run arbitrary code with side effects; the UI renders these as an explicit
  "evaluate" affordance. A producer must never eagerly call a property getter to fill in a value.

### `ref` — the only way to represent sharing

`repr()` output cannot express object identity, so adapters parsing text emit `ref` only for
Python's `...` recursion marker. Producers with real `id()` access (live server, export snippet)
emit `ref` whenever an object is reached a second time. `cycle: true` distinguishes a back-edge
into an ancestor (a true cycle) from a mere shared reference (a DAG join) — the graph view styles
them differently, so the distinction must be computed by the producer, not guessed by the view.

---

## 4. Node IDs

`id` is the structural path from the root, and doubles as React key, selection handle, and the
value behind "copy path". Where a legal access expression exists, **the id *is* that expression**:

| Construct | Id form | Example |
| --- | --- | --- |
| root | `$` | `$` |
| map entry value | `$[<key literal>]` | `$["users"]` |
| sequence item | `$[<index>]` | `$["users"][0]` |
| object field | `$.<name>` | `$["users"][0].name` |
| object positional arg | `$@arg<n>` | `$.created@arg0` |
| map key node | `$@key<n>` | `$@key0` |
| set item | `$@item<n>` | `$.tags@item0` |

The `@` forms mark positions with no addressable expression (you cannot subscript a set), which is
also the signal to the UI that "copy path" should be disabled rather than offering a lie.

Key literals are emitted in the **source language's** syntax, so a Python path pastes into Python
and a JSON path reads naturally. Duplicate ids are impossible for dict/set semantics, but a
malformed input can produce them; `buildGraph` appends `~2`, `~3`… and emits a warning diagnostic
rather than silently losing a node.

---

## 5. Diagnostics

Adapters **must not throw.** Unparseable input yields an `opaque` node covering the bad span plus a
diagnostic. One `<User: id=1>` in a 4000-line dump must not cost the other 3999 lines.

```jsonc
{
  "severity": "error",         // error | warning | info
  "message": "Unterminated string literal",
  "line": 42, "column": 17,    // 1-based, both optional
  "offset": 1180, "length": 3, // 0-based byte offset into input, optional
  "nodeId": "$[\"a\"][2]"      // node standing in for the bad span, optional
}
```

---

## 6. Snapshot file format

What `objectlens.dump()` and `snippets/export.py` write, and what the hosted site loads. This is
the bridge that lets a locally-inspected object be viewed on the public site.

```jsonc
{
  "$schema": "https://objectlens.dev/schema/v1",
  "schemaVersion": 1,
  "source": "python-live",
  "generator": "objectlens/0.1.0",   // or "objectlens-snippet/0.1.0"
  "createdAt": "2026-08-06T12:00:00Z",
  "root": <Node>,
  "diagnostics": [ <Diagnostic> ],
  "truncated": false                  // true if depth/size limits cut the walk short
}
```

`$schema` presence is what the site's snapshot adapter sniffs on. Consumers reject unknown major
`schemaVersion` outright — a viewer that guesses at a format it does not know produces confidently
wrong output, which is worse than an error message.

---

## 7. HTTP API (live mode only)

Served from `http://127.0.0.1:<port>` by the local package, same-origin with the bundle it serves.
Never exposed publicly, never bound to `0.0.0.0`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | `{ "ok": true, "version": "0.1.0" }` — the probe the UI uses to enable live features |
| `GET` | `/api/root` | The root `Node` |
| `GET` | `/api/node/{id}/children?offset=&limit=` | A window of children; `{ items, totalCount }` |
| `POST` | `/api/node/{id}/evaluate` | Force-evaluate one `lazy` field. Never called implicitly. |

Ids are opaque handle strings in live mode (backed by `id()`), not the `$`-paths of §4 — the same
object reachable by two paths must return one identity, which path-shaped ids cannot express.
