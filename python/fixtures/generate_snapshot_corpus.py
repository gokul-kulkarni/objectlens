"""Generate the snapshot round-trip fixture from a real interpreter.

The export snippet and the TypeScript snapshot adapter are two implementations of one contract
(`docs/schema.md`), written in different languages, that can only ever be verified together. This
produces the artefact that joins them: a snapshot of a deliberately awkward object, which
`packages/adapter-snapshot/src/corpus.test.ts` then loads and asserts against.

That makes the fixture a genuine round trip. If either side drifts — the walker starts emitting a
kind the reader does not know, the reader starts requiring a field the walker does not write — the
TypeScript suite fails, in the repository, without anyone having to remember to check.

Regenerate with:

    python3 python/fixtures/generate_snapshot_corpus.py > docs/fixtures/snapshot-corpus.json

`createdAt` is pinned so regenerating produces no diff when nothing changed. Object addresses are
not pinnable and will differ run to run; the assertions do not depend on their value.
"""

from __future__ import annotations

import collections
import datetime
import decimal
import enum
import json
import os
import sys
import uuid
from dataclasses import dataclass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "snippets"))

import export  # noqa: E402 — path juggling has to happen first

PINNED_CREATED_AT = "2026-01-01T00:00:00Z"


@dataclass
class User:
    id: int
    name: str

    @property
    def display(self):
        raise AssertionError("the exporter must never evaluate a property")


class Color(enum.Enum):
    RED = 1


class Plain:
    """No attributes, default __repr__ — the `<Foo object at 0x…>` case."""


Point = collections.namedtuple("Point", "x y")


def build() -> dict:
    """One object covering every branch the adapter has to read back.

    Grouped rather than flat so that no group exceeds the export window: the window is a global
    limit, so a flat 30-key root would be truncated too and the fixture would lose most of what it
    is here to cover. Only `windowed` is meant to exceed it.
    """
    shared = {"shared": True}

    cyclic: dict = {"name": "root"}
    cyclic["self"] = cyclic

    return {
        # The whole reason the snippet exists. repr() can express neither of these.
        "identity": {"shared_twice": [shared, shared], "cyclic": cyclic},
        # Scalars whose JSON form is lossy or impossible.
        "numbers": {
            "bignum": 2**80,
            "infinity": float("inf"),
            "negative_infinity": float("-inf"),
            "not_a_number": float("nan"),
            "negative_zero": -0.0,
            "trailing_zero": 1.50,
            "complex": complex(1, -2),
        },
        "text": {"unicode": "café 🐍", "empty": "", "raw_bytes": b"ab\xffc"},
        "absences": {"nothing": None, "flag": False, "zero": 0, "empty_list": []},
        # Every container kind.
        "containers": {
            "sequence": [1, "two", None],
            "tuple": (1, 2),
            "deque": collections.deque([1, 2]),
            "set": {1, 2},
            "frozenset": frozenset({3}),
            "counter": collections.Counter({"a": 2}),
        },
        # Keys that are not strings, including one with no literal form at all.
        "keys": {"int_key": {1: "one"}, "tuple_key": {(1, 2): "x"}},
        # Objects in each shape the walker distinguishes, then types whose own repr is the view.
        "objects": {
            "dataclass": User(1, "ada"),
            "namedtuple": Point(1, 2),
            "plain_instance": Plain(),
            "decimal": decimal.Decimal("1.50"),
            "uuid": uuid.UUID(int=1),
            "when": datetime.datetime(2024, 1, 2, 3, 4, 5),
            "colour": Color.RED,
        },
        # Exceeds the window below, so `totalCount` must report 12 while 8 children are written.
        "windowed": list(range(12)),
    }


def main() -> None:
    snapshot = export.to_snapshot(build(), max_children=8)
    snapshot["createdAt"] = PINNED_CREATED_AT

    json.dump(snapshot, sys.stdout, indent=2, ensure_ascii=False, allow_nan=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
