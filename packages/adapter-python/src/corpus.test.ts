/**
 * Corpus test: every case is a real `repr()` string captured from CPython, not written from
 * memory. See `python/fixtures/generate_corpus.py`.
 *
 * The blanket assertion is that no real repr produces a parse *error*. Warnings are allowed —
 * tolerated oddities are a legitimate outcome — but an error means the grammar is wrong about
 * something an interpreter actually emits.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasErrors, type Node } from '@objectlens/core';
import { parsePython } from './parser.js';

interface CorpusCase {
  readonly group: string;
  readonly name: string;
  readonly repr: string;
}

const corpusPath = fileURLToPath(
  new URL('../../../docs/fixtures/python-corpus.json', import.meta.url),
);
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as {
  pythonVersion: string;
  cases: CorpusCase[];
};

const byName = new Map(corpus.cases.map((entry) => [entry.name, entry]));

function parseCase(name: string): { root: Node; repr: string } {
  const entry = byName.get(name);
  if (entry === undefined) throw new Error(`corpus case "${name}" is missing`);
  return { root: parsePython(entry.repr).root, repr: entry.repr };
}

describe('corpus integrity', () => {
  it('was generated from a real interpreter', () => {
    expect(corpus.pythonVersion).toMatch(/^3\.\d+/);
    expect(corpus.cases.length).toBeGreaterThan(50);
  });
});

describe('every captured repr parses without errors', () => {
  it.each(corpus.cases.map((entry) => [entry.group, entry.name, entry.repr] as const))(
    '%s/%s',
    (_group, _name, repr) => {
      const { diagnostics } = parsePython(repr);

      expect(
        hasErrors(diagnostics),
        `${repr}\n${diagnostics.map((d) => `${d.severity}: ${d.message}`).join('\n')}`,
      ).toBe(false);
    },
  );
});

describe('kinds are classified correctly', () => {
  it.each([
    ['none', 'scalar'],
    ['int', 'scalar'],
    ['infinity', 'scalar'],
    ['complex', 'scalar'],
    ['bytes', 'scalar'],
    ['list', 'sequence'],
    ['empty_tuple', 'sequence'],
    ['single_tuple', 'sequence'],
    ['dict', 'map'],
    ['empty_dict', 'map'],
    ['set', 'set'],
    ['empty_set', 'set'],
    ['frozenset', 'set'],
    ['ordered_dict', 'map'],
    ['counter', 'map'],
    ['default_dict', 'map'],
    ['dataclass', 'object'],
    ['namedtuple', 'object'],
    ['datetime', 'object'],
    ['decimal', 'object'],
    ['instance', 'opaque'],
    ['class', 'opaque'],
    ['enum_member', 'opaque'],
  ] as const)('%s is a %s node', (name, kind) => {
    expect(parseCase(name).root.kind).toBe(kind);
  });
});

describe('type names survive', () => {
  it.each([
    ['list', 'list'],
    ['single_tuple', 'tuple'],
    ['dict', 'dict'],
    ['set', 'set'],
    ['frozenset', 'frozenset'],
    ['ordered_dict', 'OrderedDict'],
    ['counter', 'Counter'],
    ['default_dict', 'defaultdict'],
    ['dataclass', 'User'],
    ['namedtuple', 'Point'],
    ['datetime', 'datetime.datetime'],
    ['decimal', 'Decimal'],
    ['uuid', 'UUID'],
  ] as const)('%s reports typeName %s', (name, typeName) => {
    expect(parseCase(name).root.typeName).toBe(typeName);
  });
});
