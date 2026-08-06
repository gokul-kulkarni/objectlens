/**
 * Python `repr()` tokenizer.
 *
 * Covers the subset of Python's literal grammar that `repr()` and `pprint` actually emit, plus the
 * two non-literal forms they emit constantly and that a strict parser would choke on:
 * constructor-style reprs (`Decimal('1.50')`) and angle reprs (`<User object at 0x7f…>`).
 *
 * Never throws. Malformed input yields `error` tokens carrying a message; the parser recovers.
 */

export type TokenType =
  | 'lbracket'
  | 'rbracket'
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'colon'
  | 'comma'
  | 'equals'
  | 'dot'
  | 'plus'
  | 'minus'
  | 'string'
  | 'number'
  | 'name'
  | 'ellipsis'
  | 'angle'
  | 'eof'
  | 'error';

export type NumberKind = 'int' | 'float' | 'imaginary';

export interface Token {
  readonly type: TokenType;
  readonly start: number;
  readonly end: number;
  readonly raw: string;
  /** Decoded text for strings. */
  readonly value?: string;
  /** Lower-cased string prefix letters: `r`, `b`, `f`, `rb`, … */
  readonly prefix?: string;
  readonly numberKind?: NumberKind;
  readonly message?: string;
}

const PUNCTUATION: Readonly<Record<string, TokenType>> = {
  '[': 'lbracket',
  ']': 'rbracket',
  '(': 'lparen',
  ')': 'rparen',
  '{': 'lbrace',
  '}': 'rbrace',
  ':': 'colon',
  ',': 'comma',
  '=': 'equals',
  '+': 'plus',
  '-': 'minus',
};

/** Letters that may precede a quote: r(aw) b(ytes) u(nicode) f(-string), in any case or order. */
const PREFIX_LETTERS = /^[rbufRBUF]{1,3}$/;

export function tokenize(text: string): readonly Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < text.length) {
    while (pos < text.length && isWhitespace(text[pos] as string)) pos += 1;
    if (pos >= text.length) break;

    const char = text[pos] as string;

    if (text.startsWith('...', pos)) {
      // `repr(Ellipsis)` is the word "Ellipsis", so a literal `...` in repr output can only be
      // Python's recursion marker. That makes it an unambiguous cycle signal.
      tokens.push({ type: 'ellipsis', start: pos, end: pos + 3, raw: '...' });
      pos += 3;
      continue;
    }

    if (char === '<') {
      const token = readAngle(text, pos);
      tokens.push(token);
      pos = token.end;
      continue;
    }

    if (char === '.' && !isDigit(text[pos + 1] ?? '')) {
      tokens.push({ type: 'dot', start: pos, end: pos + 1, raw: '.' });
      pos += 1;
      continue;
    }

    const punctuation = PUNCTUATION[char];
    if (punctuation !== undefined) {
      tokens.push({ type: punctuation, start: pos, end: pos + 1, raw: char });
      pos += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const token = readString(text, pos, '');
      tokens.push(token);
      pos = token.end;
      continue;
    }

    if (isDigit(char) || (char === '.' && isDigit(text[pos + 1] ?? ''))) {
      const token = readNumber(text, pos);
      tokens.push(token);
      pos = token.end;
      continue;
    }

    if (isNameStart(char)) {
      const token = readNameOrPrefixedString(text, pos);
      tokens.push(token);
      pos = token.end;
      continue;
    }

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

// ---- angle reprs ----------------------------------------------------------

/**
 * Reads `<…>` as one token: `<User object at 0x7f>`, `<class 'int'>`, `<Color.RED: 1>`.
 *
 * Tracks quotes so `<class 'a>b'>` does not terminate early, and nesting so a repr containing a
 * nested angle repr survives.
 */
function readAngle(text: string, start: number): Token {
  let pos = start + 1;
  let depth = 1;
  let quote: string | null = null;

  while (pos < text.length) {
    const char = text[pos] as string;

    if (quote !== null) {
      if (char === '\\') pos += 1;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '<') {
      depth += 1;
    } else if (char === '>') {
      depth -= 1;
      if (depth === 0) {
        return { type: 'angle', start, end: pos + 1, raw: text.slice(start, pos + 1) };
      }
    } else if (char === '\n') {
      break; // An angle repr never spans lines; treat this as unterminated.
    }

    pos += 1;
  }

  return {
    type: 'error',
    start,
    end: pos,
    raw: text.slice(start, pos),
    message: 'Unterminated "<…>" repr',
  };
}

// ---- names and strings ----------------------------------------------------

function readNameOrPrefixedString(text: string, start: number): Token {
  let pos = start;
  while (pos < text.length && isNameChar(text[pos] as string)) pos += 1;

  const word = text.slice(start, pos);
  const quote = text[pos];

  if ((quote === '"' || quote === "'") && PREFIX_LETTERS.test(word)) {
    return readString(text, pos, word.toLowerCase(), start);
  }

  return { type: 'name', start, end: pos, raw: word };
}

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '\\': '\\',
  "'": "'",
  '"': '"',
  a: '\x07',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

function readString(text: string, quoteStart: number, prefix: string, tokenStart = quoteStart): Token {
  const quote = text[quoteStart] as string;
  const triple = text.startsWith(quote.repeat(3), quoteStart);
  const delimiter = triple ? quote.repeat(3) : quote;
  const raw = prefix.includes('r');

  let pos = quoteStart + delimiter.length;
  let value = '';
  let message: string | undefined;

  while (pos < text.length) {
    if (text.startsWith(delimiter, pos)) {
      return {
        type: 'string',
        start: tokenStart,
        end: pos + delimiter.length,
        raw: text.slice(tokenStart, pos + delimiter.length),
        value,
        prefix,
        ...(message === undefined ? {} : { message }),
      };
    }

    const char = text[pos] as string;

    if (char === '\n' && !triple) break; // Single-quoted strings cannot span raw newlines.

    if (char !== '\\') {
      value += char;
      pos += 1;
      continue;
    }

    const escape = text[pos + 1];
    if (escape === undefined) break;

    if (raw) {
      // Raw strings keep the backslash, but it still escapes the delimiter for quoting purposes.
      value += char + escape;
      pos += 2;
      continue;
    }

    const simple = ESCAPES[escape];
    if (simple !== undefined) {
      value += simple;
      pos += 2;
      continue;
    }

    if (escape === 'x' || escape === 'u' || escape === 'U') {
      const width = escape === 'x' ? 2 : escape === 'u' ? 4 : 8;
      const hex = text.slice(pos + 2, pos + 2 + width);
      if (hex.length === width && /^[0-9a-fA-F]+$/.test(hex)) {
        value += String.fromCodePoint(Number.parseInt(hex, 16));
        pos += 2 + width;
        continue;
      }
      message ??= `Invalid \\${escape} escape`;
      value += text.slice(pos, pos + 2);
      pos += 2;
      continue;
    }

    // Python leaves unknown escapes intact rather than erroring, so mirror that.
    value += char + escape;
    pos += 2;
  }

  return {
    type: 'error',
    start: tokenStart,
    end: pos,
    raw: text.slice(tokenStart, pos),
    value,
    prefix,
    message: 'Unterminated string',
  };
}

// ---- numbers --------------------------------------------------------------

function readNumber(text: string, start: number): Token {
  let pos = start;
  let kind: NumberKind = 'int';

  const radix = text.slice(pos, pos + 2).toLowerCase();
  if (radix === '0x' || radix === '0o' || radix === '0b') {
    pos += 2;
    while (pos < text.length && isRadixChar(text[pos] as string)) pos += 1;
    return { type: 'number', start, end: pos, raw: text.slice(start, pos), numberKind: 'int' };
  }

  while (pos < text.length && isDigitOrUnderscore(text[pos] as string)) pos += 1;

  if (text[pos] === '.') {
    kind = 'float';
    pos += 1;
    while (pos < text.length && isDigitOrUnderscore(text[pos] as string)) pos += 1;
  }

  if (text[pos] === 'e' || text[pos] === 'E') {
    const afterExponent = text[pos + 1] === '+' || text[pos + 1] === '-' ? pos + 2 : pos + 1;
    if (isDigit(text[afterExponent] ?? '')) {
      kind = 'float';
      pos = afterExponent;
      while (pos < text.length && isDigitOrUnderscore(text[pos] as string)) pos += 1;
    }
  }

  if (text[pos] === 'j' || text[pos] === 'J') {
    kind = 'imaginary';
    pos += 1;
  }

  return { type: 'number', start, end: pos, raw: text.slice(start, pos), numberKind: kind };
}

// ---- character classes ----------------------------------------------------

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isDigitOrUnderscore(char: string): boolean {
  return isDigit(char) || char === '_';
}

function isRadixChar(char: string): boolean {
  return /[0-9a-fA-F_]/.test(char);
}

function isNameStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isNameChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function consumeGarbage(text: string, start: number): number {
  let pos = start;
  while (pos < text.length) {
    const char = text[pos] as string;
    if (isWhitespace(char) || PUNCTUATION[char] !== undefined || char === '"' || char === "'") break;
    pos += 1;
  }
  return pos === start ? start + 1 : pos;
}
