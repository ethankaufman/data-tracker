"""Draw the app icons (a rising line on an indigo tile) with only the standard library.

Run:  python tools/make_icons.py     -> writes icons/icon-192.png, icon-512.png, icon-maskable-512.png
(icons/icon.svg is the same picture as vector art and is written by hand.)
"""

import math
import struct
import zlib
from pathlib import Path

BACKGROUND = (42, 27, 94)  # indigo, the same as the site header
LINE = (255, 255, 255)
DOT = (94, 224, 168)
POINTS = [(0.22, 0.68), (0.40, 0.50), (0.53, 0.60), (0.78, 0.31)]  # the rising line, 0..1
LINE_WIDTH = 0.075
DOT_RADIUS = 0.07
SAMPLES = 3  # 3 x 3 samples per pixel, for smooth edges


def distance_to_segment(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def inside_rounded_square(x, y, radius):
    cx = min(max(x, radius), 1 - radius)
    cy = min(max(y, radius), 1 - radius)
    return math.hypot(x - cx, y - cy) <= radius


def pixel(x, y, rounded, scale):
    """Colour and opacity at one point (x, y in 0..1). scale shrinks the picture for maskable icons."""
    if rounded and not inside_rounded_square(x, y, 0.2):
        return None
    u = 0.5 + (x - 0.5) / scale
    v = 0.5 + (y - 0.5) / scale
    if math.hypot(u - POINTS[-1][0], v - POINTS[-1][1]) <= DOT_RADIUS:
        return DOT
    for a, b in zip(POINTS, POINTS[1:]):
        if distance_to_segment(u, v, a, b) <= LINE_WIDTH / 2:
            return LINE
    return BACKGROUND


def render(size, rounded, scale):
    rows = []
    for j in range(size):
        row = bytearray([0])  # PNG filter type 0
        for i in range(size):
            r = g = b = a = 0
            for sj in range(SAMPLES):
                for si in range(SAMPLES):
                    colour = pixel((i + (si + 0.5) / SAMPLES) / size, (j + (sj + 0.5) / SAMPLES) / size, rounded, scale)
                    if colour:
                        r, g, b, a = r + colour[0], g + colour[1], b + colour[2], a + 1
            n = SAMPLES * SAMPLES
            row += bytes([r // a, g // a, b // a, round(255 * a / n)] if a else [0, 0, 0, 0])
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


def main():
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for name, size, rounded, scale in [
        ("icon-192.png", 192, True, 1.0),
        ("icon-512.png", 512, True, 1.0),
        ("icon-maskable-512.png", 512, False, 0.72),  # full-bleed tile, picture kept inside the safe zone
    ]:
        write_png(out / name, size, render(size, rounded, scale))
        print("wrote", out / name)


if __name__ == "__main__":
    main()
