/**
 * Helpers for `sniff` implementations.
 *
 * A sniff looks for syntax, and syntax never sits inside a string. Without this, an apostrophe or
 * the word `None` in a JSON value reads as Python, and one word of prose reroutes the document.
 */

/** A double-quoted string. It ends at a raw newline, or a stray `"` would hide all that follows. */
const DOUBLE_QUOTED_STRING = /"(?:[^"\\\n]|\\.)*"?/g;

/**
 * Empties every double-quoted string, keeping the quotes, so markers can be tested against what is
 * left. The quotes stay so that key shapes such as `"": 1` remain recognisable.
 */
export function maskDoubleQuotedStrings(text: string): string {
  return text.replace(DOUBLE_QUOTED_STRING, '""');
}
