/**
 * YAML document tree → IR.
 *
 * The grammar is not hand-written. YAML is a genuinely large specification — anchors, tags, three
 * scalar styles, block and flow collections, directives, multi-document streams — and `yaml`
 * already implements it, with byte ranges and non-fatal errors, which is exactly the shape this
 * contract wants. Writing a third parser here would take weeks and be worse. That is also the
 * honest test of the plugin seam: a real adapter author reaches for the library for their format
 * and writes only the mapping, which is this file.
 *
 * The interesting part is that YAML has **anchors and aliases**, so like the live Python exporter
 * — and unlike any `repr()` text — it can express real sharing and real cycles. `&base`/`*base`
 * becomes a `ref`, and `&a [*a]` becomes a `ref` with `cycle: true`. The graph view then draws it
 * without knowing YAML exists.
 */

import {
  MAX_PARSE_DEPTH,
  buildGraph,
  createIdAllocator,
  diagnostic,
  fieldChild,
  indexChild,
  keyChild,
  keyNodeChild,
  keyValueChild,
  ROOT_ID,
  setItemChild,
  type Diagnostic,
  type MapEntry,
  type Node,
  type NodeId,
  type ObjectField,
  type ScalarType,
  type Severity,
} from '@objectlens/core';
import {
  LineCounter,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  type Alias,
  type Document,
  type Node as YamlNode,
  type Scalar,
  type YAMLError,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';

export const YAML_SOURCE_ID = 'yaml';

/** Ceiling on IR nodes, so a pathological document degrades rather than hanging the worker. */
export const MAX_YAML_NODES = 500_000;

const SET_TAG = 'tag:yaml.org,2002:set';
const BINARY_TAG = 'tag:yaml.org,2002:binary';
/** The prefix on every tag the YAML spec itself defines; anything else is the author's own. */
const STANDARD_TAG_PREFIX = 'tag:yaml.org,2002:';

/**
 * Tag resolution "failing" is the normal case for a custom tag like `!User`, and we handle it —
 * the tag becomes the node's `typeName`. Reporting it would put a warning on perfectly good input.
 */
const SUPPRESSED_ERROR_CODES = new Set(['TAG_RESOLVE_FAILED']);

const INTEGER_SOURCE = /^[-+]?(?:0x[0-9a-fA-F_]+|0o?[0-7_]+|0b[01_]+|[0-9_]+)$/;

export interface YamlParseOutcome {
  readonly root: Node;
  readonly diagnostics: readonly Diagnostic[];
  readonly truncated: boolean;
}

export function parseYaml(text: string): YamlParseOutcome {
  const lineCounter = new LineCounter();
  // `parseAllDocuments` never throws: everything it dislikes lands in `doc.errors` with a range,
  // which is the tolerance rule the adapter contract requires, already implemented.
  const parsed = parseAllDocuments(text, { lineCounter, prettyErrors: false });
  const documents = Array.from(parsed);

  const converter = new Converter(lineCounter);
  const root = converter.convertStream(documents);

  return { root, diagnostics: converter.diagnostics, truncated: converter.truncated };
}

/** Convenience for callers that want a graph rather than a bare root. */
export function parseYamlToGraph(text: string) {
  const { root, diagnostics, truncated } = parseYaml(text);
  return buildGraph(root, YAML_SOURCE_ID, { diagnostics, truncated });
}

class Converter {
  readonly diagnostics: Diagnostic[] = [];
  truncated = false;

  readonly #lineCounter: LineCounter;
  readonly #ids = createIdAllocator();
  /** Anchor name → the id of the node it names. Reset per document: anchors do not cross `---`. */
  #anchors = new Map<string, NodeId>();
  /** Ids on the path from the root to the node being built, for telling a cycle from a share. */
  #ancestors = new Set<NodeId>();
  #count = 0;

  constructor(lineCounter: LineCounter) {
    this.#lineCounter = lineCounter;
  }

  convertStream(documents: readonly Document.Parsed[]): Node {
    for (const document of documents) {
      this.#collectErrors(document.errors, 'error');
      this.#collectErrors(document.warnings, 'warning');
    }

    if (documents.length === 0) {
      // An empty file is not an error — it is an empty document, which YAML says resolves to null.
      return this.#nullNode(this.#ids.allocate(ROOT_ID));
    }

    if (documents.length === 1) {
      this.#anchors = new Map();
      return this.#convert(documents[0]?.contents ?? null, this.#ids.allocate(ROOT_ID), 0);
    }

    // A stream of documents is a sequence of them. `typeName` says so, because the reader needs to
    // know these are separate documents rather than a list that happened to be written that way.
    const rootId = this.#ids.allocate(ROOT_ID);
    const items = documents.map((document, index) => {
      // Anchors are document-scoped in YAML: `&x` in the second document is unrelated to the
      // first. Sharing one table across documents would invent references that are not there.
      this.#anchors = new Map();
      return this.#convert(document.contents, this.#ids.allocate(indexChild(rootId, index)), 1);
    });

    return {
      id: rootId,
      kind: 'sequence',
      source: YAML_SOURCE_ID,
      typeName: 'documents',
      items,
    };
  }

  // -- dispatch --------------------------------------------------------

  #convert(node: YamlNode | null, id: NodeId, depth: number): Node {
    this.#count += 1;

    if (this.#count > MAX_YAML_NODES || depth > MAX_PARSE_DEPTH) {
      this.truncated = true;
      return { id, kind: 'opaque', source: YAML_SOURCE_ID, text: '<not read: limit reached>' };
    }

    if (node === null || node === undefined) return this.#nullNode(id);

    if (isAlias(node)) return this.#alias(node, id);

    // Recorded before descending, so `&a [*a]` can point at the collection containing it.
    const anchor = 'anchor' in node ? node.anchor : undefined;
    if (typeof anchor === 'string' && anchor !== '') this.#anchors.set(anchor, id);

    if (isScalar(node)) return this.#scalar(node, id);

    this.#ancestors.add(id);
    try {
      if (isMap(node)) return this.#mapping(node, id, depth);
      if (isSeq(node)) return this.#sequence(node, id, depth);
    } finally {
      this.#ancestors.delete(id);
    }

    return { id, kind: 'opaque', source: YAML_SOURCE_ID, text: '<unrecognised YAML node>' };
  }

  // -- kinds -----------------------------------------------------------

  #scalar(node: Scalar, id: NodeId): Node {
    const source = typeof node.source === 'string' ? node.source : undefined;
    const value = node.value;

    if (node.tag === BINARY_TAG) {
      // `!!binary` resolves to bytes, which have no JSON form. The base64 source is the honest
      // rendering and is what the reader wrote.
      return {
        id,
        kind: 'scalar',
        source: YAML_SOURCE_ID,
        scalarType: 'bytes',
        value: source ?? '',
        ...(source === undefined ? {} : { raw: source }),
        typeName: 'binary',
      };
    }

    const scalarType = scalarTypeOf(value, source);
    const base = {
      id,
      kind: 'scalar' as const,
      source: YAML_SOURCE_ID,
      scalarType,
      ...tagName(node.tag),
    };

    if (typeof value === 'number' && !Number.isFinite(value)) {
      // `.inf` and `.nan` have no JSON representation, so `value` admits it and `raw` carries the
      // text — the same split the Python adapters use, for the same reason.
      return { ...base, value: null, raw: source ?? String(value) };
    }

    if (typeof value === 'bigint') {
      return { ...base, value: Number(value), raw: source ?? String(value) };
    }

    return {
      ...base,
      value: (value ?? null) as string | number | boolean | null,
      // `raw` matters wherever the source text and the parsed value differ: `0x1f` reads as 31,
      // and an integer past 2^53 has already been rounded by the time it is a JS number.
      ...(source === undefined || source === '' || source === String(value) ? {} : { raw: source }),
    };
  }

  #mapping(node: YAMLMap, id: NodeId, depth: number): Node {
    // `!!set` is written as a mapping whose values are all null. It is a set, and rendering it as
    // a map of things-to-nothing would be a worse account of what the author wrote.
    if (node.tag === SET_TAG) {
      return {
        id,
        kind: 'set',
        source: YAML_SOURCE_ID,
        typeName: 'set',
        items: node.items.map((pair, index) =>
          this.#convert(
            (pair.key ?? null) as YamlNode | null,
            this.#ids.allocate(setItemChild(id, index)),
            depth + 1,
          ),
        ),
      };
    }

    // A custom tag on a mapping is the author saying "this is a typed thing", which is what
    // `object` is for — the same rendering a Python `User(id=1)` gets. See docs/schema.md §2.
    const custom = customTag(node.tag);
    if (custom !== undefined && node.items.every((pair) => isPlainStringKey(pair.key))) {
      return {
        id,
        kind: 'object',
        source: YAML_SOURCE_ID,
        typeName: custom,
        fields: node.items.map((pair): ObjectField => {
          const name = String((pair.key as Scalar).value);
          return {
            name,
            value: this.#convert(
              (pair.value ?? null) as YamlNode | null,
              this.#ids.allocate(fieldChild(id, name)),
              depth + 1,
            ),
          };
        }),
      };
    }

    return {
      id,
      kind: 'map',
      source: YAML_SOURCE_ID,
      typeName: 'map',
      ...tagName(node.tag),
      entries: node.items.map((pair, index): MapEntry => {
        const keyId = this.#ids.allocate(keyNodeChild(id, index));
        const key = this.#convert((pair.key ?? null) as YamlNode | null, keyId, depth + 1);

        const literal = keyLiteralOf(key);
        // A complex key — `? [1, 2]` — leaves its value with no subscript expression, so the
        // value takes an unaddressable position rather than a path that would not resolve.
        const valueId = this.#ids.allocate(
          literal === null ? keyValueChild(id, index) : keyChild(id, literal),
        );

        return {
          key,
          value: this.#convert((pair.value ?? null) as YamlNode | null, valueId, depth + 1),
        };
      }),
    };
  }

  #sequence(node: YAMLSeq, id: NodeId, depth: number): Node {
    const custom = customTag(node.tag);

    return {
      id,
      kind: 'sequence',
      source: YAML_SOURCE_ID,
      typeName: custom ?? 'seq',
      items: node.items.map((item, index) =>
        this.#convert(
          (item ?? null) as YamlNode | null,
          this.#ids.allocate(indexChild(id, index)),
          depth + 1,
        ),
      ),
    };
  }

  #alias(node: Alias, id: NodeId): Node {
    const target = this.#anchors.get(node.source);

    if (target === undefined) {
      // YAML requires an anchor to precede its aliases, so this means the document is broken or
      // the anchor is in a different document. Pointing at nothing would be worse than saying so.
      this.#diagnose('error', `No anchor named "${node.source}" is defined before this alias.`, id);
      return {
        id,
        kind: 'opaque',
        source: YAML_SOURCE_ID,
        text: `<undefined alias *${node.source}>`,
      };
    }

    return {
      id,
      kind: 'ref',
      source: YAML_SOURCE_ID,
      typeName: `*${node.source}`,
      target,
      // A back-edge into a collection we are currently inside is a true cycle; anything else is a
      // second route to a node drawn elsewhere. The graph view styles them differently, so the
      // producer has to decide — a view cannot recover the distinction.
      cycle: this.#ancestors.has(target),
    };
  }

  // -- helpers ---------------------------------------------------------

  #nullNode(id: NodeId): Node {
    return {
      id,
      kind: 'scalar',
      source: YAML_SOURCE_ID,
      scalarType: 'null',
      value: null,
      raw: 'null',
    };
  }

  #collectErrors(errors: readonly YAMLError[], severity: Severity): void {
    for (const error of errors) {
      if (SUPPRESSED_ERROR_CODES.has(error.code)) continue;

      const start = error.linePos?.[0] ?? this.#lineCounter.linePos(error.pos[0]);
      this.diagnostics.push(
        diagnostic(severity, error.message, {
          line: start.line,
          column: start.col,
          offset: error.pos[0],
          length: Math.max(0, error.pos[1] - error.pos[0]),
        }),
      );
    }
  }

  #diagnose(severity: Severity, message: string, nodeId: NodeId): void {
    this.diagnostics.push(diagnostic(severity, message, { nodeId }));
  }
}

/**
 * How a key is rendered inside a path.
 *
 * YAML has no subscript syntax of its own — it is a data format, not a language — so the paths
 * follow the JSON form, which is what `yq` and every other YAML tool accepts.
 */
function keyLiteralOf(key: Node): string | null {
  if (key.kind !== 'scalar') return null;
  if (key.scalarType === 'string') return JSON.stringify(String(key.value));
  return key.raw ?? JSON.stringify(key.value);
}

function isPlainStringKey(key: unknown): boolean {
  return isScalar(key) && typeof key.value === 'string';
}

/** The author's own tag, or undefined for an untagged node or one of YAML's own tags. */
function customTag(tag: string | undefined): string | undefined {
  if (tag === undefined || tag.startsWith(STANDARD_TAG_PREFIX)) return undefined;
  return tag;
}

function tagName(tag: string | undefined): { typeName?: string } {
  const custom = customTag(tag);
  return custom === undefined ? {} : { typeName: custom };
}

function scalarTypeOf(value: unknown, source: string | undefined): ScalarType {
  if (value === null || value === undefined) return 'null';

  switch (typeof value) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'bool';
    case 'bigint':
      return 'int';
    case 'number':
      // The source text decides, not the value: `1.0` is a float that happens to be integral, and
      // `0x1f` is an int that does not look like one.
      return source !== undefined && INTEGER_SOURCE.test(source) ? 'int' : 'float';
    default:
      return 'string';
  }
}
