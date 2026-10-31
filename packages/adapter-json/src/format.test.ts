import { describe, expect, it } from 'vitest';
import { formatJson } from './format.js';

const formatted = (text: string) => {
  const result = formatJson(text);
  if ('error' in result) throw new Error(result.error);
  return result.text;
};

const refusal = (text: string) => {
  const result = formatJson(text);
  if (!('error' in result)) throw new Error(`expected a refusal, got ${result.text}`);
  return result.error;
};

describe('formatJson', () => {
  it('indents nested containers', () => {
    expect(formatted('{"a":[1,{"b":true}],"c":null}')).toBe(
      ['{', '  "a": [', '    1,', '    {', '      "b": true', '    }', '  ],', '  "c": null', '}'].join('\n'),
    );
  });

  it('collapses existing whitespace rather than adding to it', () => {
    expect(formatted('{\n\n\t"a"  :   1\n\n}')).toBe('{\n  "a": 1\n}');
  });

  it('leaves empty containers on one line', () => {
    expect(formatted('{"a":{},"b":[ ]}')).toBe('{\n  "a": {},\n  "b": []\n}');
  });

  it('is stable when run twice', () => {
    const once = formatted('[{"a":1},[2,[3]]]');
    expect(formatted(once)).toBe(once);
  });

  it('keeps numbers exactly as written, unlike JSON.parse', () => {
    const output = formatted('[9007199254740993,1.50,1e2,-0]');
    expect(output).toBe('[\n  9007199254740993,\n  1.50,\n  1e2,\n  -0\n]');
  });

  it('keeps string escapes exactly as written', () => {
    expect(formatted('["a\\/b\\u00e9"]')).toBe('[\n  "a\\/b\\u00e9"\n]');
  });

  it('keeps duplicate keys and their order', () => {
    expect(formatted('{"b":1,"a":2,"b":3}')).toBe('{\n  "b": 1,\n  "a": 2,\n  "b": 3\n}');
  });

  it('formats a bare scalar', () => {
    expect(formatted('  42  ')).toBe('42');
  });

  it('removes trailing commas, leaving valid JSON', () => {
    expect(formatted('{"a":[1,2,],}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
  });

  it('removes a byte order mark', () => {
    expect(formatted('﻿[]')).toBe('[]');
  });

  it('keeps line-delimited values one per block', () => {
    expect(formatted('{"a":1}\n{"a":2}')).toBe('{\n  "a": 1\n}\n{\n  "a": 2\n}');
  });

  it('refuses malformed input and says where, rather than rewriting a guess', () => {
    expect(refusal('{\n  "a": @\n}')).toContain('Line 2');
  });

  it('refuses a missing comma, which the parser only recovers from', () => {
    expect(refusal('{"a": 1 "b": 2}')).toContain('Expected ","');
  });

  it('refuses comments rather than silently deleting them', () => {
    expect(refusal('{\n  // why\n  "a": 1\n}')).toContain('omment');
  });

  it('refuses input too large to format on the main thread', () => {
    expect(refusal(`[${'1,'.repeat(3 * 1024 * 1024)}1]`)).toContain('too large');
  });
});
