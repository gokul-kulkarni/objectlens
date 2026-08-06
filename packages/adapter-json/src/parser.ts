/**
 * Tolerant recursive-descent JSON parser producing the ObjectLens IR.
 *
 * "Tolerant" is the whole design constraint: this never throws, and a syntax error costs the
 * reader the malformed span rather than the document. Bad input becomes an `opaque` node plus a
 * diagnostic, and the parser resynchronises at the next `,` or closing bracket.
 */

import {
  createIdAllocator,
  indexChild,
  keyChild,
  keyNodeChild,
  parseError,
  parseWarning,
  positionAt,
  MAX_PARSE_DEPTH,
  ROOT_ID,
  type Diagnostic,
  type IdAllocator,
  type MapEntry,
  type Node,
  type NodeId,
} from '@objectlens/core';
import { COMMENT, tokenize, type Token, type TokenType } from './lexer.js';

export const JSON_SOURCE_ID = 'json';

export interface JsonParseOutcome {
  readonly root: Node;
  readonly diagnostics: readonly Diagnostic[];
  readonly truncated: boolean;
}

export function parseJson(text: string): JsonParseOutcome {
  return new JsonParser(text).parse();
}

class JsonParser {
  readonly #text: string;
  readonly #tokens: readonly Token[];
  readonly #diagnostics: Diagnostic[] = [];
  readonly #allocator: IdAllocator = createIdAllocator();
  #pos = 0;
  #truncated = false;

  constructor(text: string) {
    this.#text = text;

    const all = tokenize(text);
    const comments = all.filter((token) => token.message === COMMENT);
    this.#tokens = all.filter((token) => token.message !== COMMENT);

    // One warning for the whole document — a commented config would otherwise produce dozens.
    const firstComment = comments[0];
    if (firstComment !== undefined) {
      this.#warn(COMMENT, firstComment);
    }
  }

  parse(): JsonParseOutcome {
    const root = this.#parseValue(this.#allocator.allocate(ROOT_ID), 0);

    const trailing = this.#peek();
    if (trailing.type !== 'eof') {
      this.#error(`Unexpected content after the top-level value`, trailing);
    }

    for (const id of this.#allocator.collisions) {
      this.#diagnostics.push(
        parseWarning(`Duplicate key produced a repeated path "${id}"; both are shown.`),
      );
    }

    return { root, diagnostics: this.#diagnostics, truncated: this.#truncated };
  }

  // ---- token stream -------------------------------------------------------

  #peek(): Token {
    return this.#tokens[this.#pos] ?? EOF_TOKEN;
  }

  #next(): Token {
    const token = this.#peek();
    if (token.type !== 'eof') this.#pos += 1;
    return token;
  }

  #accept(type: TokenType): Token | undefined {
    return this.#peek().type === type ? this.#next() : undefined;
  }

  // ---- values -------------------------------------------------------------

  #parseValue(id: NodeId, depth: number): Node {
    if (depth > MAX_PARSE_DEPTH) {
      this.#truncated = true;
      this.#error(`Nesting deeper than ${MAX_PARSE_DEPTH} levels was not parsed`, this.#peek());
      this.#skipValue();
      return this.#opaque(id, '…', 'too deep');
    }

    const token = this.#peek();

    switch (token.type) {
      case 'lbrace':
        return this.#parseObject(id, depth);
      case 'lbracket':
        return this.#parseArray(id, depth);
      case 'string':
        this.#next();
        // A string can parse successfully and still carry a complaint — a bad `\u` escape, say.
        // The lexer records it on the token; dropping it here would lose the only report of it.
        if (token.message !== undefined) this.#warn(token.message, token);
        return { id, kind: 'scalar', source: JSON_SOURCE_ID, scalarType: 'string', value: token.value ?? '' };
      case 'number':
        this.#next();
        return this.#numberNode(id, token.raw);
      case 'true':
      case 'false':
        this.#next();
        return { id, kind: 'scalar', source: JSON_SOURCE_ID, scalarType: 'bool', value: token.type === 'true' };
      case 'null':
        this.#next();
        return { id, kind: 'scalar', source: JSON_SOURCE_ID, scalarType: 'null', value: null };
      default:
        this.#next();
        this.#error(token.message ?? `Unexpected ${describe(token)}`, token);
        return this.#opaque(id, token.raw === '' ? '<empty>' : token.raw);
    }
  }

  #parseObject(id: NodeId, depth: number): Node {
    this.#next(); // consume `{`
    const entries: MapEntry[] = [];

    while (this.#peek().type !== 'rbrace' && this.#peek().type !== 'eof') {
      const entry = this.#parseMember(id, entries.length, depth);
      if (entry !== undefined) entries.push(entry);

      if (this.#accept('comma') === undefined) break;

      // A trailing comma is invalid JSON but ubiquitous in hand-edited files.
      if (this.#peek().type === 'rbrace') {
        this.#warn('Trailing comma', this.#peek());
        break;
      }
    }

    this.#expectClose('rbrace', '}');
    return { id, kind: 'map', source: JSON_SOURCE_ID, typeName: 'object', entries };
  }

  #parseMember(parentId: NodeId, index: number, depth: number): MapEntry | undefined {
    const keyToken = this.#peek();

    if (keyToken.type !== 'string') {
      this.#error(`Expected a quoted key but found ${describe(keyToken)}`, keyToken);
      this.#recoverInContainer();
      return undefined;
    }
    this.#next();

    const keyText = keyToken.value ?? '';
    const key: Node = {
      id: this.#allocator.allocate(keyNodeChild(parentId, index)),
      kind: 'scalar',
      source: JSON_SOURCE_ID,
      scalarType: 'string',
      value: keyText,
    };

    if (this.#accept('colon') === undefined) {
      // Report the missing colon but still try to read a value: `{"a" 1}` is far more likely to be
      // a typo than a deliberate structure, and guessing here recovers the rest of the object.
      this.#error(`Expected ":" after key ${JSON.stringify(keyText)}`, this.#peek());
    }

    const valueId = this.#allocator.allocate(keyChild(parentId, JSON.stringify(keyText)));
    return { key, value: this.#parseValue(valueId, depth + 1) };
  }

  #parseArray(id: NodeId, depth: number): Node {
    this.#next(); // consume `[`
    const items: Node[] = [];

    while (this.#peek().type !== 'rbracket' && this.#peek().type !== 'eof') {
      const itemId = this.#allocator.allocate(indexChild(id, items.length));
      items.push(this.#parseValue(itemId, depth + 1));

      if (this.#accept('comma') === undefined) break;

      if (this.#peek().type === 'rbracket') {
        this.#warn('Trailing comma', this.#peek());
        break;
      }
    }

    this.#expectClose('rbracket', ']');
    return { id, kind: 'sequence', source: JSON_SOURCE_ID, typeName: 'array', items };
  }

  #expectClose(type: TokenType, symbol: string): void {
    if (this.#accept(type) === undefined) {
      this.#error(`Expected "${symbol}"`, this.#peek());
    }
  }

  // ---- recovery -----------------------------------------------------------

  /** Panic-mode resync: skip to the next `,` or closing bracket at this level. */
  #recoverInContainer(): void {
    let depth = 0;

    for (;;) {
      const token = this.#peek();
      if (token.type === 'eof') return;

      if (depth === 0 && (token.type === 'comma' || token.type === 'rbrace' || token.type === 'rbracket')) {
        return;
      }

      if (token.type === 'lbrace' || token.type === 'lbracket') depth += 1;
      if (token.type === 'rbrace' || token.type === 'rbracket') depth -= 1;

      this.#next();
    }
  }

  /** Consumes one complete value without building nodes, for spans past the depth cap. */
  #skipValue(): void {
    let depth = 0;

    do {
      const token = this.#next();
      if (token.type === 'eof') return;
      if (token.type === 'lbrace' || token.type === 'lbracket') depth += 1;
      if (token.type === 'rbrace' || token.type === 'rbracket') depth -= 1;
    } while (depth > 0);
  }

  // ---- node helpers -------------------------------------------------------

  #numberNode(id: NodeId, raw: string): Node {
    const isInteger = !/[.eE]/.test(raw);
    const value = Number(raw);

    // `raw` is only carried when it says something `value` cannot: a big integer that has been
    // rounded, or a form like `1.50` / `1e2` whose text differs from its parsed rendering.
    const lossy = String(value) !== raw;

    return {
      id,
      kind: 'scalar',
      source: JSON_SOURCE_ID,
      scalarType: isInteger ? 'int' : 'float',
      value,
      ...(lossy ? { raw } : {}),
    };
  }

  #opaque(id: NodeId, text: string, typeName?: string): Node {
    return {
      id,
      kind: 'opaque',
      source: JSON_SOURCE_ID,
      text,
      ...(typeName === undefined ? {} : { typeName }),
    };
  }

  // ---- diagnostics --------------------------------------------------------

  #error(message: string, token: Token): void {
    this.#diagnostics.push(parseError(message, this.#span(token)));
  }

  #warn(message: string, token: Token): void {
    this.#diagnostics.push(parseWarning(message, this.#span(token)));
  }

  #span(token: Token) {
    const { line, column } = positionAt(this.#text, token.start);
    return { line, column, offset: token.start, length: Math.max(0, token.end - token.start) };
  }
}

const EOF_TOKEN: Token = { type: 'eof', start: 0, end: 0, raw: '' };

function describe(token: Token): string {
  if (token.type === 'eof') return 'end of input';
  return JSON.stringify(token.raw);
}
