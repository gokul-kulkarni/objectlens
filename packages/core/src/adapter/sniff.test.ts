import { describe, expect, it } from 'vitest';
import { maskDoubleQuotedStrings } from './sniff.js';

describe('maskDoubleQuotedStrings', () => {
  it('empties strings and keeps the quotes', () => {
    expect(maskDoubleQuotedStrings('{"a": "None"}')).toBe('{"": ""}');
  });

  it('leaves everything outside strings alone', () => {
    expect(maskDoubleQuotedStrings(`{'a': None, "b": Foo(1)}`)).toBe(`{'a': None, "": Foo(1)}`);
  });

  it('does not end a string at an escaped quote', () => {
    expect(maskDoubleQuotedStrings('["a\\"b None", None]')).toBe('["", None]');
  });

  it('masks a string cut off by the end of the head', () => {
    expect(maskDoubleQuotedStrings('["a", "None')).toBe('["", ""');
  });

  it('stops at a newline, so a stray quote cannot hide the rest of the input', () => {
    expect(maskDoubleQuotedStrings(`'say "hi\nNone`)).toBe(`'say ""\nNone`);
  });
});
