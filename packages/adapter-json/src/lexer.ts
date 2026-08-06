/**
 * JSON tokenizer.
 *
 * Hand-written rather than delegating to `JSON.parse` because the adapter contract needs three
 * things `JSON.parse` cannot give:
 *
 * - **Positions.** Diagnostics carry line/column, and V8's error text is not a stable API.
 * - **Exact number text.** `9007199254740993` parses to `…992`; the IR keeps `raw` authoritative.
 * - **Survivable errors.** `JSON.parse` fails all-or-nothing; a viewer must render the 3999 good
 *   lines around one bad token.
 *
 * The lexer never throws. Malformed input produces `error` tokens carrying a message, and the
 * parser decides how to recover.
 */

export type TokenType =
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'colon'
  | 'comma'
  | 'string'
  | 'number'
  | 'true'
  | 'false'
  | 'null'
  | 'eof'
  | 'error';

export interface Token {
  readonly type: TokenType;
  readonly start: number;
  readonly end: number;
  /** Exact source text of the token. */
  readonly raw: string;
  /** Decoded value for strings; absent otherwise. */
  readonly value?: string;
  /** Why this token is an `error`, or a warning about a tolerated oddity. */
  readonly message?: string;
}

const PUNCTUATION: Readonly<Record<string, TokenType>> = {
  '{': 'lbrace',
  '}': 'rbrace',
  '[': 'lbracket',
  ']': 'rbracket',
  ':': 'colon',
  ',': 'comma',
};

const LITERALS = ['true', 'false', 'null'] as const;

export function tokenize(text: string): readonly Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < text.length) {
    pos = skipTrivia(text, pos, tokens);
    if (pos >= text.length) break;

    const char = text[pos] as string;

    const punctuation = PUNCTUATION[char];
    if (punctuation !== undefined) {
      tokens.push({ type: punctuation, start: pos, end: pos + 1, raw: char });
      pos += 1;
      continue;
    }

    if (char === '"') {
      const token = readString(text, pos);
      tokens.push(token);
      pos = token.end;
      continue;
    }

    if (char === '-' || (char >= '0' && char <= '9')) {
      const token = readNumber(text, pos);
      tokens.push(token);
      pos = token.end;
      continue;
    }

    const literal = LITERALS.find((word) => text.startsWith(word, pos));
    if (literal !== undefined) {
      tokens.push({ type: literal, start: pos, end: pos + literal.length, raw: literal });
      pos += literal.length;
      continue;
    }

    // Unrecognised. Consume a run of non-structural characters so one stray word yields one
    // diagnostic rather than one per character.
    const end = consumeGarbage(text, pos);
    tokens.push({
      type: 'error',
      start: pos,
      end,
      raw: text.slice(pos, end),
      message: `Unexpected ${JSON.stringify(text.slice(pos, end))}`,
    });
    pos = end;
  }

  tokens.push({ type: 'eof', start: text.length, end: text.length, raw: '' });
  return tokens;
}

/**
 * Skips whitespace and comments.
 *
 * Comments are not valid JSON, but config files carry them constantly and refusing to render a
 * `tsconfig.json` would be pedantry. They are skipped, and the parser reports one warning.
 */
function skipTrivia(text: string, start: number, tokens: Token[]): number {
  let pos = start;

  for (;;) {
    while (pos < text.length && isWhitespace(text[pos] as string)) pos += 1;

    if (text[pos] === '/' && text[pos + 1] === '/') {
      const end = indexOrEnd(text, '\n', pos);
      tokens.push({ type: 'error', start: pos, end, raw: text.slice(pos, end), message: COMMENT });
      pos = end;
      continue;
    }

    if (text[pos] === '/' && text[pos + 1] === '*') {
      const closed = text.indexOf('*/', pos + 2);
      const end = closed === -1 ? text.length : closed + 2;
      tokens.push({ type: 'error', start: pos, end, raw: text.slice(pos, end), message: COMMENT });
      pos = end;
      continue;
    }

    return pos;
  }
}

/** Marker the parser recognises so comments become one warning rather than a parse failure. */
export const COMMENT = 'Comments are not valid JSON, but were ignored.';

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function indexOrEnd(text: string, needle: string, from: number): number {
  const found = text.indexOf(needle, from);
  return found === -1 ? text.length : found;
}

function consumeGarbage(text: string, start: number): number {
  let pos = start;
  while (pos < text.length) {
    const char = text[pos] as string;
    if (isWhitespace(char) || PUNCTUATION[char] !== undefined || char === '"') break;
    pos += 1;
  }
  // Always consume at least one character, or the caller loops forever on a lone `"` edge case.
  return pos === start ? start + 1 : pos;
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

function readString(text: string, start: number): Token {
  let pos = start + 1;
  let value = '';
  let message: string | undefined;

  while (pos < text.length) {
    const char = text[pos] as string;

    if (char === '"') {
      return {
        type: 'string',
        start,
        end: pos + 1,
        raw: text.slice(start, pos + 1),
        value,
        ...(message === undefined ? {} : { message }),
      };
    }

    if (char === '\n') break; // Unterminated: JSON strings cannot span raw newlines.

    if (char !== '\\') {
      value += char;
      pos += 1;
      continue;
    }

    const escape = text[pos + 1];
    if (escape === undefined) break;

    const simple = SIMPLE_ESCAPES[escape];
    if (simple !== undefined) {
      value += simple;
      pos += 2;
      continue;
    }

    if (escape === 'u') {
      const hex = text.slice(pos + 2, pos + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        value += String.fromCharCode(Number.parseInt(hex, 16));
        pos += 6;
        continue;
      }
      message ??= `Invalid \\u escape at position ${pos}`;
      value += text.slice(pos, pos + 2);
      pos += 2;
      continue;
    }

    message ??= `Unknown escape "\\${escape}"`;
    value += escape;
    pos += 2;
  }

  return {
    type: 'error',
    start,
    end: pos,
    raw: text.slice(start, pos),
    value,
    message: 'Unterminated string',
  };
}

function readNumber(text: string, start: number): Token {
  let pos = start;

  if (text[pos] === '-') pos += 1;
  while (pos < text.length && isDigit(text[pos] as string)) pos += 1;

  if (text[pos] === '.') {
    pos += 1;
    while (pos < text.length && isDigit(text[pos] as string)) pos += 1;
  }

  if (text[pos] === 'e' || text[pos] === 'E') {
    pos += 1;
    if (text[pos] === '+' || text[pos] === '-') pos += 1;
    while (pos < text.length && isDigit(text[pos] as string)) pos += 1;
  }

  const raw = text.slice(start, pos);

  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) {
    return { type: 'error', start, end: pos, raw, message: `Malformed number "${raw}"` };
  }

  return { type: 'number', start, end: pos, raw };
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}
