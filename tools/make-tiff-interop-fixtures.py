#!/usr/bin/env python3
"""
Regenerates src/app/core/testing/tiff-interop-fixtures.ts.

The point of these fixtures is that they are NOT written by this app. They come
out of Pillow, i.e. libtiff, which is what the scanners and government portals
on the other end of a TIFF use. Decoding them is the only check that proves our
reader handles real files rather than only the ones we wrote ourselves.

Needs Pillow:  python3 -m pip install pillow
Run from the repo root:  python3 tools/make-tiff-interop-fixtures.py
"""
import base64
import io
import os
import textwrap

from PIL import Image

WIDTH, HEIGHT = 48, 32


def rgb_pattern(x: int, y: int):
    """Deterministic, and mirrored exactly in the TypeScript spec."""
    return ((x * 7) % 256, (y * 11) % 256, ((x + y) * 5) % 256)


def is_black(x: int, y: int) -> bool:
    return y % 7 == 0 or x % 11 == 0


def rgb_image() -> Image.Image:
    im = Image.new("RGB", (WIDTH, HEIGHT))
    im.putdata([rgb_pattern(x, y) for y in range(HEIGHT) for x in range(WIDTH)])
    return im


def bilevel_image() -> Image.Image:
    im = Image.new("1", (WIDTH, HEIGHT))
    im.putdata([0 if is_black(x, y) else 1 for y in range(HEIGHT) for x in range(WIDTH)])
    return im


def encode(im: Image.Image, **save_kwargs) -> str:
    buf = io.BytesIO()
    im.save(buf, format="TIFF", **save_kwargs)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def main() -> None:
    rgb = rgb_image()
    bw = bilevel_image()

    fixtures = {
        "lzw": encode(rgb, compression="tiff_lzw", dpi=(200, 200)),
        "lzwPredictor": encode(rgb, compression="tiff_lzw", tiffinfo={317: 2}),
        "lzwMultiStrip": encode(rgb, compression="tiff_lzw", tiffinfo={278: 4}),
        "packBits": encode(rgb, compression="packbits"),
        "deflate": encode(rgb, compression="tiff_adobe_deflate"),
        "uncompressedBigEndian": base64.b64encode(
            _as_big_endian(rgb)
        ).decode("ascii"),
        "group4": encode(bw, compression="group4", dpi=(200, 200)),
        "group3": encode(bw, compression="group3"),
    }

    lines = [
        "/**",
        " * TIFFs written by libtiff (via Pillow), not by this app.",
        " *",
        " * They are here so the decoder is tested against files from the outside:",
        " * multiple strips, a horizontal predictor, PackBits, Deflate, CCITT G3 and",
        " * G4, and a big-endian file. Regenerate with",
        " * `python3 tools/make-tiff-interop-fixtures.py` — do not hand-edit.",
        " */",
        f"export const FIXTURE_WIDTH = {WIDTH};",
        f"export const FIXTURE_HEIGHT = {HEIGHT};",
        "",
        "/** Mirrors rgb_pattern() in the generator. */",
        "export function fixtureRgb(x: number, y: number): [number, number, number] {",
        "  return [(x * 7) % 256, (y * 11) % 256, ((x + y) * 5) % 256];",
        "}",
        "",
        "/** Mirrors is_black() in the generator. */",
        "export function fixtureIsBlack(x: number, y: number): boolean {",
        "  return y % 7 === 0 || x % 11 === 0;",
        "}",
        "",
        "export const TIFF_FIXTURES: Record<string, string> = {",
    ]
    for name, b64 in fixtures.items():
        wrapped = textwrap.wrap(b64, 96)
        lines.append(f"  {name}:")
        for i, chunk in enumerate(wrapped):
            suffix = " +" if i < len(wrapped) - 1 else ","
            lines.append(f"    '{chunk}'{suffix}")
    lines.append("};")
    lines.append("")

    out = os.path.join("src", "app", "core", "testing", "tiff-interop-fixtures.ts")
    with open(out, "w") as handle:
        handle.write("\n".join(lines))
    total = sum(len(v) for v in fixtures.values())
    print(f"wrote {out} ({len(fixtures)} fixtures, {total} base64 chars)")


def _as_big_endian(im: Image.Image) -> bytes:
    """Pillow writes little-endian; flip to MM so the decoder's other path is covered."""
    buf = io.BytesIO()
    im.save(buf, format="TIFF", compression="raw")
    data = bytearray(buf.getvalue())
    import struct

    assert data[0:2] == b"II", "expected a little-endian source"

    def u16(off):
        return struct.unpack_from("<H", data, off)[0]

    def u32(off):
        return struct.unpack_from("<I", data, off)[0]

    type_sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}

    out = bytearray(data)

    def put16(off, value):
        struct.pack_into(">H", out, off, value)

    def put32(off, value):
        struct.pack_into(">I", out, off, value)

    out[0:2] = b"MM"
    put16(2, 42)
    first_ifd = u32(4)
    put32(4, first_ifd)

    ifd = first_ifd
    while ifd:
        count = u16(ifd)
        put16(ifd, count)
        entry = ifd + 2
        for _ in range(count):
            tag = u16(entry)
            ftype = u16(entry + 2)
            n = u32(entry + 4)
            size = type_sizes.get(ftype, 1)
            put16(entry, tag)
            put16(entry + 2, ftype)
            put32(entry + 4, n)
            if size * n <= 4:
                # Values live in the field itself: re-pack each one, left-aligned.
                values = [
                    struct.unpack_from("<H" if size == 2 else "<I" if size == 4 else "B", data, entry + 8 + i * size)[0]
                    for i in range(n)
                ] if size in (1, 2, 4) else []
                struct.pack_into("4s", out, entry + 8, b"\0\0\0\0")
                for i, v in enumerate(values):
                    at = entry + 8 + i * size
                    if size == 1:
                        struct.pack_into("B", out, at, v)
                    elif size == 2:
                        put16(at, v)
                    else:
                        put32(at, v)
            else:
                offset = u32(entry + 8)
                put32(entry + 8, offset)
                for i in range(n):
                    at = offset + i * size
                    if size == 2:
                        put16(at, u16(at))
                    elif size == 4:
                        put32(at, u32(at))
                    elif size == 8:
                        put32(at, u32(at))
                        put32(at + 4, u32(at + 4))
            entry += 12
        next_ifd = u32(entry)
        put32(entry, next_ifd)
        ifd = next_ifd

    return bytes(out)


if __name__ == "__main__":
    main()
