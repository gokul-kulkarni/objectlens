"""Generate the Python repr() test corpus from a real interpreter.

The TypeScript parser is tested against ground truth rather than against reprs written from
memory, because the details that break parsers are exactly the ones easy to misremember:
`OrderedDict` changed its repr in 3.12, `frozenset({1})` nests a brace-set, `(1+2j)` arrives
parenthesised, and the recursion marker is `[...]` rather than a bare `...`.

Regenerate with:

    python3 python/fixtures/generate_corpus.py > docs/fixtures/python-corpus.json
"""

from __future__ import annotations

import collections
import datetime
import decimal
import enum
import json
import sys
import uuid
from dataclasses import dataclass


@dataclass
class User:
    id: int
    name: str


class Color(enum.Enum):
    RED = 1


class Plain:
    pass


Point = collections.namedtuple("Point", "x y")


def build_cases() -> list[tuple[str, str, object]]:
    """Returns (group, name, value) triples; the value is rendered with repr()."""
    recursive_list: list[object] = []
    recursive_list.append(recursive_list)

    recursive_dict: dict[str, object] = {}
    recursive_dict["self"] = recursive_dict

    shared = {"shared": True}

    return [
        # -- scalars ------------------------------------------------------
        ("scalar", "none", None),
        ("scalar", "true", True),
        ("scalar", "false", False),
        ("scalar", "int", 42),
        ("scalar", "negative_int", -7),
        ("scalar", "zero", 0),
        ("scalar", "bignum", 9007199254740993),
        ("scalar", "huge_int", 2**80),
        ("scalar", "float", 4.25),
        ("scalar", "negative_float", -0.5),
        ("scalar", "exponent", 1e300),
        ("scalar", "infinity", float("inf")),
        ("scalar", "negative_infinity", float("-inf")),
        ("scalar", "not_a_number", float("nan")),
        ("scalar", "complex", complex(1, 2)),
        ("scalar", "complex_negative", complex(1, -2)),
        ("scalar", "imaginary_only", complex(0, 3)),
        # -- strings ------------------------------------------------------
        ("string", "simple", "hello"),
        ("string", "empty", ""),
        ("string", "with_apostrophe", "it's"),
        ("string", "with_double_quote", 'say "hi"'),
        ("string", "with_both_quotes", "it's a \"quote\""),
        ("string", "newline", "a\nb"),
        ("string", "tab", "a\tb"),
        ("string", "backslash", "a\\b"),
        ("string", "non_ascii", "café"),
        ("string", "emoji", "🐍"),
        ("string", "null_byte", "a\x00b"),
        ("string", "bytes", b"ab\x00c"),
        ("string", "bytes_ascii", b"plain"),
        # -- containers ---------------------------------------------------
        ("container", "empty_list", []),
        ("container", "list", [1, 2, 3]),
        ("container", "empty_tuple", ()),
        ("container", "single_tuple", (1,)),
        ("container", "tuple", (1, "two", 3.0)),
        ("container", "empty_dict", {}),
        ("container", "dict", {"a": 1, "b": 2}),
        ("container", "empty_set", set()),
        ("container", "set", {1}),
        ("container", "frozenset", frozenset({1})),
        ("container", "nested", {"users": [User(1, "ada")], "n": 2}),
        ("container", "tuple_key", {(1, 2): "x"}),
        ("container", "int_key", {1: "one"}),
        ("container", "mixed", [1, "two", None, True, 3.5, [4], {"k": "v"}]),
        ("container", "list_of_dicts", [{"id": 1}, {"id": 2}]),
        ("container", "shared_reference", [shared, shared]),
        # -- stdlib containers --------------------------------------------
        ("stdlib", "ordered_dict", collections.OrderedDict([("a", 1), ("b", 2)])),
        ("stdlib", "counter", collections.Counter({"a": 2})),
        ("stdlib", "default_dict", collections.defaultdict(int, {"a": 1})),
        ("stdlib", "deque", collections.deque([1, 2])),
        ("stdlib", "namedtuple", Point(1, 2)),
        # -- constructor reprs --------------------------------------------
        ("constructor", "datetime", datetime.datetime(2024, 1, 2, 3, 4, 5)),
        ("constructor", "date", datetime.date(2024, 1, 2)),
        ("constructor", "timedelta", datetime.timedelta(days=1, seconds=30)),
        ("constructor", "decimal", decimal.Decimal("1.50")),
        ("constructor", "uuid", uuid.UUID(int=1)),
        ("constructor", "dataclass", User(1, "ada")),
        ("constructor", "dataclass_nested", User(1, "it's ada")),
        # -- angle reprs ---------------------------------------------------
        ("angle", "instance", Plain()),
        ("angle", "class", int),
        ("angle", "builtin_function", len),
        ("angle", "enum_member", Color.RED),
        # -- recursion -----------------------------------------------------
        ("recursion", "recursive_list", recursive_list),
        ("recursion", "recursive_dict", recursive_dict),
    ]


def main() -> None:
    cases = [
        {"group": group, "name": name, "repr": repr(value)}
        for group, name, value in build_cases()
    ]

    json.dump(
        {
            "generatedBy": "python/fixtures/generate_corpus.py",
            "pythonVersion": sys.version.split()[0],
            "cases": cases,
        },
        sys.stdout,
        indent=2,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
