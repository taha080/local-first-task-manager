#!/usr/bin/env python3
"""Regenerate the PWA icons in public/icons. The PNGs are committed."""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
GREEN = (31, 77, 58)
CREAM = (244, 239, 228)


def dist_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    length_sq = vx * vx + vy * vy
    if length_sq == 0:
        t = 0.0
    else:
        t = max(0.0, min(1.0, (wx * vx + wy * vy) / length_sq))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return (dx * dx + dy * dy) ** 0.5


def inside_rounded_rect(u: float, v: float, radius: float) -> bool:
    half = 0.5 - radius
    dx = abs(u - 0.5) - half
    dy = abs(v - 0.5) - half
    outside = (max(dx, 0.0) ** 2 + max(dy, 0.0) ** 2) ** 0.5
    inside = min(max(dx, dy), 0.0)
    return outside + inside <= radius


def on_check(u: float, v: float) -> bool:
    stroke = 0.055
    first = dist_segment(u, v, 0.30, 0.53, 0.45, 0.68)
    second = dist_segment(u, v, 0.45, 0.68, 0.72, 0.34)
    return min(first, second) <= stroke


def sample(x: int, y: int, size: int, maskable: bool) -> tuple[int, int, int, int]:
    green_hits = 0
    cream_hits = 0
    samples = 4
    for sy in range(samples):
        for sx in range(samples):
            u = (x + (sx + 0.5) / samples) / size
            v = (y + (sy + 0.5) / samples) / size
            if maskable or inside_rounded_rect(u, v, 0.2):
                if on_check(u, v):
                    cream_hits += 1
                else:
                    green_hits += 1
    total = samples * samples
    hits = green_hits + cream_hits
    if hits == 0:
        return (0, 0, 0, 0)
    cream_ratio = cream_hits / hits
    red = int(CREAM[0] * cream_ratio + GREEN[0] * (1 - cream_ratio))
    green = int(CREAM[1] * cream_ratio + GREEN[1] * (1 - cream_ratio))
    blue = int(CREAM[2] * cream_ratio + GREEN[2] * (1 - cream_ratio))
    alpha = 255 if maskable else int(round(255 * hits / total))
    return (red, green, blue, alpha)


def write_png(path: Path, size: int, maskable: bool) -> None:
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            rows.extend(sample(x, y, size, maskable))

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / "icon-192.png", 192, False)
    write_png(OUT / "icon-512.png", 512, False)
    write_png(OUT / "icon-maskable-512.png", 512, True)
    print(f"Wrote icons to {OUT}")


if __name__ == "__main__":
    main()
