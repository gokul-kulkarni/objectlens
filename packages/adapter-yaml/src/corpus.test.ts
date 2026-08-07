/**
 * Corpus test: the shapes people actually paste.
 *
 * `convert.test.ts` covers the grammar case by case, which is where the subtle mistakes live. The
 * failure this file catches is different and more embarrassing: a parser that handles every
 * corner of the spec and then chokes on a GitHub Actions workflow, because nobody writes YAML the
 * way a test suite does.
 *
 * See `docs/fixtures/yaml-corpus.yaml`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  childrenOf,
  hasErrors,
  pathTo,
  resolveRef,
  type Node,
  type ObjectGraph,
  type ScalarNode,
} from '@objectlens/core';
import { YAML_SOURCE_ID, parseYaml } from './convert.js';

const corpusPath = fileURLToPath(new URL('../../../docs/fixtures/yaml-corpus.yaml', import.meta.url));
const text = readFileSync(corpusPath, 'utf8');

const outcome = parseYaml(text);
const graph: ObjectGraph = buildGraph(outcome.root, YAML_SOURCE_ID, {
  diagnostics: outcome.diagnostics,
});

const DOCUMENTS = { workflow: 0, compose: 1, manifest: 2, corners: 3 } as const;

function at(id: string): Node {
  const node = graph.nodesById.get(id);
  if (node === undefined) throw new Error(`no node ${id}`);
  return node;
}

function doc(name: keyof typeof DOCUMENTS): Node {
  return at(`$[${DOCUMENTS[name]}]`);
}

function child(node: Node, label: string | number): Node {
  const children = childrenOf(node);
  const found =
    typeof label === 'number' ? children[label] : children.find((c) => c.label === label);
  if (found === undefined) throw new Error(`no child ${String(label)} of ${node.id}`);
  return found.node;
}

describe('the corpus as a whole', () => {
  it('parses with no errors', () => {
    // A warning is a legitimate outcome — a tolerated oddity — but an error means the adapter is
    // wrong about something a real tool emits every day.
    expect(hasErrors(outcome.diagnostics)).toBe(false);
  });

  it('is a stream of documents, not one accidental list', () => {
    expect(outcome.root.typeName).toBe('documents');
    expect(childrenOf(outcome.root)).toHaveLength(4);
  });

  it('was not truncated', () => {
    expect(outcome.truncated).toBe(false);
  });

  it('gives every node a unique id', () => {
    // `buildGraph` warns and drops on a collision, so a duplicate would silently lose a node.
    expect(graph.diagnostics.every((d) => !d.message.includes('Duplicate node id'))).toBe(true);
  });
});

describe('a CI workflow', () => {
  const workflow = () => doc('workflow');

  it('reads deeply nested job configuration', () => {
    const steps = child(child(child(workflow(), 'jobs'), 'test'), 'steps');
    expect(childrenOf(steps)).toHaveLength(3);
  });

  it('keeps a block scalar as one multi-line string', () => {
    const steps = child(child(child(workflow(), 'jobs'), 'test'), 'steps');
    const run = child(child(steps, 1), 'run') as ScalarNode;

    expect(String(run.value)).toContain('\n');
    expect(run.scalarType).toBe('string');
  });

  it('keeps a quoted version number a string, not a number', () => {
    // `NODE_VERSION: "20"` is quoted for exactly this reason, and losing the quotes changes the
    // meaning of the file.
    const steps = child(child(child(workflow(), 'jobs'), 'test'), 'steps');
    const env = child(child(steps, 2), 'env');

    expect((child(env, 'NODE_VERSION') as ScalarNode).scalarType).toBe('string');
    expect((child(env, 'CI') as ScalarNode).scalarType).toBe('bool');
  });

  it('builds a path that reads as a route into the file', () => {
    const runsOn = child(child(child(workflow(), 'jobs'), 'test'), 'runs-on');
    expect(runsOn.id).toBe('$[0]["jobs"]["test"]["runs-on"]');
    expect(pathTo(graph, runsOn.id).length).toBeGreaterThan(3);
  });
});

describe('a compose file, which is where anchors earn their keep', () => {
  const compose = () => doc('compose');

  it('reads a merge alias as a reference to the anchored block', () => {
    const web = child(child(compose(), 'services'), 'web');
    const merge = child(web, '<<');

    expect(merge.kind).toBe('ref');
    expect(resolveRef(graph, merge)?.id).toBe(child(compose(), 'x-defaults').id);
  });

  it('points both services at the one shared block', () => {
    // The whole reason this file uses an anchor. Two copies in the tree would hide that editing
    // `x-defaults` changes both services.
    const services = child(compose(), 'services');
    const targets = ['web', 'api'].map((name) => {
      const merge = child(child(services, name), '<<');
      return merge.kind === 'ref' ? merge.target : null;
    });

    expect(targets[0]).toBe(targets[1]);
    expect(targets[0]).not.toBeNull();
  });

  it('does not mistake those shared references for cycles', () => {
    const services = child(compose(), 'services');
    const merge = child(child(services, 'web'), '<<');

    expect(merge.kind === 'ref' && merge.cycle).toBe(false);
  });

  it('keeps a published port a string, since "80:80" is not a number', () => {
    const ports = child(child(child(compose(), 'services'), 'web'), 'ports');
    expect((child(ports, 0) as ScalarNode).value).toBe('80:80');
  });
});

describe('a Kubernetes manifest', () => {
  const manifest = () => doc('manifest');

  it('keeps a dotted label key intact', () => {
    const labels = child(child(manifest(), 'metadata'), 'labels');
    expect(childrenOf(labels).map((c) => c.label)).toEqual(['app.kubernetes.io/name']);
  });

  it('keeps a quantity like 512Mi as the string it is', () => {
    const limits = child(
      child(child(child(child(child(manifest(), 'spec'), 'template'), 'spec'), 'containers'), 0),
      'resources',
    );

    expect((child(child(limits, 'limits'), 'memory') as ScalarNode).scalarType).toBe('string');
  });

  it('distinguishes an explicit null from a missing key', () => {
    const container = child(
      child(child(child(child(manifest(), 'spec'), 'template'), 'spec'), 'containers'),
      0,
    );

    expect((child(container, 'livenessProbe') as ScalarNode).scalarType).toBe('null');
  });
});

describe('the awkward corners', () => {
  const corners = () => doc('corners');
  const scalars = () => child(corners(), 'scalars');
  const structures = () => child(corners(), 'structures');

  it('reads a version string as a string, not a float', () => {
    // `1.2.3` has two dots, so it is a string — but `1.2` would not be, and a parser that guesses
    // from the first dot gets this wrong.
    expect((child(scalars(), 'version') as ScalarNode).scalarType).toBe('string');
  });

  it('keeps hex and an oversized integer readable', () => {
    expect((child(scalars(), 'hex') as ScalarNode).raw).toBe('0x1f');
    expect((child(scalars(), 'big') as ScalarNode).raw).toBe('12345678901234567890');
  });

  it('carries infinity in raw, since JSON has no way to write it', () => {
    const infinite = child(scalars(), 'infinite') as ScalarNode;

    expect(infinite.value).toBeNull();
    expect(infinite.raw).toBe('.inf');
  });

  it('reads an explicitly quoted "yes" as a string', () => {
    expect((child(scalars(), 'yes_string') as ScalarNode).value).toBe('yes');
  });

  it('reads !!set as a set and !Point as a typed object', () => {
    expect(child(structures(), 'set').kind).toBe('set');

    const point = child(structures(), 'tagged');
    expect(point.kind).toBe('object');
    expect(point.typeName).toBe('!Point');
  });

  it('keeps a sequence-shaped key explorable', () => {
    const complex = child(structures(), 'complex_key');
    expect(childrenOf(complex).map((c) => c.label)).toEqual(['⟨key⟩', '⟨value⟩']);
  });

  it('reads !!binary as bytes', () => {
    expect((child(structures(), 'binary') as ScalarNode).scalarType).toBe('bytes');
  });

  it('reads a self-referential anchor as a real cycle', () => {
    // The one thing a tree cannot draw and a graph can. `next: *loop` points back at the mapping
    // that contains it.
    const next = child(child(corners(), 'cyclic'), 'next');

    expect(next.kind).toBe('ref');
    expect(next.kind === 'ref' && next.cycle).toBe(true);
    expect(resolveRef(graph, next)?.id).toBe(child(corners(), 'cyclic').id);
  });
});
