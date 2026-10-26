/**
 * Pairing the children of two containers.
 *
 * Every container is reduced to a list of *slots*, each with a match key. Two slots with the same
 * key are the same position on both sides; a key on one side only is an addition or a removal.
 * What the key is depends on the container:
 *
 * - map: the key literal (or the canonical text of a structural key like a tuple)
 * - object: the field name, and the index for positional args
 * - sequence: the index — or, when `arrayKey` applies, the value of that field in each record
 * - set: the member's canonical text, since members have no position at all
 */

import {
  argChild,
  disambiguate,
  fieldChild,
  indexChild,
  keyChild,
  keyLabel,
  setItemChild,
  type ChildRelation,
  type ContainerNode,
  type MapNode,
  type Node,
} from '@objectlens/core';
import { canonicalText, scalarKey } from './canonical.js';

export interface Slot {
  readonly key: string;
  readonly label: string;
  readonly relation: ChildRelation;
  /** Absent for positions whose id depends on the merged order (set members, structural keys). */
  readonly id?: string;
  readonly index: number;
  readonly node: Node;
  /** True for records matched by identity, where a changed index is worth reporting. */
  readonly movable?: boolean;
}

export interface Pair {
  readonly label: string;
  readonly relation: ChildRelation;
  readonly id: string;
  readonly left?: Node;
  readonly right?: Node;
  readonly moved?: { readonly from: number; readonly to: number };
}

export interface PairResult {
  readonly pairs: readonly Pair[];
  /** Set when `arrayKey` was asked for but could not be applied to this sequence. */
  readonly note?: string;
}

/** Longest label shown for a member or key that is identified by its canonical text. */
const MAX_LABEL = 60;

/**
 * Pairs the children of `left` and `right`. Either side may be absent, for a subtree that exists
 * on one side only; both, when present, must be the same kind.
 */
export function pairChildren(
  parentId: string,
  left: ContainerNode | undefined,
  right: ContainerNode | undefined,
  arrayKey?: string,
): PairResult {
  const keyed = sequenceKeying(left, right, arrayKey);
  const leftSlots = left === undefined ? [] : slotsOf(parentId, left, keyed.key);
  const rightSlots = right === undefined ? [] : slotsOf(parentId, right, keyed.key);

  const pairs = merge(leftSlots, rightSlots).map((pair, position) => ({
    ...pair,
    id: pair.id ?? positionalId(parentId, (left ?? right) as ContainerNode, position),
  }));

  return keyed.note === undefined ? { pairs } : { pairs, note: keyed.note };
}

/** Decides whether two sequences can be matched by `arrayKey`, and says why not when they can't. */
function sequenceKeying(
  left: ContainerNode | undefined,
  right: ContainerNode | undefined,
  arrayKey: string | undefined,
): { key?: string; note?: string } {
  if (arrayKey === undefined || arrayKey === '') return {};
  const sides = [left, right].filter((node) => node !== undefined);
  if (sides.length === 0 || sides.some((node) => node.kind !== 'sequence')) return {};

  const items = sides.flatMap((node) => (node.kind === 'sequence' ? node.items : []));
  const identities = sides.map((node) =>
    node.kind === 'sequence' ? node.items.map((item) => identityOf(item, arrayKey)) : [],
  );

  // An array of numbers, say, was never a candidate — say nothing rather than nag about it.
  if (!identities.flat().some((identity) => identity !== null)) return {};

  const usable = identities.every(
    (ids) => ids.every((id) => id !== null) && new Set(ids).size === ids.length,
  );
  if (usable) return { key: arrayKey };

  const reason = items.length === 0 ? 'no items' : `not every item has a unique "${arrayKey}"`;
  return { note: `Matched by position: ${reason}.` };
}

/** The value of `arrayKey` in a record, as a comparable key, or `null` if it has none. */
function identityOf(node: Node, arrayKey: string): string | null {
  const value = fieldValue(node, arrayKey);
  return value?.kind === 'scalar' ? scalarKey(value) : null;
}

function fieldValue(node: Node, name: string): Node | undefined {
  if (node.kind === 'map') return node.entries.find((entry) => keyLabel(entry.key) === name)?.value;
  if (node.kind === 'object') return node.fields.find((field) => field.name === name)?.value;
  return undefined;
}

function slotsOf(parentId: string, node: ContainerNode, arrayKey?: string): readonly Slot[] {
  switch (node.kind) {
    case 'map':
      return mapSlots(parentId, node);

    case 'sequence':
      return node.items.map((item, index) => {
        if (arrayKey === undefined) {
          const key = String(index);
          return { key, label: key, relation: 'item', id: indexChild(parentId, index), index, node: item };
        }
        const value = fieldValue(item, arrayKey);
        const shown = value === undefined ? '' : (keyLabel(value) ?? '');
        return {
          key: identityOf(item, arrayKey) ?? String(index),
          label: `${arrayKey}=${shown}`,
          relation: 'item',
          // `@` marks the id as a structural position rather than an access expression.
          id: `${parentId}@where(${arrayKey}=${shown})`,
          index,
          node: item,
          movable: true,
        };
      });

    case 'set':
      return withOccurrence(
        node.items.map((item, index) => ({
          key: canonicalText(item),
          label: '•',
          relation: 'item' as const,
          index,
          node: item,
        })),
      );

    case 'object': {
      const args = (node.args ?? []).map((arg, index) => ({
        key: `arg:${index}`,
        label: String(index),
        relation: 'arg' as const,
        id: argChild(parentId, index),
        index,
        node: arg,
      }));
      const fields = node.fields.map((field, index) => ({
        key: `field:${field.name}`,
        label: field.name,
        relation: 'field' as const,
        id: fieldChild(parentId, field.name),
        index,
        node: field.value,
      }));
      return withOccurrence([...args, ...fields]);
    }
  }
}

function mapSlots(parentId: string, node: MapNode): readonly Slot[] {
  return withOccurrence(
    node.entries.map((entry, index) => {
      const label = keyLabel(entry.key);
      if (label === null) {
        // A structural key — `{(1, 2): 'x'}`. Matched by its content; no literal path exists.
        const text = canonicalText(entry.key);
        return { key: `struct:${text}`, label: elide(text), relation: 'value' as const, index, node: entry.value };
      }

      const literal =
        entry.key.kind === 'scalar' && entry.key.scalarType === 'string' ? JSON.stringify(label) : label;
      return {
        key: entry.key.kind === 'scalar' ? scalarKey(entry.key) : `text:${label}`,
        label,
        relation: 'value' as const,
        id: keyChild(parentId, literal),
        index,
        node: entry.value,
      };
    }),
  );
}

/**
 * Makes keys unique by occurrence. Well-formed input has none to fix, but a set may hold two
 * members that are equal under the bounded canonical text, and malformed input may repeat a key.
 */
function withOccurrence(slots: readonly Slot[]): readonly Slot[] {
  const seen = new Map<string, number>();
  return slots.map((slot) => {
    const count = (seen.get(slot.key) ?? 0) + 1;
    seen.set(slot.key, count);
    if (count === 1) return slot;
    return {
      ...slot,
      key: `${slot.key}#${count}`,
      ...(slot.id === undefined ? {} : { id: disambiguate(slot.id, count) }),
    };
  });
}

/**
 * Merges two slot lists into one ordered list of pairs.
 *
 * Left order wins for positions present on the left; a right-only slot is placed directly after
 * the matched slot that precedes it on the right, so an inserted key appears where it was
 * inserted rather than piled up at the end.
 */
function merge(
  leftSlots: readonly Slot[],
  rightSlots: readonly Slot[],
): readonly (Omit<Pair, 'id'> & { id?: string })[] {
  const rightByKey = new Map(rightSlots.map((slot, position) => [slot.key, position]));
  const leftKeys = new Set(leftSlots.map((slot) => slot.key));
  const result: (Omit<Pair, 'id'> & { id?: string })[] = [];

  const emitRightOnlyFrom = (start: number) => {
    for (let i = start; i < rightSlots.length; i += 1) {
      const slot = rightSlots[i];
      if (slot === undefined || leftKeys.has(slot.key)) break;
      result.push(pairOf(undefined, slot));
    }
  };

  emitRightOnlyFrom(0);
  for (const leftSlot of leftSlots) {
    const position = rightByKey.get(leftSlot.key);
    const rightSlot = position === undefined ? undefined : rightSlots[position];
    result.push(pairOf(leftSlot, rightSlot));
    if (position !== undefined) emitRightOnlyFrom(position + 1);
  }

  return result;
}

function pairOf(left: Slot | undefined, right: Slot | undefined): Omit<Pair, 'id'> & { id?: string } {
  const slot = (right ?? left) as Slot;
  const id = right?.id ?? left?.id;
  const moved =
    left !== undefined && right !== undefined && slot.movable === true && left.index !== right.index
      ? { from: left.index, to: right.index }
      : undefined;

  return {
    label: slot.label,
    relation: slot.relation,
    ...(id === undefined ? {} : { id }),
    ...(left === undefined ? {} : { left: left.node }),
    ...(right === undefined ? {} : { right: right.node }),
    ...(moved === undefined ? {} : { moved }),
  };
}

/** Ids for positions that have no access expression: set members and structural dict keys. */
function positionalId(parentId: string, container: ContainerNode, position: number): string {
  return container.kind === 'set' ? setItemChild(parentId, position) : `${parentId}@entry${position}`;
}

function elide(text: string): string {
  return text.length <= MAX_LABEL ? text : `${text.slice(0, MAX_LABEL)}…`;
}
