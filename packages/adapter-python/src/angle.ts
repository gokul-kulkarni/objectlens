/**
 * Interpreting `<…>` reprs.
 *
 * Anything without a `__repr__` falls back to `<Module.Class object at 0x…>`, and several stdlib
 * types use the angle form deliberately. These carry no structure, but they do carry a type name
 * and sometimes an identity — both worth extracting rather than showing the reader raw text.
 */

export interface AngleInfo {
  /** The type, as specific as the repr allows: `__main__.Plain`, `int`, `Color.RED`. */
  readonly typeName?: string;
  /** Heap address, when present. The only identity signal a text repr ever carries. */
  readonly address?: string;
  /** What flavour of angle repr this is, for view styling. */
  readonly flavour: 'instance' | 'class' | 'function' | 'enum' | 'unknown';
}

const ADDRESS = /\b(0x[0-9a-fA-F]+)\b/;

/** `<__main__.Plain object at 0x1052c9160>` */
const INSTANCE = /^([\w.]+) object at (0x[0-9a-fA-F]+)$/;
/** `<class 'int'>`, `<enum 'Color'>` */
const CLASS = /^(?:class|enum|type) '([^']+)'$/;
/** `<built-in function len>`, `<function foo at 0x…>`, `<bound method X.y of …>` */
const FUNCTION = /^(?:built-in (?:function|method)|function|method|bound method)\s+([\w.<>]+)/;
/** `<Color.RED: 1>` */
const ENUM = /^([\w.]+):\s/;

export function parseAngle(raw: string): AngleInfo {
  const inner = raw.replace(/^</, '').replace(/>$/, '').trim();

  const instance = INSTANCE.exec(inner);
  if (instance !== null) {
    return { typeName: instance[1], address: instance[2], flavour: 'instance' };
  }

  const classMatch = CLASS.exec(inner);
  if (classMatch !== null) {
    return { typeName: classMatch[1], flavour: 'class' };
  }

  const fn = FUNCTION.exec(inner);
  if (fn !== null) {
    return { typeName: fn[1], ...addressOf(inner), flavour: 'function' };
  }

  const enumMatch = ENUM.exec(inner);
  if (enumMatch !== null) {
    return { typeName: enumMatch[1], flavour: 'enum' };
  }

  return { ...addressOf(inner), flavour: 'unknown' };
}

function addressOf(inner: string): { address?: string } {
  const match = ADDRESS.exec(inner);
  return match === null ? {} : { address: match[1] as string };
}
