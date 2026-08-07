/**
 * Snapshot JSON → IR nodes.
 *
 * The file claims to already be in our format, so the temptation is to cast it and move on. That
 * would make every field in `docs/schema.md` a trust boundary with nothing behind it: a snapshot
 * arrives by drag-and-drop from wherever, and a hand-edited or half-written one must produce a
 * diagnostic rather than a view that renders `undefined` as though it were data.
 *
 * Tolerance is the same rule the text adapters follow (§5): one malformed node becomes an
 * `opaque` node plus a diagnostic, and the other 3,999 survive. That is also why this is written
 * out by hand rather than handed to a schema library — an all-or-nothing `parse()` would discard
 * an entire usable graph over a single bad field.
 */

import {
  MAX_PARSE_DEPTH,
  parseWarning,
  type Diagnostic,
  type MapEntry,
  type Node,
  type NodeKind,
  type ObjectField,
  type ScalarNode,
  type ScalarType,
  type SourceId,
} from '@objectlens/core';
import { isRecord, optional, readNumber, readString } from './envelope.js';

/** Cap on nodes read from one snapshot, so a hostile file cannot exhaust the tab. */
export const MAX_SNAPSHOT_NODES = 500_000;

const KINDS = new Set<string>([
  'map',
  'sequence',
  'set',
  'object',
  'scalar',
  'opaque',
  'ref',
] satisfies NodeKind[]);

const SCALAR_TYPES = new Set<string>([
  'string',
  'int',
  'float',
  'bool',
  'null',
  'bytes',
  'complex',
] satisfies ScalarType[]);

export interface ValidateOutcome {
  readonly root: Node;
  readonly diagnostics: readonly Diagnostic[];
  readonly truncated: boolean;
}

export function validateSnapshot(root: unknown, source: SourceId): ValidateOutcome {
  const state = new Reader(source);
  const node = state.read(root, '$', 0);

  state.checkRefTargets();

  return { root: node, diagnostics: state.diagnostics, truncated: state.truncated };
}

class Reader {
  readonly diagnostics: Diagnostic[] = [];
  truncated = false;

  readonly #source: SourceId;
  readonly #ids = new Set<string>();
  readonly #refs: { readonly from: string; readonly target: string }[] = [];
  #count = 0;

  constructor(source: SourceId) {
    this.#source = source;
  }

  read(value: unknown, fallbackId: string, depth: number): Node {
    this.#count += 1;

    if (this.#count > MAX_SNAPSHOT_NODES) {
      this.truncated = true;
      return this.#placeholder(fallbackId, 'not loaded: snapshot node limit reached');
    }

    if (depth > MAX_PARSE_DEPTH) {
      this.truncated = true;
      this.#warn(`Snapshot is nested deeper than ${MAX_PARSE_DEPTH} levels; the rest is omitted.`, fallbackId);
      return this.#placeholder(fallbackId, 'not loaded: too deeply nested');
    }

    if (!isRecord(value)) {
      this.#warn(`Expected a node object at ${fallbackId}.`, fallbackId);
      return this.#placeholder(fallbackId, `not a node: ${describe(value)}`);
    }

    const id = this.#idOf(value, fallbackId);
    const kind = readString(value['kind']);

    if (kind === undefined || !KINDS.has(kind)) {
      this.#warn(`Unknown node kind ${JSON.stringify(kind)} at ${id}.`, id);
      return this.#placeholder(id, `unknown kind: ${String(kind)}`);
    }

    const base = {
      id,
      // A node may name its own producer — a snapshot of a graph assembled from several sources
      // keeps that per node — but falls back to the envelope's.
      source: readString(value['source']) ?? this.#source,
      ...optional('typeName', readString(value['typeName'])),
      ...optional('meta', isRecord(value['meta']) ? value['meta'] : undefined),
    };

    switch (kind as NodeKind) {
      case 'map':
        return { ...base, kind: 'map', entries: this.#entries(value, id, depth), ...this.#total(value) };
      case 'sequence':
        return { ...base, kind: 'sequence', items: this.#items(value, id, depth), ...this.#total(value) };
      case 'set':
        return { ...base, kind: 'set', items: this.#items(value, id, depth), ...this.#total(value) };
      case 'object':
        return { ...base, kind: 'object', ...this.#objectBody(value, id, depth) };
      case 'scalar':
        return { ...base, ...this.#scalarBody(value, id) };
      case 'opaque':
        return {
          ...base,
          kind: 'opaque',
          text: readString(value['text']) ?? '<no text>',
          ...optional('address', readString(value['address'])),
        };
      case 'ref':
        return this.#ref(value, base, id);
    }
  }

  /** Reports refs pointing at ids the snapshot never defines — a half-written export. */
  checkRefTargets(): void {
    const dangling = this.#refs.filter((ref) => !this.#ids.has(ref.target));
    if (dangling.length === 0) return;

    const first = dangling[0];
    const rest = dangling.length - 1;
    this.diagnostics.push(
      parseWarning(
        `${dangling.length} reference${dangling.length === 1 ? '' : 's'} point at nodes that are ` +
          `not in this snapshot (first: ${first?.from} → ${first?.target}${rest > 0 ? `, +${rest} more` : ''}).`,
        { ...optional('nodeId', first?.from) },
      ),
    );
  }

  // -- per-kind bodies -------------------------------------------------

  #entries(value: Record<string, unknown>, id: string, depth: number): readonly MapEntry[] {
    const raw = value['entries'];
    if (!Array.isArray(raw)) {
      this.#warn(`Map ${id} has no \`entries\` array.`, id);
      return [];
    }

    return raw.map((entry, index) => {
      if (!isRecord(entry)) {
        this.#warn(`Entry ${index} of ${id} is not an object.`, id);
        return {
          key: this.#placeholder(`${id}@key${index}`, 'malformed entry'),
          value: this.#placeholder(`${id}@value${index}`, 'malformed entry'),
        };
      }

      return {
        key: this.read(entry['key'], `${id}@key${index}`, depth + 1),
        value: this.read(entry['value'], `${id}@value${index}`, depth + 1),
      };
    });
  }

  #items(value: Record<string, unknown>, id: string, depth: number): readonly Node[] {
    const raw = value['items'];
    if (!Array.isArray(raw)) {
      this.#warn(`${id} has no \`items\` array.`, id);
      return [];
    }
    return raw.map((item, index) => this.read(item, `${id}[${index}]`, depth + 1));
  }

  #objectBody(
    value: Record<string, unknown>,
    id: string,
    depth: number,
  ): { fields: readonly ObjectField[]; args?: readonly Node[] } {
    const rawFields = value['fields'];
    const fields: ObjectField[] = [];

    if (Array.isArray(rawFields)) {
      rawFields.forEach((field, index) => {
        if (!isRecord(field)) {
          this.#warn(`Field ${index} of ${id} is not an object.`, id);
          return;
        }

        const name = readString(field['name']) ?? `field${index}`;
        fields.push({
          name,
          value: this.read(field['value'], `${id}.${name}`, depth + 1),
          ...optional('category', readCategory(field['category'])),
          ...optional('lazy', field['lazy'] === true ? true : undefined),
        });
      });
    } else if (rawFields !== undefined) {
      this.#warn(`Object ${id} has a \`fields\` that is not an array.`, id);
    }

    const rawArgs = value['args'];
    if (!Array.isArray(rawArgs)) return { fields };

    return {
      fields,
      args: rawArgs.map((arg, index) => this.read(arg, `${id}@arg${index}`, depth + 1)),
    };
  }

  #scalarBody(value: Record<string, unknown>, id: string): Omit<ScalarNode, 'id' | 'source'> {
    const scalarType = readString(value['scalarType']);
    if (scalarType === undefined || !SCALAR_TYPES.has(scalarType)) {
      this.#warn(`Scalar ${id} has unknown scalarType ${JSON.stringify(scalarType)}.`, id);
    }

    const raw = readString(value['raw']);
    const primitive = value['value'];
    const usable =
      typeof primitive === 'string' ||
      typeof primitive === 'number' ||
      typeof primitive === 'boolean' ||
      primitive === null;

    return {
      kind: 'scalar',
      scalarType: (SCALAR_TYPES.has(scalarType ?? '') ? scalarType : 'string') as ScalarType,
      // `null` is a legitimate value — it is how `inf` and `nan` arrive, with `raw` carrying the
      // text — so a missing `value` is only a problem when `raw` is missing too.
      value: usable ? (primitive as ScalarNode['value']) : (raw ?? null),
      ...optional('raw', raw),
    };
  }

  #ref(value: Record<string, unknown>, base: RefBase, id: string): Node {
    const target = readString(value['target']);
    if (target === undefined) {
      this.#warn(`Reference ${id} has no \`target\`.`, id);
      return this.#placeholder(id, 'reference with no target');
    }

    this.#refs.push({ from: id, target });
    return { ...base, kind: 'ref', target, cycle: value['cycle'] === true };
  }

  // -- helpers ---------------------------------------------------------

  #total(value: Record<string, unknown>): { totalCount?: number } {
    const total = readNumber(value['totalCount']);
    return total === undefined ? {} : { totalCount: total };
  }

  #idOf(value: Record<string, unknown>, fallbackId: string): string {
    const id = readString(value['id']);
    if (id === undefined || id === '') {
      this.#warn(`Node at ${fallbackId} has no id; using its position instead.`, fallbackId);
      this.#ids.add(fallbackId);
      return fallbackId;
    }
    this.#ids.add(id);
    return id;
  }

  #placeholder(id: string, text: string): Node {
    return { id, kind: 'opaque', source: this.#source, text: `<${text}>` };
  }

  #warn(message: string, nodeId: string): void {
    // One diagnostic per distinct problem is useful; ten thousand is a wall of text that hides
    // the first one, which is the only one anybody reads.
    if (this.diagnostics.length >= MAX_DIAGNOSTICS) return;
    this.diagnostics.push(parseWarning(message, { nodeId }));

    if (this.diagnostics.length === MAX_DIAGNOSTICS) {
      this.diagnostics.push(parseWarning('Further snapshot problems were not reported.'));
    }
  }
}

const MAX_DIAGNOSTICS = 50;

type RefBase = {
  readonly id: string;
  readonly source: SourceId;
  readonly typeName?: string;
  readonly meta?: Record<string, unknown>;
};

const CATEGORIES = new Set(['data', 'property', 'method', 'dunder']);

function readCategory(value: unknown): ObjectField['category'] | undefined {
  const category = readString(value);
  return category !== undefined && CATEGORIES.has(category)
    ? (category as ObjectField['category'])
    : undefined;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}
