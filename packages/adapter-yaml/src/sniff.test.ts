import { describe, expect, it } from 'vitest';
import { SourceAdapterRegistry } from '@objectlens/core';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
import { yamlAdapter } from './adapter.js';
import { sniffYaml } from './sniff.js';

const sniff = (text: string, filename?: string) =>
  sniffYaml(filename === undefined ? { text } : { text, filename });

describe('what YAML claims', () => {
  it.each([
    ['a block mapping', 'name: ada\nage: 36\n'],
    ['a block sequence', '- one\n- two\n'],
    ['a document marker', '---\nanything\n'],
    ['a directive', '%YAML 1.2\n---\na: 1\n'],
    ['anchors', 'base: &b\n  x: 1\n'],
    ['a nested config', 'server:\n  host: localhost\n  ports:\n    - 80\n'],
  ])('claims %s', (_label, text) => {
    expect(sniff(text)).toBeGreaterThan(0.4);
  });

  it('trusts the file extension outright', () => {
    expect(sniff('anything at all', 'config.yaml')).toBe(0.95);
    expect(sniff('anything at all', 'config.yml')).toBe(0.95);
  });
});

describe('what YAML concedes', () => {
  it('concedes JSON, even though JSON is valid YAML', () => {
    // This is the trap: YAML 1.2 is a JSON superset, so a naive sniff wins on every JSON paste
    // and renders it correctly but with the wrong adapter's labels.
    expect(sniff('{"a": 1}')).toBe(0);
    expect(sniff('[1, 2, 3]')).toBe(0);
  });

  it('concedes Python repr output, which is also bracketed', () => {
    expect(sniff("{'a': 1, 'b': [2]}")).toBe(0);
  });

  it('claims nothing from empty or shapeless input', () => {
    expect(sniff('')).toBe(0);
    expect(sniff('   \n  ')).toBe(0);
    expect(sniff('just a sentence with no structure')).toBe(0);
  });

  it('is not fooled by a colon inside prose', () => {
    expect(sniff('Traceback (most recent call last):')).toBeLessThan(0.5);
  });

  it('looks only at the head, so a huge paste costs nothing to reject', () => {
    const buried = `${'x'.repeat(5000)}\nkey: value\n`;
    expect(sniff(buried)).toBe(0);
  });
});

describe('arbitration between the registered adapters', () => {
  const registry = new SourceAdapterRegistry();
  registry.register(jsonAdapter);
  registry.register(pythonAdapter);
  registry.register(yamlAdapter);

  const winner = (text: string, filename?: string) =>
    registry.detect(filename === undefined ? { text } : { text, filename })[0]?.adapter.id;

  it.each([
    ['a block mapping', 'name: ada\nports:\n  - 80\n', 'yaml'],
    ['a docker-compose fragment', 'services:\n  web:\n    image: nginx\n', 'yaml'],
    ['JSON', '{"a": [1, 2]}', 'json'],
    ['a Python repr', "{'a': (1, 2), 'b': None}", 'python-repr'],
    ['a .yaml file', 'whatever', 'yaml'],
  ])('routes %s to %s', (_label, text, expected) => {
    const filename = expected === 'yaml' && text === 'whatever' ? 'x.yaml' : undefined;
    expect(winner(text, filename)).toBe(expected);
  });

  it('routes a .json file to JSON even though YAML could read it', () => {
    expect(winner('{"a": 1}', 'data.json')).toBe('json');
  });

  it('leaves every adapter selectable by hand regardless of its score', () => {
    // Detection is a heuristic over ambiguous text, so it has to be correctable. A YAML file
    // someone wants read as something else is still their call.
    expect(registry.list().map((adapter) => adapter.id)).toContain('yaml');
  });
});
