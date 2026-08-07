"""Tests for the zero-install export snippet.

Written against `unittest` rather than pytest on purpose: the snippet's whole promise is that it
needs nothing installed, and a test suite that needs a `pip install` to prove that is a poor
witness. Runs with `python3 -m unittest discover python/tests`, and pytest collects it too.
"""

from __future__ import annotations

import collections
import datetime
import decimal
import enum
import json
import math
import os
import sys
import tempfile
import unittest
import uuid
from dataclasses import dataclass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "snippets"))

from export import (  # noqa: E402 — path juggling has to happen first
    MAX_CHILDREN,
    hex_address,
    key_literal,
    lens,
    lens_json,
    to_snapshot,
)


@dataclass
class User:
    id: int
    name: str

    @property
    def label(self):
        raise AssertionError("a property getter must never be called by the exporter")


class Color(enum.Enum):
    RED = 1


class Plain:
    pass


class Slotted:
    __slots__ = ("a", "b")

    def __init__(self):
        self.a = 1
        self.b = 2


Point = collections.namedtuple("Point", "x y")


def node_of(obj, **limits):
    return to_snapshot(obj, **limits)["root"]


def find(node, node_id):
    """Depth-first lookup by id, so tests can name the position they care about."""
    if node.get("id") == node_id:
        return node

    children = []
    for entry in node.get("entries", []):
        children.extend([entry["key"], entry["value"]])
    children.extend(node.get("items", []))
    children.extend(field["value"] for field in node.get("fields", []))
    children.extend(node.get("args", []))

    for child in children:
        found = find(child, node_id)
        if found is not None:
            return found
    return None


class TestScalars(unittest.TestCase):
    def kind_of(self, value):
        node = node_of(value)
        return node["scalarType"], node["value"], node.get("raw")

    def test_none_true_false(self):
        self.assertEqual(self.kind_of(None), ("null", None, "None"))
        self.assertEqual(self.kind_of(True), ("bool", True, "True"))
        self.assertEqual(self.kind_of(False), ("bool", False, "False"))

    def test_bool_is_not_reported_as_int(self):
        # `bool` subclasses `int`, so an isinstance chain in the wrong order silently turns
        # every True in the graph into a 1.
        self.assertEqual(node_of(True)["scalarType"], "bool")

    def test_bignum_keeps_its_exact_text(self):
        # `value` is already lossy by the time JSON.parse sees it; `raw` is what the viewer renders.
        node = node_of(2**80)
        self.assertEqual(node["raw"], "1208925819614629174706176")

    def test_infinity_and_nan_move_into_raw(self):
        # JSON cannot write either. Emitting a bare `NaN` produces a file no browser will load.
        for value, raw in [(float("inf"), "inf"), (float("-inf"), "-inf"), (float("nan"), "nan")]:
            node = node_of(value)
            self.assertIsNone(node["value"])
            self.assertEqual(node["raw"], raw)

    def test_trailing_zero_float_survives_in_raw(self):
        self.assertEqual(node_of(1.50)["raw"], "1.5")

    def test_bytes_are_not_silently_corrupted(self):
        # `errors="replace"` would turn every unreadable byte into the same `?`.
        node = node_of(b"ab\xffc")
        self.assertEqual(node["scalarType"], "bytes")
        self.assertIn("\\xff", node["value"])
        self.assertEqual(node["raw"], repr(b"ab\xffc"))

    def test_complex(self):
        node = node_of(complex(1, -2))
        self.assertEqual(node["scalarType"], "complex")
        self.assertEqual(node["raw"], "(1-2j)")


class TestContainers(unittest.TestCase):
    def test_dict_becomes_a_map_with_node_keys(self):
        node = node_of({"a": 1})
        self.assertEqual(node["kind"], "map")
        self.assertEqual(node["entries"][0]["key"]["value"], "a")
        self.assertEqual(node["entries"][0]["value"]["value"], 1)

    def test_list_and_tuple_are_sequences_that_keep_their_type_name(self):
        # `kind` is what views switch on; `typeName` is how a reader tells a tuple from a list.
        self.assertEqual((node_of([1])["kind"], node_of([1])["typeName"]), ("sequence", "list"))
        self.assertEqual((node_of((1,))["kind"], node_of((1,))["typeName"]), ("sequence", "tuple"))

    def test_set_is_distinct_from_sequence(self):
        node = node_of({1})
        self.assertEqual(node["kind"], "set")
        self.assertIn("@item0", node["items"][0]["id"])

    def test_dict_subclasses_stay_maps(self):
        for value in [
            collections.OrderedDict([("a", 1)]),
            collections.Counter({"a": 2}),
            collections.defaultdict(int, {"a": 1}),
        ]:
            self.assertEqual(node_of(value)["kind"], "map")

    def test_deque_is_a_sequence(self):
        # Not a list or tuple, but a Sequence — dispatching on the abstract type rather than a
        # hardcoded list of concrete ones is what makes user containers work too.
        self.assertEqual(node_of(collections.deque([1, 2]))["kind"], "sequence")

    def test_namedtuple_keeps_its_field_names(self):
        node = node_of(Point(1, 2))
        self.assertEqual(node["kind"], "object")
        self.assertEqual([f["name"] for f in node["fields"]], ["x", "y"])

    def test_total_count_reports_the_true_size_when_windowed(self):
        node = node_of(list(range(10)), max_children=3)
        self.assertEqual(len(node["items"]), 3)
        self.assertEqual(node["totalCount"], 10)
        self.assertTrue(to_snapshot(list(range(10)), max_children=3)["truncated"])

    def test_default_window_is_generous_enough_for_ordinary_data(self):
        self.assertGreaterEqual(MAX_CHILDREN, 1000)


class TestIdentity(unittest.TestCase):
    def test_a_shared_object_becomes_a_ref_rather_than_a_second_copy(self):
        # This is the entire reason the snippet exists: repr() cannot express it.
        shared = {"n": 1}
        node = node_of([shared, shared])

        self.assertEqual(node["items"][0]["kind"], "map")
        self.assertEqual(node["items"][1]["kind"], "ref")
        self.assertEqual(node["items"][1]["target"], node["items"][0]["id"])

    def test_a_shared_reference_is_not_reported_as_a_cycle(self):
        shared = {"n": 1}
        self.assertFalse(node_of([shared, shared])["items"][1]["cycle"])

    def test_a_back_edge_into_an_ancestor_is_reported_as_a_cycle(self):
        cyclic = {}
        cyclic["self"] = cyclic
        node = node_of(cyclic)

        ref = node["entries"][0]["value"]
        self.assertEqual(ref["kind"], "ref")
        self.assertTrue(ref["cycle"])
        self.assertEqual(ref["target"], "$")

    def test_siblings_after_a_cycle_are_not_mistaken_for_cycles(self):
        # The ancestor set has to be popped on the way back up. Leaving it populated would mark
        # every later reference to an earlier object as a cycle.
        inner = {}
        inner["self"] = inner
        node = node_of({"first": inner, "second": inner})

        second = node["entries"][1]["value"]
        self.assertEqual(second["kind"], "ref")
        self.assertFalse(second["cycle"])

    def test_interned_atoms_are_not_reported_as_shared(self):
        # `id(1) == id(1)` in CPython. Tracking identity here would claim two unrelated lists
        # share a reference to the number one.
        node = node_of([1, 1, "x", "x"])
        self.assertTrue(all(item["kind"] == "scalar" for item in node["items"]))

    def test_repeated_enum_members_are_atoms_not_shared_objects(self):
        node = node_of([Color.RED, Color.RED])
        self.assertTrue(all(item["kind"] == "opaque" for item in node["items"]))


class TestObjects(unittest.TestCase):
    def test_dataclass_fields_are_read_from_the_instance_dict(self):
        node = node_of(User(1, "ada"))
        self.assertEqual(node["kind"], "object")
        self.assertEqual(node["typeName"], "User")
        self.assertEqual([f["name"] for f in node["fields"]], ["id", "name"])

    def test_a_property_is_never_evaluated(self):
        # `User.label` raises AssertionError if called. Reaching the end of this test is the
        # assertion: the exporter must not touch descriptors.
        snapshot = to_snapshot(User(1, "ada"))
        self.assertNotIn("label", [f["name"] for f in snapshot["root"]["fields"]])

    def test_skipped_properties_are_reported_rather_than_hidden(self):
        # A reader looking for `label` deserves to learn that it exists and why it is absent.
        snapshot = to_snapshot(User(1, "ada"))
        self.assertEqual(snapshot["root"]["meta"]["skippedProperties"], ["label"])
        self.assertTrue(any("never calls them" in d["message"] for d in snapshot["diagnostics"]))

    def test_slots_are_read_where_they_are_filled(self):
        node = node_of(Slotted())
        self.assertEqual(sorted(f["name"] for f in node["fields"]), ["a", "b"])

    def test_an_instance_with_nothing_set_falls_back_to_its_repr(self):
        node = node_of(Plain())
        self.assertEqual(node["kind"], "opaque")
        self.assertTrue(node["text"].startswith("<"))
        self.assertTrue(node["address"].startswith("0x"))

    def test_types_whose_repr_is_the_canonical_view_keep_it(self):
        # Reading UUID's slots instead yields `UUID(int=1, is_safe=…)`, which is strictly worse
        # than what its author already wrote.
        for value, expected in [
            (uuid.UUID(int=1), "UUID('00000000-0000-0000-0000-000000000001')"),
            (decimal.Decimal("1.50"), "Decimal('1.50')"),
            (datetime.date(2024, 1, 2), "datetime.date(2024, 1, 2)"),
            (Color.RED, "<Color.RED: 1>"),
        ]:
            node = node_of(value)
            self.assertEqual(node["kind"], "opaque")
            self.assertEqual(node["text"], expected)

    def test_a_class_object_is_not_walked_as_a_bag_of_dunders(self):
        node = node_of(User)
        self.assertEqual(node["kind"], "opaque")


class TestIds(unittest.TestCase):
    def test_paths_paste_back_into_python(self):
        node = node_of({"users": [{"name": "ada"}]})
        self.assertIsNotNone(find(node, "$['users'][0]['name']"))

    def test_object_fields_use_attribute_access(self):
        self.assertIsNotNone(find(node_of({"u": User(1, "ada")}), "$['u'].name"))

    def test_a_non_identifier_attribute_is_marked_unaddressable(self):
        plain = Plain()
        setattr(plain, "odd name", 1)
        self.assertIsNotNone(find(node_of(plain), "$@field(odd name)"))

    def test_a_structural_key_leaves_its_value_unaddressable(self):
        # There is no expression that subscripts a dict by a tuple you would have to build first,
        # so `$[key0]` would be a path that looks real and does not run.
        node = node_of({(1, 2): "x"})
        self.assertEqual([node["entries"][0][k]["id"] for k in ("key", "value")], ["$@key0", "$@value0"])

    def test_ordinary_non_string_keys_keep_their_literal(self):
        self.assertIsNotNone(find(node_of({1: "one"}), "$[1]"))
        self.assertIsNotNone(find(node_of({True: "t"}), "$[True]"))

    def test_ids_are_unique(self):
        seen = []

        def collect(node):
            seen.append(node["id"])
            for entry in node.get("entries", []):
                collect(entry["key"])
                collect(entry["value"])
            for item in node.get("items", []):
                collect(item)
            for field in node.get("fields", []):
                collect(field["value"])

        shared = {"n": 1}
        collect(node_of({"a": [shared, shared], "b": {(1, 2): "x"}, "c": {1, 2}}))
        self.assertEqual(len(seen), len(set(seen)))


class TestKeyLiteral(unittest.TestCase):
    def test_scalar_keys_render_in_python_syntax(self):
        self.assertEqual(key_literal("a"), "'a'")
        self.assertEqual(key_literal(1), "1")
        self.assertEqual(key_literal(None), "None")

    def test_structural_keys_have_none(self):
        self.assertIsNone(key_literal((1, 2)))
        self.assertIsNone(key_literal(frozenset()))

    def test_non_finite_float_keys_have_none(self):
        # `{float('nan'): 1}` is legal Python, but `$[nan]` is not an expression that evaluates.
        self.assertIsNone(key_literal(float("nan")))
        self.assertEqual(key_literal(1.5), "1.5")


class TestHostility(unittest.TestCase):
    def test_a_raising_repr_costs_one_node_not_the_export(self):
        class Hostile:
            def __repr__(self):
                raise RuntimeError("boom")

        node = node_of({"bad": Hostile(), "good": 1})
        self.assertIn("RuntimeError", find(node, "$['bad']")["text"])
        self.assertEqual(find(node, "$['good']")["value"], 1)

    def test_a_container_that_refuses_to_iterate_degrades_to_opaque(self):
        class Hostile(collections.abc.Sequence):
            def __len__(self):
                return 1

            def __getitem__(self, index):
                raise RuntimeError("boom")

        snapshot = to_snapshot({"bad": Hostile()})
        self.assertEqual(find(snapshot["root"], "$['bad']")["kind"], "opaque")
        self.assertTrue(any(d["severity"] == "warning" for d in snapshot["diagnostics"]))

    def test_depth_is_capped_rather_than_overflowing_the_stack(self):
        deep = current = []
        for _ in range(500):
            nxt = []
            current.append(nxt)
            current = nxt

        snapshot = to_snapshot(deep, max_depth=50)
        self.assertTrue(snapshot["truncated"])
        self.assertTrue(any(d["severity"] == "warning" for d in snapshot["diagnostics"]))

    def test_the_node_budget_stops_a_runaway_walk(self):
        snapshot = to_snapshot([[i] for i in range(500)], max_nodes=20)
        self.assertTrue(snapshot["truncated"])


class TestSnapshotEnvelope(unittest.TestCase):
    def test_it_declares_the_schema_the_site_sniffs_on(self):
        snapshot = to_snapshot({})
        self.assertEqual(snapshot["$schema"], "https://objectlens.dev/schema/v1")
        self.assertEqual(snapshot["schemaVersion"], 1)
        self.assertTrue(snapshot["generator"].startswith("objectlens-snippet/"))
        self.assertEqual(snapshot["source"], "python-live")

    def test_created_at_is_utc_and_parseable(self):
        stamp = to_snapshot({})["createdAt"]
        self.assertTrue(stamp.endswith("Z"))
        datetime.datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ")

    def test_output_is_strict_json_no_browser_will_reject(self):
        # Python's json module writes bare `NaN` and `Infinity` by default. Both are invalid JSON
        # and `JSON.parse` throws on them, which would make the file unopenable.
        text = lens_json({"bad": [float("nan"), float("inf")], "café": "🐍"})
        reloaded = json.loads(text)
        self.assertEqual(reloaded["root"]["entries"][0]["value"]["items"][0]["raw"], "nan")

    def test_it_writes_a_file_and_returns_the_path(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "snap.json")
            self.assertEqual(lens({"a": 1}, path=path), path)

            with open(path, encoding="utf-8") as handle:
                self.assertEqual(json.load(handle)["schemaVersion"], 1)


class TestHexAddress(unittest.TestCase):
    def test_extracts_the_address_from_a_default_repr(self):
        self.assertEqual(hex_address("<Foo object at 0x7f9a2c>"), "0x7f9a2c")

    def test_returns_none_when_there_is_none(self):
        self.assertIsNone(hex_address("Decimal('1.5')"))
        self.assertIsNone(hex_address("<Foo object at 0x>"))


class TestAgainstRealPythonSemantics(unittest.TestCase):
    """Cases where a plausible implementation quietly disagrees with the interpreter."""

    def test_zero_and_empty_containers_are_not_confused_with_absence(self):
        node = node_of({"zero": 0, "empty": [], "blank": "", "false": False, "none": None})
        kinds = {e["key"]["value"]: e["value"]["kind"] for e in node["entries"]}
        self.assertEqual(kinds["empty"], "sequence")
        self.assertEqual(kinds["zero"], "scalar")
        self.assertEqual(kinds["none"], "scalar")

    def test_negative_zero_survives(self):
        self.assertEqual(node_of(-0.0)["raw"], "-0.0")

    def test_math_constants_round_trip_through_json(self):
        text = lens_json(math.pi)
        self.assertEqual(json.loads(text)["root"]["value"], math.pi)


if __name__ == "__main__":
    unittest.main()
