import { describe, expect, it } from 'vitest';
import { sniffJson } from './sniff.js';

const sniff = (text: string) => sniffJson({ text });

describe('strong signals', () => {
  it('trusts a .json filename', () => {
    expect(sniffJson({ text: 'anything', filename: 'data.json' })).toBe(0.95);
    expect(sniffJson({ text: 'anything', filename: 'DATA.JSON' })).toBe(0.95);
  });

  it('trusts an application/json mime type', () => {
    expect(sniffJson({ text: 'anything', mimeType: 'application/json' })).toBe(0.95);
  });
});

describe('content heuristics', () => {
  it('scores an object with double-quoted keys highly', () => {
    expect(sniff('{"name": "ada", "age": 36}')).toBeGreaterThan(0.8);
  });

  it('scores a plain array moderately', () => {
    expect(sniff('[1, 2, 3]')).toBeGreaterThan(0.5);
  });

  it('scores bare scalars low — almost anything starts with a digit', () => {
    expect(sniff('42')).toBeLessThan(0.5);
    expect(sniff('42')).toBeGreaterThan(0);
  });

  it('returns 0 for empty or whitespace input', () => {
    expect(sniff('')).toBe(0);
    expect(sniff('   \n  ')).toBe(0);
  });

  it('returns 0 for text that cannot start a JSON value', () => {
    expect(sniff('hello world')).toBe(0);
    expect(sniff('<html>')).toBe(0);
  });
});

describe('telling JSON from Python repr', () => {
  // `{"a": 1}` is valid in both languages, so the two adapters have to separate on other
  // evidence. Neither knows about the other; they just score their own signals.

  it('scores a single-quoted dict lower than a double-quoted one', () => {
    expect(sniff("{'name': 'ada'}")).toBeLessThan(sniff('{"name": "ada"}'));
  });

  it('is penalised by Python literals', () => {
    expect(sniff('{"a": None}')).toBeLessThan(sniff('{"a": null}'));
    expect(sniff('{"ok": True}')).toBeLessThan(sniff('{"ok": true}'));
  });

  it('is penalised by constructor-style reprs', () => {
    expect(sniff('{"at": datetime(2024, 1, 1)}')).toBeLessThan(sniff('{"at": "2024-01-01"}'));
  });

  it('is penalised by opaque object reprs', () => {
    expect(sniff('{"u": <User object at 0x7f9a>}')).toBeLessThan(sniff('{"u": "ada"}'));
  });

  it('drops a distinctly Python dict to near zero', () => {
    expect(sniff("{'name': 'ada', 'active': True, 'tags': None}")).toBeLessThan(0.2);
  });
});

describe('cost', () => {
  it('inspects only the head, so a huge paste stays cheap', () => {
    // Sniff runs for every registered adapter on every paste. Parsing to decide who should parse
    // would cost more than the parse.
    const huge = `{"a": 1, ${'"x": 1, '.repeat(500_000)}"b": 2}`;

    const started = performance.now();
    sniff(huge);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
