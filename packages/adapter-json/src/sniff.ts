/**
 * JSON detection heuristic.
 *
 * Runs for every registered adapter on every paste, so it must stay cheap: it inspects a fixed-size
 * head of the input and never parses. Fully parsing a 25 MB paste just to decide who should parse
 * it would cost more than the parse itself.
 *
 * The interesting case is telling JSON from Python `repr()`, since `{"a": 1}` is valid in both.
 * JSON scores high on double-quoted keys and is penalised by Python-only markers, so the two
 * adapters separate cleanly without either knowing about the other.
 */

import type { Confidence, RawInput } from '@objectlens/core';

const HEAD_BYTES = 4096;

const DOUBLE_QUOTED_KEY = /"(?:[^"\\]|\\.)*"\s*:/;
const SINGLE_QUOTED = /'/;
const PYTHON_LITERALS = /\b(?:None|True|False)\b/;
/** `<Foo object at 0x…>`, `datetime(…)`, `set()` — structures JSON has no syntax for. */
const PYTHON_STRUCTURES = /<[^>]*(?:object at 0x|:)[^>]*>|\b[A-Za-z_][\w.]*\(/;

export function sniffJson(input: RawInput): Confidence {
  if (input.filename?.toLowerCase().endsWith('.json') === true) return 0.95;
  if (input.mimeType === 'application/json') return 0.95;

  const head = input.text.slice(0, HEAD_BYTES).trim();
  if (head === '') return 0;

  const first = head[0] as string;

  let score: number;
  if (first === '{' || first === '[') {
    score = 0.55;
  } else if (first === '"' || first === '-' || (first >= '0' && first <= '9')) {
    // A bare scalar is legal JSON but a weak signal — almost anything starts with a digit.
    score = 0.25;
  } else if (head === 'true' || head === 'false' || head === 'null') {
    score = 0.5;
  } else {
    return 0;
  }

  if (DOUBLE_QUOTED_KEY.test(head)) score += 0.35;
  if (SINGLE_QUOTED.test(head)) score -= 0.35;
  if (PYTHON_LITERALS.test(head)) score -= 0.4;
  if (PYTHON_STRUCTURES.test(head)) score -= 0.4;

  return clamp(score);
}

function clamp(value: number): Confidence {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
