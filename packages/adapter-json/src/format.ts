/**
 * Pretty-printing for the editor.
 *
 * Re-emits the lexer's tokens rather than round-tripping through `JSON.parse`, which would round
 * `9007199254740993`, rewrite `1.50` as `1.5`, and collapse duplicate keys. Formatting changes
 * whitespace and nothing else, with one exception: trailing commas go, because the output is JSON.
 *
 * Unlike the parser this is not tolerant. Recovery is a guess that suits a viewer, but writing a
 * guess back over someone's text would quietly change it, so anything uncertain is refused.
 */

import type { FormatResult } from '@objectlens/core';
import { COMMENT, tokenize, type Token, type TokenType } from './lexer.js';
import { parseJson } from './parser.js';

const INDENT = '  ';

/**
 * Formatting runs on the main thread, in response to a click, so it needs a lower cap than parsing.
 * Past this the textarea is already struggling, and a frozen tab would be a worse answer than no.
 */
const MAX_FORMAT_CHARS = 5 * 1024 * 1024;

const OPENERS: ReadonlySet<TokenType> = new Set(['lbrace', 'lbracket']);
const CLOSERS: ReadonlySet<TokenType> = new Set(['rbrace', 'rbracket']);

export function formatJson(text: string): FormatResult {
  if (text.length > MAX_FORMAT_CHARS) {
    return { error: 'This input is too large to format in the browser tab.' };
  }

  const tokens = tokenize(text);
  if (tokens.some((token) => token.message === COMMENT)) {
    return { error: 'Formatting would delete the comments in this input, so it was left as is.' };
  }

  const problem = parseJson(text).diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (problem !== undefined) {
    const where = problem.line === undefined ? '' : `Line ${problem.line}: `;
    return { error: `Fix this before formatting. ${where}${problem.message}` };
  }

  return { text: render(withoutTrailingCommas(tokens)) };
}

function withoutTrailingCommas(tokens: readonly Token[]): readonly Token[] {
  return tokens.filter((token, index) => {
    const next = tokens[index + 1];
    return !(token.type === 'comma' && next !== undefined && CLOSERS.has(next.type));
  });
}

function render(tokens: readonly Token[]): string {
  const parts: string[] = [];
  let depth = 0;

  const newline = () => parts.push('\n', INDENT.repeat(depth));

  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    if (token.type === 'eof' || next === undefined) return;

    if (OPENERS.has(token.type)) {
      parts.push(token.raw);
      if (!CLOSERS.has(next.type)) {
        depth += 1;
        newline();
      }
      return;
    }

    if (token.type === 'comma') {
      parts.push(',');
      newline();
      return;
    }

    if (token.type === 'colon') {
      parts.push(': ');
      return;
    }

    if (CLOSERS.has(token.type) && previous !== undefined && !OPENERS.has(previous.type)) {
      depth -= 1;
      newline();
    }

    parts.push(token.raw);

    // Only reachable in line-delimited input: one value ended and another follows.
    if (depth === 0 && next.type !== 'eof') newline();
  });

  return parts.join('');
}
