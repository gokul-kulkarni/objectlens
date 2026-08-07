/**
 * Tolerant recursive-descent parser for Python `repr()` / `pprint` output.
 *
 * Never throws: an unparseable span becomes an `opaque` node plus a diagnostic and the parser
 * resynchronises, so one `<User: id=1>` in a 4000-line dump costs its own line and no more.
 */

import {
  argChild,
  createIdAllocator,
  fieldChild,
  indexChild,
  keyChild,
  keyNodeChild,
  keyValueChild,
  parseError,
  parseWarning,
  positionAt,
  MAX_PARSE_DEPTH,
  ROOT_ID,
  setItemChild,
  type Diagnostic,
  type IdAllocator,
  type MapEntry,
  type Node,
  type NodeId,
  type ObjectField,
  type ScalarType,
} from '@objectlens/core';
import { tokenize, type Token, type TokenType } from './lexer.js';
import { parseAngle } from './angle.js';
import { normaliseWellKnown } from './wellknown.js';

export const PYTHON_SOURCE_ID = 'python-repr';

export interface PythonParseOutcome {
  readonly root: Node;
  readonly diagnostics: readonly Diagnostic[];
  readonly truncated: boolean;
}

export function parsePython(text: string): PythonParseOutcome {
  return new PythonParser(text).parse();
}

/** A container currently being parsed, for resolving Python's `...` recursion marker. */
interface OpenContainer {
  readonly id: NodeId;
  readonly kind: 'sequence' | 'map' | 'set';
}

class PythonParser {
  readonly #text: string;
  readonly #tokens: readonly Token[];
  readonly #diagnostics: Diagnostic[] = [];
  readonly #allocator: IdAllocator = createIdAllocator();
  readonly #open: OpenContainer[] = [];
  #pos = 0;
  #truncated = false;

  constructor(text: string) {
    this.#text = text;
    this.#tokens = tokenize(text);
  }

  parse(): PythonParseOutcome {
    const root = this.#parseValue(this.#allocator.allocate(ROOT_ID), 0);

    const trailing = this.#peek();
    if (trailing.type !== 'eof') {
      this.#error('Unexpected content after the top-level value', trailing);
    }

    return { root, diagnostics: this.#diagnostics, truncated: this.#truncated };
  }

  // ---- token stream -------------------------------------------------------

  #peek(offset = 0): Token {
    return this.#tokens[this.#pos + offset] ?? EOF_TOKEN;
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
      return this.#opaque(id, '…', { typeName: 'too deep' });
    }

    const sign = this.#acceptSign();
    const node = this.#parseAtom(id, depth, sign);
    return this.#maybeComplex(id, node);
  }

  /** Consumes a leading `-`/`+`, which repr emits for negative numbers and `-inf`. */
  #acceptSign(): '' | '-' {
    if (this.#accept('plus') !== undefined) return '';
    return this.#accept('minus') !== undefined ? '-' : '';
  }

  #parseAtom(id: NodeId, depth: number, sign: '' | '-'): Node {
    const token = this.#peek();

    switch (token.type) {
      case 'lbracket':
        return this.#parseList(id, depth);
      case 'lparen':
        return this.#parseParen(id, depth);
      case 'lbrace':
        return this.#parseBrace(id, depth);
      case 'string':
        this.#next();
        return this.#stringNode(id, token);
      case 'number':
        this.#next();
        return this.#numberNode(id, sign + token.raw, token);
      case 'name':
        return this.#parseNameOrCall(id, depth, sign);
      case 'angle': {
        this.#next();
        const info = parseAngle(token.raw);
        return this.#opaque(id, token.raw, info);
      }
      case 'ellipsis':
        // A bare `...` outside a container has no ancestor to point at.
        this.#next();
        return this.#opaque(id, '...', { typeName: 'Ellipsis' });
      default:
        this.#next();
        this.#error(token.message ?? `Unexpected ${describe(token)}`, token);
        return this.#opaque(id, token.raw === '' ? '<empty>' : token.raw);
    }
  }

  /** `1+2j` — repr writes complex numbers as an addition, so it is lexed as three tokens. */
  #maybeComplex(id: NodeId, node: Node): Node {
    if (node.kind !== 'scalar' || (node.scalarType !== 'int' && node.scalarType !== 'float')) {
      return node;
    }

    const operator = this.#peek();
    const imaginary = this.#peek(1);
    if (
      (operator.type !== 'plus' && operator.type !== 'minus') ||
      imaginary.type !== 'number' ||
      imaginary.numberKind !== 'imaginary'
    ) {
      return node;
    }

    this.#next();
    this.#next();

    const raw = `${node.raw ?? String(node.value)}${operator.raw}${imaginary.raw}`;
    return { id, kind: 'scalar', source: PYTHON_SOURCE_ID, scalarType: 'complex', value: raw, raw };
  }

  // ---- containers ---------------------------------------------------------

  #parseList(id: NodeId, depth: number): Node {
    this.#next();

    const recursive = this.#recursionMarker(id, 'rbracket', 'sequence');
    if (recursive !== undefined) return recursive;

    const items = this.#parseItems(id, depth, 'rbracket', ']', COMMA_SEPARATOR, (index) =>
      indexChild(id, index),
    );
    return { id, kind: 'sequence', source: PYTHON_SOURCE_ID, typeName: 'list', items };
  }

  /** `()` and `(1,)` are tuples; `(1+2j)` is a grouped complex; `(x)` is grouping. */
  #parseParen(id: NodeId, depth: number): Node {
    this.#next();

    const recursive = this.#recursionMarker(id, 'rparen', 'sequence');
    if (recursive !== undefined) return recursive;

    if (this.#accept('rparen') !== undefined) {
      return { id, kind: 'sequence', source: PYTHON_SOURCE_ID, typeName: 'tuple', items: [] };
    }

    this.#open.push({ id, kind: 'sequence' });
    const first = this.#parseValue(this.#allocator.allocate(indexChild(id, 0)), depth + 1);

    // No comma means this was grouping, not a tuple — `repr(complex(1, 2))` is `(1+2j)`.
    if (this.#peek().type === 'rparen') {
      this.#open.pop();
      this.#next();
      return first;
    }

    const rest = this.#continueItems(depth, 'rparen', ')', COMMA_SEPARATOR, (i) => indexChild(id, i), 1);
    const items = [first, ...rest];
    this.#open.pop();

    return { id, kind: 'sequence', source: PYTHON_SOURCE_ID, typeName: 'tuple', items };
  }

  /** `{}` is a dict; `{1, 2}` a set; `{1: 2}` a dict. Disambiguated by the first separator. */
  #parseBrace(id: NodeId, depth: number): Node {
    this.#next();

    const recursive = this.#recursionMarker(id, 'rbrace', 'map');
    if (recursive !== undefined) return recursive;

    if (this.#accept('rbrace') !== undefined) {
      return { id, kind: 'map', source: PYTHON_SOURCE_ID, typeName: 'dict', entries: [] };
    }

    return this.#looksLikeDict() ? this.#parseDict(id, depth) : this.#parseSet(id, depth);
  }

  /** Scans ahead for the `:` that separates a dict key from its value at brace depth 0. */
  #looksLikeDict(): boolean {
    let depth = 0;

    for (let offset = 0; ; offset += 1) {
      const token = this.#peek(offset);
      if (token.type === 'eof') return false;

      if (depth === 0) {
        if (token.type === 'colon') return true;
        if (token.type === 'comma' || token.type === 'rbrace') return false;
      }

      if (token.type === 'lbrace' || token.type === 'lbracket' || token.type === 'lparen') depth += 1;
      if (token.type === 'rbrace' || token.type === 'rbracket' || token.type === 'rparen') depth -= 1;
      if (depth < 0) return false;
    }
  }

  #parseDict(id: NodeId, depth: number): Node {
    this.#open.push({ id, kind: 'map' });
    const entries: MapEntry[] = [];

    while (this.#peek().type !== 'rbrace' && this.#peek().type !== 'eof') {
      const entry = this.#parseEntry(id, entries.length, depth);
      if (entry !== undefined) entries.push(entry);
      if (!this.#expectSeparator('rbrace', '}', COMMA_SEPARATOR)) break;
    }

    this.#expectClose('rbrace', '}');
    this.#open.pop();

    return { id, kind: 'map', source: PYTHON_SOURCE_ID, typeName: 'dict', entries };
  }

  #parseEntry(parentId: NodeId, index: number, depth: number): MapEntry | undefined {
    const keyId = this.#allocator.allocate(keyNodeChild(parentId, index));
    const key = this.#parseValue(keyId, depth + 1);

    if (this.#accept('colon') === undefined) {
      this.#error('Expected ":" after dict key', this.#peek());
      this.#recover('rbrace');
      return undefined;
    }

    // The path uses the key's source-language literal, so `$['users']` pastes back into Python.
    // A structural key has no such literal, and inventing one would hand the reader a "copy path"
    // that does not evaluate — so those values get an unaddressable `@value` position instead.
    const literal = keyLiteral(key);
    const valueId = this.#allocator.allocate(
      literal === null ? keyValueChild(parentId, index) : keyChild(parentId, literal),
    );
    return { key, value: this.#parseValue(valueId, depth + 1) };
  }

  #parseSet(id: NodeId, depth: number): Node {
    this.#open.push({ id, kind: 'set' });
    // `{'a' 1}` is equally a dict missing a colon and a set missing a comma. The parser reads it
    // as a set, so the diagnostic names both readings rather than asserting the one it guessed.
    const items = this.#parseItems(id, depth, 'rbrace', '}', SET_SEPARATOR, (index) =>
      setItemChild(id, index),
    );
    this.#open.pop();

    return { id, kind: 'set', source: PYTHON_SOURCE_ID, typeName: 'set', items };
  }

  #parseItems(
    id: NodeId,
    depth: number,
    closer: TokenType,
    symbol: string,
    hint: string,
    childId: (index: number) => NodeId,
  ): readonly Node[] {
    if (closer !== 'rbrace') this.#open.push({ id, kind: 'sequence' });
    const items = this.#continueItems(depth, closer, symbol, hint, childId, 0);
    if (closer !== 'rbrace') this.#open.pop();
    return items;
  }

  #continueItems(
    depth: number,
    closer: TokenType,
    symbol: string,
    hint: string,
    childId: (index: number) => NodeId,
    startIndex: number,
  ): readonly Node[] {
    const items: Node[] = [];
    let index = startIndex;

    // `startIndex > 0` means the caller already consumed a first item.
    if (startIndex > 0 && !this.#expectSeparator(closer, symbol, hint)) {
      this.#expectClose(closer, symbol);
      return items;
    }

    while (this.#peek().type !== closer && this.#peek().type !== 'eof') {
      items.push(this.#parseValue(this.#allocator.allocate(childId(index)), depth + 1));
      index += 1;
      if (!this.#expectSeparator(closer, symbol, hint)) break;
    }

    this.#expectClose(closer, symbol);
    return items;
  }

  /**
   * Consumes the `,` between items. Returns false when the sequence has ended — either legitimately
   * (closer reached, or a tolerated trailing comma) or after reporting a missing separator.
   */
  #expectSeparator(closer: TokenType, symbol: string, hint: string): boolean {
    if (this.#accept('comma') !== undefined) {
      return this.#peek().type !== closer; // false swallows a trailing comma
    }

    const next = this.#peek();
    if (next.type === closer || next.type === 'eof') return false;

    this.#error(`Expected ${hint} or "${symbol}"`, next);
    this.#recover(closer);

    return this.#accept('comma') !== undefined && this.#peek().type !== closer;
  }

  /**
   * Recognises Python's recursion marker — `[...]`, `{...}`, `(...)`.
   *
   * Unambiguous, because `repr(Ellipsis)` is the word "Ellipsis": a literal `...` can only mean
   * "a container already being rendered further up". It becomes a `ref` to the nearest enclosing
   * container of the same kind, which is what makes cycles visible in the graph view.
   */
  #recursionMarker(id: NodeId, closer: TokenType, kind: OpenContainer['kind']): Node | undefined {
    if (this.#peek().type !== 'ellipsis' || this.#peek(1).type !== closer) return undefined;

    this.#next();
    this.#next();

    const target = findLast(this.#open, (container) => container.kind === kind) ?? this.#open[this.#open.length - 1];

    if (target === undefined) {
      // `[...]` at the very top has nothing to point at; say so rather than inventing a target.
      this.#warn('Recursion marker with no enclosing container', this.#peek());
      return this.#opaque(id, '...', { typeName: 'recursion' });
    }

    return { id, kind: 'ref', source: PYTHON_SOURCE_ID, target: target.id, cycle: true };
  }

  // ---- names, calls, objects ----------------------------------------------

  #parseNameOrCall(id: NodeId, depth: number, sign: '' | '-'): Node {
    const dotted = this.#readDottedName();

    if (this.#peek().type === 'lparen') {
      return this.#parseCall(id, depth, dotted);
    }

    return this.#literalName(id, dotted, sign);
  }

  #readDottedName(): string {
    let name = this.#next().raw;

    while (this.#peek().type === 'dot' && this.#peek(1).type === 'name') {
      this.#next();
      name += `.${this.#next().raw}`;
    }

    return name;
  }

  #literalName(id: NodeId, name: string, sign: '' | '-'): Node {
    const scalar = (scalarType: ScalarType, value: string | number | boolean | null, raw?: string): Node => ({
      id,
      kind: 'scalar',
      source: PYTHON_SOURCE_ID,
      scalarType,
      value,
      ...(raw === undefined ? {} : { raw }),
    });

    switch (name) {
      case 'None':
        return scalar('null', null);
      case 'True':
        return scalar('bool', true);
      case 'False':
        return scalar('bool', false);
      case 'inf':
        // JSON has no infinity, so `value` cannot hold it; `raw` is authoritative.
        return scalar('float', null, `${sign}inf`);
      case 'nan':
        return scalar('float', null, `${sign}nan`);
      default:
        return this.#opaque(id, sign + name, { typeName: name });
    }
  }

  #parseCall(id: NodeId, depth: number, callee: string): Node {
    this.#next(); // consume `(`

    const args: Node[] = [];
    const kwargs: { name: string; value: Node }[] = [];

    while (this.#peek().type !== 'rparen' && this.#peek().type !== 'eof') {
      const keyword = this.#peekKeywordName();

      if (keyword !== undefined) {
        this.#next();
        this.#next();
        const valueId = this.#allocator.allocate(fieldChild(id, keyword));
        kwargs.push({ name: keyword, value: this.#parseValue(valueId, depth + 1) });
      } else {
        const valueId = this.#allocator.allocate(argChild(id, args.length));
        args.push(this.#parseValue(valueId, depth + 1));
      }

      if (!this.#expectSeparator('rparen', ')', COMMA_SEPARATOR)) break;
    }

    this.#expectClose('rparen', ')');

    const normalised = normaliseWellKnown(id, PYTHON_SOURCE_ID, { callee, args, kwargs });
    if (normalised !== undefined) return normalised;

    const fields: ObjectField[] = kwargs.map(({ name, value }) => ({ name, value, category: 'data' }));

    return {
      id,
      kind: 'object',
      source: PYTHON_SOURCE_ID,
      typeName: callee,
      fields,
      ...(args.length > 0 ? { args } : {}),
    };
  }

  /** `name=` at the current position, i.e. a keyword argument rather than a positional one. */
  #peekKeywordName(): string | undefined {
    return this.#peek().type === 'name' && this.#peek(1).type === 'equals'
      ? this.#peek().raw
      : undefined;
  }

  // ---- scalars ------------------------------------------------------------

  #stringNode(id: NodeId, token: Token): Node {
    const prefix = token.prefix ?? '';
    const isBytes = prefix.includes('b');

    if (token.message !== undefined) this.#warn(token.message, token);

    return {
      id,
      kind: 'scalar',
      source: PYTHON_SOURCE_ID,
      scalarType: isBytes ? 'bytes' : 'string',
      value: token.value ?? '',
      ...(prefix === '' ? {} : { meta: { prefix } }),
    };
  }

  #numberNode(id: NodeId, raw: string, token: Token): Node {
    const kind = token.numberKind ?? 'int';

    if (kind === 'imaginary') {
      return { id, kind: 'scalar', source: PYTHON_SOURCE_ID, scalarType: 'complex', value: raw, raw };
    }

    const normalised = raw.replace(/_/g, '');
    const value = Number(normalised);
    const scalarType: ScalarType = kind === 'float' ? 'float' : 'int';

    // Carry `raw` only when it says something `value` cannot — a rounded bignum, `0x1f`, `1_000`.
    const lossy = String(value) !== raw;

    return {
      id,
      kind: 'scalar',
      source: PYTHON_SOURCE_ID,
      scalarType,
      value,
      ...(lossy ? { raw } : {}),
    };
  }

  #opaque(id: NodeId, text: string, info: { typeName?: string; address?: string } = {}): Node {
    return {
      id,
      kind: 'opaque',
      source: PYTHON_SOURCE_ID,
      text,
      ...(info.typeName === undefined ? {} : { typeName: info.typeName }),
      ...(info.address === undefined ? {} : { address: info.address }),
    };
  }

  // ---- recovery -----------------------------------------------------------

  #expectClose(type: TokenType, symbol: string): void {
    if (this.#accept(type) === undefined) {
      this.#error(`Expected "${symbol}"`, this.#peek());
    }
  }

  #recover(closer: TokenType): void {
    let depth = 0;

    for (;;) {
      const token = this.#peek();
      if (token.type === 'eof') return;
      if (depth === 0 && (token.type === 'comma' || token.type === closer)) return;

      if (token.type === 'lbrace' || token.type === 'lbracket' || token.type === 'lparen') depth += 1;
      if (token.type === 'rbrace' || token.type === 'rbracket' || token.type === 'rparen') depth -= 1;

      this.#next();
    }
  }

  #skipValue(): void {
    let depth = 0;

    do {
      const token = this.#next();
      if (token.type === 'eof') return;
      if (token.type === 'lbrace' || token.type === 'lbracket' || token.type === 'lparen') depth += 1;
      if (token.type === 'rbrace' || token.type === 'rbracket' || token.type === 'rparen') depth -= 1;
    } while (depth > 0);
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

const COMMA_SEPARATOR = '","';
/** Inside braces a missing separator is ambiguous between a set and a dict. */
const SET_SEPARATOR = '"," or ":"';

/** Renders a key node back to Python source, for use inside a path id. */
/** The key's Python literal, or `null` when it has none — `{(1, 2): 'x'}`, `{frozenset(): 'y'}`. */
function keyLiteral(key: Node): string | null {
  if (key.kind !== 'scalar') return null;
  if (key.scalarType === 'string') return pythonQuote(String(key.value));
  return key.raw ?? String(key.value);
}

function pythonQuote(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function describe(token: Token): string {
  return token.type === 'eof' ? 'end of input' : JSON.stringify(token.raw);
}

function findLast<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item !== undefined && predicate(item)) return item;
  }
  return undefined;
}
