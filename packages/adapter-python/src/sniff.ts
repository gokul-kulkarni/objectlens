/**
 * Python `repr()` detection heuristic.
 *
 * Cheap by contract — it runs for every registered adapter on every paste, so it reads a fixed
 * head and never parses.
 *
 * The delicate case is input valid in both languages. `{"a": 1}` is legal Python *and* legal JSON;
 * neither adapter knows about the other, so each scores its own evidence and the registry picks the
 * winner. Ambiguous input deliberately loses to JSON, which is the safer reading of a paste that
 * carries no Python-specific syntax.
 */

import { maskDoubleQuotedStrings, type Confidence, type RawInput } from '@objectlens/core';

const HEAD_BYTES = 4096;

const SINGLE_QUOTED = /'/;
const PYTHON_LITERALS = /\b(?:None|True|False)\b/;
const INSTANCE_REPR = /<[\w.]+ object at 0x[0-9a-fA-F]+>|<class '[^']*'>|<[\w.]+:\s/;
const CONSTRUCTOR_REPR = /\b[A-Za-z_][\w.]*\(/;
const TUPLE_SHAPE = /\(\s*\)|,\s*\)/;
const BYTES_LITERAL = /\bb'|\bb"/;
const SET_CONSTRUCTOR = /\b(?:set|frozenset)\(/;
/** Double-quoted keys with nothing Python-specific — the shape of plain JSON. */
const DOUBLE_QUOTED_KEY = /"(?:[^"\\]|\\.)*"\s*:/;
/** A lone string or number, once masked: legal in both languages and typical of neither. */
const BARE_JSON_SCALAR = /^(?:""|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;

export function sniffPython(input: RawInput): Confidence {
  // Matches the strength JSON gives `.json`, so an explicit extension is decisive rather than
  // tying with a content-based score and losing on registration order.
  if (input.filename?.toLowerCase().endsWith('.py') === true) return 0.95;

  const head = maskDoubleQuotedStrings(input.text.slice(0, HEAD_BYTES).trim());
  if (head === '') return 0;

  if (!canStartPythonValue(head)) return 0;

  let score = 0.4;

  if (SINGLE_QUOTED.test(head)) score += 0.25;
  if (PYTHON_LITERALS.test(head)) score += 0.3;
  if (INSTANCE_REPR.test(head)) score += 0.4;
  if (CONSTRUCTOR_REPR.test(head)) score += 0.2;
  if (SET_CONSTRUCTOR.test(head)) score += 0.2;
  if (BYTES_LITERAL.test(head)) score += 0.2;
  if (TUPLE_SHAPE.test(head)) score += 0.1;

  // Nothing Python-specific, and shaped like JSON: defer to it.
  if (score === 0.4 && (DOUBLE_QUOTED_KEY.test(head) || BARE_JSON_SCALAR.test(head))) score -= 0.3;

  return clamp(score);
}

/** `b'…'`, `r"…"`, `rb'…'` — a prefixed string literal is a legitimate top-level repr. */
const PREFIXED_STRING_START = /^[rbufRBUF]{1,3}['"]/;

/**
 * A constructor repr has no space before its paren: `User(id=1)`, never `User (id=1)`.
 *
 * That detail matters more than it looks — without it, ordinary prose like
 * `Traceback (most recent call last):` reads as a constructor call and scores as Python.
 */
const CONSTRUCTOR_START = /^[A-Za-z_][\w.]*\(/;

function canStartPythonValue(head: string): boolean {
  const first = head[0] as string;

  if ('{[(<\'"'.includes(first)) return true;
  if (first === '-' || (first >= '0' && first <= '9')) return true;
  if (PREFIXED_STRING_START.test(head)) return true;

  return CONSTRUCTOR_START.test(head) || /^(?:None|True|False|inf|nan)\b/.test(head);
}

function clamp(value: number): Confidence {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
