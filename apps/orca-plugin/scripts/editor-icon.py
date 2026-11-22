"""Renders assets/editor-icon.png, the icon Orca shows on the tab of a file ObjectLens opens.

The same lens as the plugin icon, without the tile: on a tab it sits beside other file-type glyphs,
and a filled square reads heavier than they do. Brand orange on transparent clears 3:1 against both
Orca themes. Standard library only, so it runs anywhere: `python3 apps/orca-plugin/scripts/editor-icon.py`.
"""

import math
import struct
import zlib
from pathlib import Path

SIZE = 256
SAMPLES = 4  # per axis, for anti-aliasing
COLOUR = (0xF4, 0x50, 0x1E)
# Geometry in a 32-unit box, matching apps/web/public/favicon.svg with the lens scaled to fill it.
SCALE = SIZE / 32
CENTRE, RADIUS, STROKE = (13.0, 13.0), 8.5, 3.6
HANDLE = ((19.4, 19.4), (27.5, 27.5))


def segment_distance(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)


def covered(x, y):
    ring = abs(math.hypot(x - CENTRE[0], y - CENTRE[1]) - RADIUS) <= STROKE / 2
    return ring or segment_distance((x, y), *HANDLE) <= STROKE / 2


def render():
    rows = []
    for py in range(SIZE):
        row = bytearray([0])  # filter: none
        for px in range(SIZE):
            hits = sum(
                covered((px + (sx + 0.5) / SAMPLES) / SCALE, (py + (sy + 0.5) / SAMPLES) / SCALE)
                for sy in range(SAMPLES)
                for sx in range(SAMPLES)
            )
            row += bytes((*COLOUR, round(255 * hits / SAMPLES**2)))
        rows.append(bytes(row))
    return b"".join(rows)


def png(raw):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "assets" / "editor-icon.png"
    out.write_bytes(png(render()))
    print(f"wrote {out}")
