import { describe, expect, it } from 'vitest';
import { SourceAdapterRegistry } from '@objectlens/core';
import { jsonAdapter } from '../../adapter-json/src/adapter.js';
import { pythonAdapter } from './adapter.js';
import { sniffPython } from './sniff.js';

const sniff = (text: string) => sniffPython({ text });

describe('strong signals', () => {
  it('trusts a .py filename as decisively as JSON trusts .json', () => {
    expect(sniffPython({ text: 'anything', filename: 'dump.py' })).toBe(0.95);
  });

  it('returns 0 for empty input', () => {
    expect(sniff('')).toBe(0);
    expect(sniff('  \n ')).toBe(0);
  });

  it('returns 0 for prose that cannot start a Python value', () => {
    expect(sniff('hello world')).toBe(0);
    expect(sniff('Traceback (most recent call last):')).toBe(0);
  });
});

describe('content heuristics', () => {
  it('scores a single-quoted dict highly', () => {
    expect(sniff("{'name': 'ada'}")).toBeGreaterThan(0.6);
  });

  it('scores Python literals highly', () => {
    expect(sniff("{'a': None, 'b': True}")).toBeGreaterThan(0.8);
  });

  it('scores instance reprs highly', () => {
    expect(sniff('<__main__.Plain object at 0x1052c9160>')).toBeGreaterThan(0.7);
  });

  it('recognises constructor reprs', () => {
    expect(sniff("User(id=1, name='ada')")).toBeGreaterThan(0.6);
  });

  it('recognises tuples, which JSON has no syntax for', () => {
    expect(sniff('(1, 2)')).toBeGreaterThan(0);
    expect(sniff('()')).toBeGreaterThan(0);
  });

  it('recognises bytes and set constructors', () => {
    expect(sniff("b'abc'")).toBeGreaterThan(0.5);
    expect(sniff('frozenset({1})')).toBeGreaterThan(0.5);
  });
});

/**
 * The arbitration that actually matters. Neither adapter knows the other exists; the registry
 * simply takes the higher score. These assertions pin the outcomes a user would notice.
 */
describe('arbitration against JSON', () => {
  const registry = new SourceAdapterRegistry();
  registry.register(jsonAdapter);
  registry.register(pythonAdapter);

  const winner = (text: string) => registry.detectBest({ text })?.id;

  it.each([
    ["{'name': 'ada'}", 'python-repr', 'single-quoted keys are Python'],
    ["{'a': None}", 'python-repr', 'None is Python'],
    ['{"ok": True}', 'python-repr', 'True is Python even with double quotes'],
    ["User(id=1, name='ada')", 'python-repr', 'constructor repr'],
    ['<Foo object at 0x1>', 'python-repr', 'instance repr'],
    ['(1, 2)', 'python-repr', 'JSON has no tuples'],
    ["{'at': datetime.datetime(2024, 1, 1)}", 'python-repr', 'dotted constructor'],
    ['{"name": "ada", "age": 36}', 'json', 'double-quoted keys, nothing Python-specific'],
    ['{"a": null}', 'json', 'null is JSON'],
    ['[{"id": 1}, {"id": 2}]', 'json', 'plain JSON array of objects'],
    [`{"msg": "it's fine"}`, 'json', 'an apostrophe in a string is prose'],
    ['{"code": "print(x)"}', 'json', 'a call in a string is text'],
    ['{"status": "None", "ok": "True"}', 'json', 'a Python word in a string is text'],
    [`["it's", "print(x)", "None"]`, 'json', 'no keys, and every marker is inside a string'],
    [`{"level":"info","msg":"GET /users(1): can't connect","ts":1}`, 'json', 'a log line'],
    ['{"b": 1, "a": 2}', 'json', 'a key named b is not a bytes literal'],
    ['"hello"', 'json', 'a bare double-quoted string'],
    ['42', 'json', 'a bare number'],
    ['-1.5e3', 'json', 'a bare number with an exponent'],
    ["'hello'", 'python-repr', 'a bare single-quoted string'],
    ['1_000', 'python-repr', 'not a number JSON can write'],
    [`{"name": "it's", "at": datetime(2024)}`, 'python-repr', 'a constructor outside any string'],
    [`{"name": "it's", "a": None}`, 'python-repr', 'None outside any string'],
    [`['say "hi"', None]`, 'python-repr', 'a double quote inside a single-quoted string'],
  ])('%s -> %s (%s)', (text, expected) => {
    expect(winner(text)).toBe(expected);
  });

  it('defers to JSON for input that is valid in both and distinctive of neither', () => {
    // `[1, 2, 3]` is equally good Python and JSON. JSON is the safer default for a paste with no
    // Python-specific syntax, so ambiguity resolves that way deliberately rather than by accident.
    expect(winner('[1, 2, 3]')).toBe('json');
  });

  it('lets a .py filename override content that looks like JSON', () => {
    expect(registry.detectBest({ text: '{"a": 1}', filename: 'dump.py' })?.id).toBe('python-repr');
  });
});

describe('cost', () => {
  it('inspects only the head, so a huge paste stays cheap', () => {
    const huge = `{'a': 1, ${"'x': 1, ".repeat(500_000)}'b': 2}`;

    const started = performance.now();
    sniff(huge);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
