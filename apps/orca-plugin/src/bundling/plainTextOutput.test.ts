import { describe, expect, it } from 'vitest';
import { escapeControlCharacters } from './plainTextOutput.js';

describe('escapeControlCharacters', () => {
  it('escapes control characters inside literals without changing their value', () => {
    const source = 'const a="\u0002",b="\u0018",c="\u001f",d=/[\u0000-\u0001]/;';
    const escaped = escapeControlCharacters(source);

    expect(escaped).toBe(String.raw`const a="\x02",b="\x18",c="\x1f",d=/[\x00-\x01]/;`);
    // Evaluating both forms gives the same characters back.
    const run = (code: string) => new Function(`${code} return [a, b, c, d.source];`)() as string[];
    expect(run(escaped).slice(0, 3)).toEqual(run(source).slice(0, 3));
    expect(new RegExp(run(escaped)[3] ?? '').test('\u0001')).toBe(true);
  });

  it('leaves whitespace and ordinary text alone', () => {
    const source = 'a\tb\nc\r\nd\u000be\u000cf "plain" `text`';
    expect(escapeControlCharacters(source)).toBe(source);
  });
});
