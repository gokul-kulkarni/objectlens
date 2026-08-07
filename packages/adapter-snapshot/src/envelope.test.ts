import { describe, expect, it } from 'vitest';
import { hasErrors } from '@objectlens/core';
import { SUPPORTED_SCHEMA_VERSION, readEnvelope } from './envelope.js';

const valid = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    $schema: 'https://objectlens.dev/schema/v1',
    schemaVersion: 1,
    source: 'python-live',
    generator: 'objectlens-snippet/0.1.0',
    root: { id: '$', kind: 'scalar', source: 'python-live', scalarType: 'int', value: 1 },
    diagnostics: [],
    truncated: false,
    ...extra,
  });

describe('accepting a well-formed snapshot', () => {
  it('reads the envelope fields the viewer needs', () => {
    const { envelope } = readEnvelope(valid());

    expect(envelope?.source).toBe('python-live');
    expect(envelope?.generator).toBe('objectlens-snippet/0.1.0');
    expect(envelope?.truncated).toBe(false);
  });

  it('carries the producer’s own diagnostics through', () => {
    // "12 properties were not evaluated" is a fact about the export, not a complaint about the
    // file. Dropping it leaves the reader wondering where an attribute went.
    const { envelope } = readEnvelope(
      valid({ diagnostics: [{ severity: 'info', message: 'properties were not evaluated' }] }),
    );

    expect(envelope?.diagnostics).toHaveLength(1);
    expect(envelope?.diagnostics[0]?.severity).toBe('info');
  });

  it('defaults a missing source rather than refusing the file over it', () => {
    const { envelope } = readEnvelope(valid({ source: undefined }));
    expect(envelope?.source).toBe('objectlens-snapshot');
  });
});

describe('refusing what it cannot vouch for', () => {
  const rejects = (text: string) => {
    const { envelope, diagnostics } = readEnvelope(text);
    expect(envelope).toBeNull();
    expect(hasErrors(diagnostics)).toBe(true);
    return diagnostics[0]?.message ?? '';
  };

  it('rejects text that is not JSON, saying why', () => {
    expect(rejects('{oops')).toContain('Not valid JSON');
  });

  it('rejects JSON that is not an object', () => {
    expect(rejects('[1, 2, 3]')).toContain('must be a JSON object');
  });

  it('rejects a file with no schemaVersion', () => {
    expect(rejects(JSON.stringify({ root: {} }))).toContain('schemaVersion');
  });

  it('rejects a newer major version instead of guessing at it', () => {
    // A viewer that guesses at a format it does not know renders confidently wrong output, which
    // is worse than an error message — the reader has no way to tell it went wrong.
    const message = rejects(valid({ schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 }));

    expect(message).toContain('newer than this build');
    expect(message).toContain('Update ObjectLens');
  });

  it('rejects an older major version too', () => {
    expect(rejects(valid({ schemaVersion: 0 }))).toContain('no longer supported');
  });

  it('rejects a snapshot with no root', () => {
    expect(rejects(JSON.stringify({ schemaVersion: 1 }))).toContain('no `root`');
  });
});

describe('tolerating damage that does not invalidate the file', () => {
  it('ignores malformed diagnostics and says how many', () => {
    const { envelope, diagnostics } = readEnvelope(
      valid({
        diagnostics: [
          { severity: 'info', message: 'kept' },
          { severity: 'shouting', message: 'bad severity' },
          { message: 'no severity' },
          'not an object',
        ],
      }),
    );

    expect(envelope?.diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('3 malformed diagnostics');
  });

  it('treats a non-boolean truncated as not truncated', () => {
    // Claiming truncation the producer did not report would tell the reader data is missing when
    // it is not, which is its own kind of wrong.
    expect(readEnvelope(valid({ truncated: 'yes' })).envelope?.truncated).toBe(false);
  });

  it('accepts a fractional version by its major part', () => {
    expect(readEnvelope(valid({ schemaVersion: 1.4 })).envelope).not.toBeNull();
  });
});
