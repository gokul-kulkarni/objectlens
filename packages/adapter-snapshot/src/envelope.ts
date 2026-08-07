/**
 * The snapshot envelope — `docs/schema.md` §6.
 *
 * A snapshot is the bridge between a live Python process and the hosted site: `objectlens.dump()`
 * and `python/snippets/export.py` write it, this reads it. It is the one input here that claims to
 * already be in our own format, which is exactly why it gets the strictest checking. Everything in
 * the file is untrusted — it arrives by drag-and-drop from wherever.
 *
 * Version handling is deliberately blunt: an unknown **major** version is refused outright rather
 * than parsed hopefully. A viewer that guesses at a format it does not know renders confidently
 * wrong output, and being wrong about someone's data is worse than declining to show it.
 */

import { parseError, parseWarning, type Diagnostic } from '@objectlens/core';

export const SNAPSHOT_SCHEMA_URL = 'https://objectlens.dev/schema/v1';
/** The only major version this build understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

export interface SnapshotEnvelope {
  readonly root: unknown;
  /** Which producer wrote it — `python-live` for both the package and the snippet. */
  readonly source: string;
  readonly generator?: string;
  readonly createdAt?: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly truncated: boolean;
}

export interface EnvelopeOutcome {
  readonly envelope: SnapshotEnvelope | null;
  readonly diagnostics: readonly Diagnostic[];
}

const DEFAULT_SOURCE = 'objectlens-snapshot';

export function readEnvelope(text: string): EnvelopeOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      envelope: null,
      diagnostics: [parseError(`Not valid JSON: ${messageOf(error)}`)],
    };
  }

  if (!isRecord(parsed)) {
    return { envelope: null, diagnostics: [parseError('A snapshot must be a JSON object.')] };
  }

  const version = parsed['schemaVersion'];
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return {
      envelope: null,
      diagnostics: [parseError('Missing `schemaVersion`; this does not look like a snapshot.')],
    };
  }

  const major = Math.floor(version);
  if (major > SUPPORTED_SCHEMA_VERSION) {
    return {
      envelope: null,
      diagnostics: [
        parseError(
          `Snapshot schema version ${major} is newer than this build understands ` +
            `(${SUPPORTED_SCHEMA_VERSION}). Update ObjectLens, or export again with an older writer.`,
        ),
      ],
    };
  }
  if (major < SUPPORTED_SCHEMA_VERSION) {
    return {
      envelope: null,
      diagnostics: [
        parseError(`Snapshot schema version ${major} is no longer supported by this build.`),
      ],
    };
  }

  if (!('root' in parsed)) {
    return { envelope: null, diagnostics: [parseError('Snapshot has no `root` node.')] };
  }

  const diagnostics: Diagnostic[] = [];
  const { diagnostics: carried, dropped } = readDiagnostics(parsed['diagnostics']);
  if (dropped > 0) {
    diagnostics.push(
      parseWarning(`${dropped} malformed diagnostic${dropped === 1 ? '' : 's'} were ignored.`),
    );
  }

  return {
    envelope: {
      root: parsed['root'],
      source: readString(parsed['source']) ?? DEFAULT_SOURCE,
      ...optional('generator', readString(parsed['generator'])),
      ...optional('createdAt', readString(parsed['createdAt'])),
      // The producer's own diagnostics are part of the payload: "12 properties were not
      // evaluated" is a fact about the export, and dropping it would leave the reader wondering
      // where an attribute went.
      diagnostics: carried,
      truncated: parsed['truncated'] === true,
    },
    diagnostics,
  };
}

const SEVERITIES = new Set(['error', 'warning', 'info']);

function readDiagnostics(value: unknown): { diagnostics: Diagnostic[]; dropped: number } {
  if (!Array.isArray(value)) return { diagnostics: [], dropped: 0 };

  const diagnostics: Diagnostic[] = [];
  let dropped = 0;

  for (const entry of value) {
    if (!isRecord(entry)) {
      dropped += 1;
      continue;
    }

    const message = readString(entry['message']);
    const severity = readString(entry['severity']);

    if (message === undefined || severity === undefined || !SEVERITIES.has(severity)) {
      dropped += 1;
      continue;
    }

    diagnostics.push({
      severity: severity as Diagnostic['severity'],
      message,
      ...optional('line', readNumber(entry['line'])),
      ...optional('column', readNumber(entry['column'])),
      ...optional('offset', readNumber(entry['offset'])),
      ...optional('length', readNumber(entry['length'])),
      ...optional('nodeId', readString(entry['nodeId'])),
    });
  }

  return { diagnostics, dropped };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Spreads a key only when it has a value, so `exactOptionalPropertyTypes` stays satisfiable. */
export function optional<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
