"""ObjectLens zero-install export — paste this into any Python REPL, no install required.

    >>> lens(my_object)                 # writes objectlens-snapshot.json
    >>> print(lens_json(my_object))     # or get the JSON as a string

Then open the file at https://gokul-kulkarni.github.io/objectlens/ (or your own build).

Why this exists
---------------
`repr()` destroys object identity. Once your object graph is text, `[{'a': 1}, {'a': 1}]` and
`[shared, shared]` are indistinguishable, and a cycle is a bare `...` pointing at nothing. This
walks the live object instead, where `id()` is still available: sharing becomes a real `ref` edge
and a cycle a real back-edge. That is precisely what the graph view is for, and precisely what a
pasted repr can never give it.

`pip install objectlens` is the better experience, but installing anything is a real barrier when
you want to look at *one* object on a machine you do not control. This file has no dependencies
beyond the standard library, runs on Python 3.8+, and is meant to be pasted.

Three rules it will not break
-----------------------------
1. **Never calls a property getter.** Descriptors run arbitrary code with side effects; a viewer
   that triggers them is a debugger that changes the thing being debugged. Only the instance
   `__dict__` and filled slots are read. Skipped properties are reported, not silently dropped.
2. **Never trusts `__repr__`.** Every call is wrapped: a `__repr__` that raises costs one node
   rather than the export, which would otherwise lose the other 3,999 lines.
3. **Never trusts a container either.** Iterating a user `Mapping` or `Sequence` runs user code,
   so that is wrapped too and degrades to an `opaque` node plus a diagnostic.

The output format is documented in `docs/schema.md` §6. Keep the two in step.
"""

from __future__ import annotations

import collections.abc as abc
import datetime
import enum
import functools
import json
import math
import sys

__all__ = ["lens", "lens_json", "to_snapshot"]

# Identifies the *format version*, not a location: nothing fetches this, and it must stay stable
# across deployments or every snapshot ever written stops being recognised. `VIEWER_URL` is the
# address that actually has to resolve, which is why the two are separate strings.
SCHEMA_URL = "https://objectlens.dev/schema/v1"
VIEWER_URL = "https://gokul-kulkarni.github.io/objectlens/"
SCHEMA_VERSION = 1
GENERATOR = "objectlens-snippet/0.1.0"
SOURCE_ID = "python-live"

DEFAULT_PATH = "objectlens-snapshot.json"

# Matches MAX_PARSE_DEPTH on the TypeScript side. The walk is recursive because a pasted snippet
# has to stay readable, and CPython's default limit is 1000 frames — 200 levels leaves ample
# headroom while still being deeper than any object graph a human reads.
MAX_DEPTH = 200
# Per-container window. Beyond this, `totalCount` reports the true size and the viewer shows the
# container as partially loaded rather than pretending it saw everything.
MAX_CHILDREN = 1000
# Whole-snapshot budget, so pointing this at something whose `__getattr__` fabricates attributes
# forever produces a truncated file instead of filling the disk.
MAX_NODES = 100_000

# Values whose identity is not worth tracking. CPython interns small ints and short strings, so
# following `id()` here would report `1` as a "shared reference" between two unrelated lists.
# Enum members are singletons for the same reason and read as atoms, not as shared objects.
_ATOMIC = (str, bytes, bytearray, bool, int, float, complex, enum.Enum, type(None))

_LAZY_DESCRIPTORS = (property, functools.cached_property)


class _Walker:
    def __init__(self, max_depth, max_children, max_nodes):
        self.max_depth = max_depth
        self.max_children = max_children
        self.max_nodes = max_nodes
        # id() -> node id, for everything already emitted. Keyed by id() rather than by the object
        # because the object may be unhashable, and `==` may be overloaded to mean something else
        # entirely — identity is the only question being asked here.
        self.seen = {}
        # The objects on the path from the root to the node being built right now. Membership here
        # is what separates a true cycle from a DAG join; both are `ref`, and conflating them
        # would hide the more interesting one.
        self.path = set()
        # Every visited object is kept alive for the duration of the walk. `seen` holds only their
        # id(), and a garbage-collected object's id() can be handed straight to a new one — which
        # would make two unrelated nodes look shared.
        self.pinned = []
        self.diagnostics = []
        self.nodes = 0
        self.truncated = False
        self.skipped_properties = 0

    # -- entry point ---------------------------------------------------

    def walk(self, obj, node_id, depth):
        self.nodes += 1
        if self.nodes > self.max_nodes or depth > self.max_depth:
            self.truncated = True
            return {
                "id": node_id,
                "kind": "opaque",
                "source": SOURCE_ID,
                "text": "<not walked: limit reached>",
            }

        if isinstance(obj, _ATOMIC):
            return self.atom(obj, node_id)

        key = id(obj)
        if key in self.seen:
            return {
                "id": node_id,
                "kind": "ref",
                "source": SOURCE_ID,
                "target": self.seen[key],
                "cycle": key in self.path,
            }

        self.seen[key] = node_id
        self.pinned.append(obj)
        self.path.add(key)
        try:
            return self.structure(obj, node_id, depth)
        finally:
            self.path.discard(key)

    # -- dispatch ------------------------------------------------------

    def structure(self, obj, node_id, depth):
        if isinstance(obj, abc.Mapping):
            return self.mapping(obj, node_id, depth)

        if isinstance(obj, (set, frozenset, abc.Set)):
            return self.bag(obj, node_id, depth)

        if is_namedtuple(obj):
            # Structurally a tuple, but the whole point of it is that the positions have names.
            return self.record(obj, node_id, depth, dict(zip(obj._fields, obj)))

        if isinstance(obj, abc.Sequence):
            return self.sequence(obj, node_id, depth)

        fields = readable_attributes(obj)
        if fields and not prefers_repr(obj):
            return self.record(obj, node_id, depth, fields)

        # Nothing readable without running code — `datetime`, a C extension type, a plain instance
        # with nothing set — or a type whose own repr says it better. Either way, that repr is the
        # best available account of it.
        return self.opaque(obj, node_id)

    # -- kinds ---------------------------------------------------------

    def atom(self, obj, node_id):
        if isinstance(obj, enum.Enum):
            # `<Color.RED: 1>` is what the author wants you to see; the instance dict underneath
            # is `_name_`/`_value_` bookkeeping.
            return self.opaque(obj, node_id)

        node = {"id": node_id, "kind": "scalar", "source": SOURCE_ID}

        if obj is None:
            node.update(scalarType="null", value=None, raw="None")
        elif isinstance(obj, bool):
            # Before int: `bool` is a subclass of `int`, so this order is load-bearing.
            node.update(scalarType="bool", value=obj, raw=repr(obj))
        elif isinstance(obj, int):
            # `raw` is authoritative. A Python int has no width limit, so `value` is already lossy
            # past 2**53 by the time JSON.parse sees it.
            node.update(scalarType="int", value=obj, raw=repr(obj))
        elif isinstance(obj, float):
            # JSON cannot write inf or nan. `raw` carries them; `value` admits it cannot.
            node.update(scalarType="float", raw=repr(obj))
            node["value"] = None if (math.isinf(obj) or math.isnan(obj)) else obj
        elif isinstance(obj, complex):
            node.update(scalarType="complex", value=repr(obj), raw=repr(obj))
        elif isinstance(obj, (bytes, bytearray)):
            # `backslashreplace` rather than `replace`: a lossy `?` silently corrupts the bytes,
            # whereas `\xff` still says exactly what was there.
            node.update(
                scalarType="bytes",
                value=bytes(obj).decode("utf-8", "backslashreplace"),
                raw=repr(bytes(obj)),
            )
        else:
            node.update(scalarType="string", value=obj)

        return node

    def mapping(self, obj, node_id, depth):
        items = self.collect(lambda: list(obj.items()), obj, node_id)
        if items is None:
            return self.opaque(obj, node_id)

        entries = []
        for index, (key, value) in enumerate(items[: self.max_children]):
            key_node = self.walk(key, "%s@key%d" % (node_id, index), depth + 1)
            literal = key_literal(key)
            # A key with no literal form — `{(1, 2): 'x'}` — leaves its value with no subscript
            # expression either, so that value gets an unaddressable position rather than a path
            # that would not evaluate. See docs/schema.md §4.
            value_id = (
                "%s@value%d" % (node_id, index)
                if literal is None
                else "%s[%s]" % (node_id, literal)
            )
            entries.append({"key": key_node, "value": self.walk(value, value_id, depth + 1)})

        return self.window(
            {
                "id": node_id,
                "kind": "map",
                "source": SOURCE_ID,
                "typeName": type(obj).__name__,
                "entries": entries,
            },
            len(items),
        )

    def sequence(self, obj, node_id, depth):
        items = self.collect(lambda: list(obj), obj, node_id)
        if items is None:
            return self.opaque(obj, node_id)

        return self.window(
            {
                "id": node_id,
                "kind": "sequence",
                "source": SOURCE_ID,
                "typeName": type(obj).__name__,
                "items": [
                    self.walk(item, "%s[%d]" % (node_id, index), depth + 1)
                    for index, item in enumerate(items[: self.max_children])
                ],
            },
            len(items),
        )

    def bag(self, obj, node_id, depth):
        items = self.collect(lambda: list(obj), obj, node_id)
        if items is None:
            return self.opaque(obj, node_id)

        # Sets are unordered, so the index is a position in this rendering, not an accessor —
        # hence the `@item` form, which tells the viewer not to offer "copy path".
        return self.window(
            {
                "id": node_id,
                "kind": "set",
                "source": SOURCE_ID,
                "typeName": type(obj).__name__,
                "items": [
                    self.walk(item, "%s@item%d" % (node_id, index), depth + 1)
                    for index, item in enumerate(items[: self.max_children])
                ],
            },
            len(items),
        )

    def record(self, obj, node_id, depth, fields):
        skipped = property_names(type(obj))
        self.skipped_properties += len(skipped)

        names = list(fields)[: self.max_children]
        node = {
            "id": node_id,
            "kind": "object",
            "source": SOURCE_ID,
            "typeName": type(obj).__name__,
            "fields": [
                {
                    "name": name,
                    "value": self.walk(fields[name], field_id(node_id, name), depth + 1),
                    "category": "data",
                }
                for name in names
            ],
        }
        if skipped:
            # Surfaced rather than dropped: a reader looking for `total` should learn that it
            # exists and why it is not here, not conclude the object does not have one.
            node["meta"] = {"skippedProperties": sorted(skipped)}
        if len(fields) > len(names):
            self.truncated = True
        return node

    def opaque(self, obj, node_id):
        text = safe_repr(obj)
        node = {
            "id": node_id,
            "kind": "opaque",
            "source": SOURCE_ID,
            "typeName": type(obj).__name__,
            "text": text,
        }

        address = hex_address(text)
        if address is not None:
            node["address"] = address

        return node

    # -- helpers -------------------------------------------------------

    def collect(self, materialise, obj, node_id):
        """Materialises a container's children, or None if the container refused."""
        try:
            return materialise()
        except Exception as error:  # noqa: BLE001 — a user container may raise anything
            self.diagnostics.append(
                {
                    "severity": "warning",
                    "message": "Could not read the contents of %s: %s: %s"
                    % (type(obj).__name__, type(error).__name__, error),
                    "nodeId": node_id,
                }
            )
            return None

    def window(self, node, total):
        node["totalCount"] = total
        if total > self.max_children:
            self.truncated = True
            self.diagnostics.append(
                {
                    "severity": "info",
                    "message": "%s has %d children; only the first %d were exported."
                    % (node["id"], total, self.max_children),
                    "nodeId": node["id"],
                }
            )
        return node


def prefers_repr(obj):
    """True when the type's own `__repr__` is a better account of it than its attributes.

    A class that defines `__repr__` and keeps nothing in an instance `__dict__` — `Decimal`,
    `UUID`, `Path`, `IPv4Address` — is telling you its textual form *is* the object. Reading its
    slots instead yields `UUID(int=1, is_safe=SafeUUID.unknown)` where the author offered
    `UUID('00000000-…-0001')`. A class with an instance `__dict__` is ordinary data and keeps its
    fields, dataclasses included, even though they define `__repr__` too.
    """
    if type(getattr(obj, "__dict__", None)) is dict:
        return False
    return getattr(type(obj), "__repr__", None) is not object.__repr__


def is_namedtuple(obj):
    return isinstance(obj, tuple) and hasattr(obj, "_fields") and hasattr(obj, "_asdict")


def readable_attributes(obj):
    """Attributes readable without invoking a single user-defined descriptor.

    `vars()` reads the instance dict directly, and slot values are fetched only where the slot is
    filled — a slot descriptor's `__get__` is the trivial one CPython generates and cannot run
    user code. Nothing here can trigger a `@property` or a `__getattr__`, which is the point.
    """
    attributes = {}

    instance_dict = getattr(obj, "__dict__", None)
    # A class object's `__dict__` is a mappingproxy, not a dict. Excluding it keeps classes on the
    # `opaque` path, where `<class 'Foo'>` is a far better rendering than its 20 dunder members.
    if type(instance_dict) is dict:
        attributes.update(instance_dict)

    for slot in slot_names(type(obj)):
        try:
            attributes[slot] = getattr(obj, slot)
        except AttributeError:
            pass

    return attributes


def slot_names(cls):
    names = []
    for klass in getattr(cls, "__mro__", []):
        declared = klass.__dict__.get("__slots__")
        if declared is None:
            continue
        if isinstance(declared, str):
            declared = [declared]
        names.extend(name for name in declared if name not in ("__dict__", "__weakref__"))
    return names


def property_names(cls):
    """Names of descriptors this snippet deliberately does not evaluate."""
    names = set()
    for klass in getattr(cls, "__mro__", []):
        for name, member in klass.__dict__.items():
            if isinstance(member, _LAZY_DESCRIPTORS):
                names.add(name)
    return names


def key_literal(key):
    """The key's Python literal, or None when it has none — `{(1, 2): 'x'}`, `{frozenset(): 1}`.

    Emitted in Python syntax, so the resulting path pastes straight back into a REPL.
    """
    if key is None or isinstance(key, (bool, int, str, bytes)):
        return repr(key)
    if isinstance(key, float):
        # `$[nan]` would not evaluate, and a path that does not evaluate is worse than none.
        return repr(key) if math.isfinite(key) else None
    return None


def field_id(parent, name):
    return (
        "%s.%s" % (parent, name)
        if name.isidentifier()
        # `setattr(obj, "odd name", 1)` is legal Python, so this is not merely theoretical.
        else "%s@field(%s)" % (parent, name)
    )


def safe_repr(obj):
    """`repr()`, but a raising `__repr__` costs one node rather than the whole export."""
    try:
        return repr(obj)
    except Exception as error:  # noqa: BLE001 — a user __repr__ may raise anything
        return "<repr() raised %s: %s>" % (type(error).__name__, error)


def hex_address(text):
    """The `0x…` out of `<Foo object at 0x7f9a2c>`, or None."""
    marker = " at 0x"
    start = text.find(marker)
    if start < 0:
        return None

    start += len(marker) - 2
    end = start + 2
    while end < len(text) and text[end] in "0123456789abcdefABCDEF":
        end += 1

    return text[start:end] if end > start + 2 else None


def to_snapshot(obj, max_depth=MAX_DEPTH, max_children=MAX_CHILDREN, max_nodes=MAX_NODES):
    """Walks `obj` and returns the snapshot as a plain dict. See docs/schema.md §6."""
    walker = _Walker(max_depth, max_children, max_nodes)
    root = walker.walk(obj, "$", 0)

    diagnostics = list(walker.diagnostics)
    if walker.skipped_properties:
        diagnostics.append(
            {
                "severity": "info",
                "message": "%d propert%s not evaluated: property getters run arbitrary code, so "
                "this snippet never calls them."
                % (
                    walker.skipped_properties,
                    "y was" if walker.skipped_properties == 1 else "ies were",
                ),
            }
        )
    if walker.truncated:
        diagnostics.append(
            {
                "severity": "warning",
                "message": "The walk hit a size limit, so parts of this object are missing.",
            }
        )

    return {
        "$schema": SCHEMA_URL,
        "schemaVersion": SCHEMA_VERSION,
        "source": SOURCE_ID,
        "generator": GENERATOR,
        "createdAt": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "pythonVersion": sys.version.split()[0],
        "root": root,
        "diagnostics": diagnostics,
        "truncated": walker.truncated,
    }


def lens_json(obj, indent=None, **limits):
    """The snapshot as a JSON string.

    `allow_nan=False` on purpose: Python's json module would otherwise write a bare `NaN`, which
    is not JSON and which every browser refuses. Every value that cannot be written has already
    been moved into `raw`, so this raising means the walker has a bug worth hearing about.
    """
    return json.dumps(
        to_snapshot(obj, **limits), indent=indent, ensure_ascii=False, allow_nan=False
    )


def lens(obj, path=DEFAULT_PATH, **limits):
    """Writes the snapshot beside you and returns the path, then says where to open it."""
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(lens_json(obj, indent=2, **limits))
    print("ObjectLens snapshot written to %s — open it at %s" % (path, VIEWER_URL))
    return path
