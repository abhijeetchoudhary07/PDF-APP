#!/usr/bin/env python3
"""
Generates every icon and splash raster the Google Play release needs.

The artwork is defined in code rather than checked in as opaque binaries so a
colour or proportion can be changed in one place and every density regenerated.
Run it from the project root:

    python3 tools/generate-app-assets.py

Requires Pillow (`python3 -m pip install Pillow`).

What it writes
--------------
  resources/                      @capacitor/assets sources (icon + splash)
  resources/android/res/          drop-in mipmap/drawable tree for android/app/src/main/res
  resources/play-store/           512x512 listing icon and 1024x500 feature graphic
  src/assets/icon/                web/PWA icons used by index.html

The mark is a document sheet with a folded corner and a signed baseline -- the
two things the app actually does to a file -- over the brand indigo.
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- Brand palette (mirrors src/theme/variables.scss) -----------------------
INDIGO = (99, 102, 241)        # --color-primary
INDIGO_DEEP = (67, 56, 202)    # gradient end
INK = (30, 41, 59)             # slate-800
PAPER = (255, 255, 255)
RULE = (203, 213, 225)         # slate-300
AMBER = (245, 158, 11)         # --color-warning
DARK_BG = (15, 23, 42)         # slate-900

SS = 4  # supersample factor; every shape is drawn this many times larger


# --------------------------------------------------------------------------
# Drawing primitives
# --------------------------------------------------------------------------
def linear_gradient(size, top, bottom):
    """Vertical gradient with a slight diagonal lift, as one RGB image."""
    w = h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(0, w, max(1, w // 256)):
            pass
    # Row-wise fill is enough: the diagonal comes from the overlay below.
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        draw.line(
            [(0, y), (w, y)],
            fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return img


def radial_glow(size, centre, radius, colour, max_alpha):
    """A soft highlight, returned as an RGBA layer to composite."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = layer.load()
    cx, cy = centre
    r2 = radius * radius
    for y in range(size):
        dy2 = (y - cy) ** 2
        if dy2 > r2:
            continue
        for x in range(size):
            d2 = (x - cx) ** 2 + dy2
            if d2 > r2:
                continue
            falloff = 1.0 - math.sqrt(d2) / radius
            px[x, y] = (*colour, int(max_alpha * falloff * falloff))
    return layer


def bezier(points, steps=180):
    """Cubic Bezier as a polyline, for the signature stroke."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = points
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        out.append((
            u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ))
    return out


def thick_curve(draw, points, width, fill):
    """
    A smooth stroke along `points`.

    PIL's line(joint="curve") stamps an ellipse at every vertex, and because
    nothing in ImageDraw is antialiased those stamps leave hairline seams that
    survive the downscale as visible striping. Offsetting the path by half the
    width and filling the result as one polygon gives a single clean shape.
    """
    half = width / 2.0
    left, right = [], []
    for i, (x, y) in enumerate(points):
        px, py = points[max(0, i - 1)]
        nx, ny = points[min(len(points) - 1, i + 1)]
        dx, dy = nx - px, ny - py
        length = math.hypot(dx, dy) or 1.0
        ox, oy = -dy / length * half, dx / length * half
        left.append((x + ox, y + oy))
        right.append((x - ox, y - oy))
    draw.polygon(left + right[::-1], fill=fill)
    # Round caps, so the stroke starts and ends like a pen lifting.
    for x, y in (points[0], points[-1]):
        draw.ellipse([x - half, y - half, x + half, y + half], fill=fill)


def draw_mark(draw, cx, cy, span, ink=INDIGO, paper=PAPER, rule=RULE, stamp=AMBER):
    """
    Draws the document mark centred on (cx, cy), `span` wide overall.

    Coordinates are fractions of `span`, so the same routine serves a 48px
    launcher icon and a 2732px splash.
    """
    u = span  # shorthand: every measurement below is a fraction of the span

    sheet_w = 0.72 * u
    sheet_h = 0.92 * u
    left = cx - sheet_w / 2
    top = cy - sheet_h / 2
    right = left + sheet_w
    bottom = top + sheet_h
    fold = 0.26 * sheet_w          # size of the turned-down corner
    radius = 0.09 * sheet_w

    # Soft drop shadow so the sheet reads against the indigo behind it.
    draw.rounded_rectangle(
        [left + 0.02 * u, top + 0.035 * u, right + 0.02 * u, bottom + 0.035 * u],
        radius=radius,
        fill=(15, 23, 42, 60),
    )

    # Sheet body: a rounded rect with the top-right corner cut away.
    draw.rounded_rectangle([left, top, right, bottom], radius=radius, fill=paper)
    # Clear everything above and right of the fold's diagonal. The box runs well
    # past the sheet so the drop shadow's own corner goes with it -- clipping
    # only to `right` left a dark sliver standing beside the fold.
    over = 0.12 * u
    draw.polygon(
        [(right - fold, top),
         (right - fold, top - over),
         (right + over, top - over),
         (right + over, top + fold),
         (right, top + fold)],
        fill=(0, 0, 0, 0),
    )
    # Re-draw the clipped corner as the fold itself.
    draw.polygon(
        [(right - fold, top), (right, top + fold), (right - fold, top + fold)],
        fill=rule,
    )
    draw.line(
        [(right - fold, top), (right - fold, top + fold), (right, top + fold)],
        fill=rule,
        width=max(1, int(0.012 * u)),
        joint="curve",
    )

    # Two ruled lines: this is a document, not a card.
    rule_w = max(1, int(0.028 * u))
    rule_x0 = left + 0.13 * sheet_w
    draw.line([(rule_x0, top + 0.30 * sheet_h), (right - 0.13 * sheet_w, top + 0.30 * sheet_h)],
              fill=rule, width=rule_w)
    draw.line([(rule_x0, top + 0.42 * sheet_h), (left + 0.66 * sheet_w, top + 0.42 * sheet_h)],
              fill=rule, width=rule_w)

    # The signature: one continuous stroke with a flick at the end.
    stroke_w = max(2, int(0.045 * u))
    sig_y = top + 0.66 * sheet_h
    curve = bezier([
        (rule_x0, sig_y + 0.06 * sheet_h),
        (left + 0.30 * sheet_w, sig_y - 0.16 * sheet_h),
        (left + 0.46 * sheet_w, sig_y + 0.14 * sheet_h),
        (left + 0.70 * sheet_w, sig_y - 0.06 * sheet_h),
    ])
    curve += bezier([
        (left + 0.70 * sheet_w, sig_y - 0.06 * sheet_h),
        (left + 0.80 * sheet_w, sig_y - 0.01 * sheet_h),
        (left + 0.80 * sheet_w, sig_y - 0.09 * sheet_h),
        (right - 0.11 * sheet_w, sig_y - 0.12 * sheet_h),
    ])
    thick_curve(draw, curve, stroke_w, ink)

    # Signature baseline.
    draw.line(
        [(rule_x0, top + 0.80 * sheet_h), (right - 0.13 * sheet_w, top + 0.80 * sheet_h)],
        fill=rule,
        width=rule_w,
    )

    # Verified stamp, clipped to the lower-right of the sheet.
    sr = 0.20 * u
    scx = right - 0.06 * u
    scy = bottom - 0.10 * u
    draw.ellipse([scx - sr, scy - sr, scx + sr, scy + sr], fill=paper)
    draw.ellipse([scx - sr * 0.86, scy - sr * 0.86, scx + sr * 0.86, scy + sr * 0.86], fill=stamp)
    tick = max(2, int(0.038 * u))
    thick_curve(
        draw,
        [(scx - sr * 0.40, scy + sr * 0.02),
         (scx - sr * 0.10, scy + sr * 0.34),
         (scx + sr * 0.44, scy - sr * 0.34)],
        tick,
        paper,
    )


def brand_background(size):
    """Full-bleed gradient square used by the store icon and the icon background."""
    base = linear_gradient(size, INDIGO, INDIGO_DEEP).convert("RGBA")
    glow = radial_glow(size, (size * 0.26, size * 0.20), size * 0.78, (255, 255, 255), 66)
    return Image.alpha_composite(base, glow)


def render_icon(size, with_background=True, mark_span_ratio=0.62):
    """One square icon at `size` px. `mark_span_ratio` is the mark's share of it."""
    big = size * SS
    if with_background:
        canvas = brand_background(big)
    else:
        canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))

    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw_mark(draw, big / 2, big / 2, big * mark_span_ratio)
    canvas = Image.alpha_composite(canvas, layer)
    return canvas.resize((size, size), Image.LANCZOS)


def render_splash(width, height, dark=False):
    """
    Centred mark on the brand ground, safe for CENTER_CROP at any aspect.

    The mark is rendered on its own supersampled tile and then pasted, because
    supersampling a 2732x2732 canvas outright is a hundred megapixels of work
    for shapes that only occupy a fifth of it. The light variant sits on the
    brand indigo rather than white -- a white sheet on a white ground is
    invisible, and the indigo matches the SplashScreen backgroundColor set in
    capacitor.config.ts so there is no colour step when the image appears.
    """
    if dark:
        canvas = Image.new("RGBA", (width, height), (*DARK_BG, 255))
    else:
        grad = linear_gradient(max(width, height), INDIGO, INDIGO_DEEP).convert("RGBA")
        canvas = grad.crop((0, 0, width, height))

    span = min(width, height) * 0.22
    tile = max(8, int(span * 1.7))
    big = tile * SS
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw_mark(
        draw,
        big / 2,
        big / 2,
        span * SS,
        ink=INDIGO,
        paper=PAPER,
        rule=RULE,
        stamp=AMBER,
    )
    mark = layer.resize((tile, tile), Image.LANCZOS)
    canvas.alpha_composite(mark, ((width - tile) // 2, (height - tile) // 2))
    return canvas


def load_font(size, bold=True):
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit_font(text, max_width, start_size, bold=True):
    """Largest size at which `text` still fits `max_width`."""
    size = start_size
    while size > 10:
        font = load_font(size, bold=bold)
        if font.getbbox(text)[2] <= max_width:
            return font
        size -= 2
    return load_font(10, bold=bold)


def render_feature_graphic(width=1024, height=500):
    """
    Play's required 1024x500 listing banner.

    Play crops the edges on some surfaces, so the whole lockup is centred and
    the type is measured against the space it actually has rather than set at a
    fixed size -- the title overflowed the canvas when it was hard-coded.
    """
    base = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(base)
    for y in range(height):
        t = y / (height - 1)
        draw.line([(0, y), (width, y)],
                  fill=tuple(round(INDIGO[i] + (INDIGO_DEEP[i] - INDIGO[i]) * t) for i in range(3)) + (255,))

    glow = radial_glow(max(width, height), (width * 0.18, height * 0.1), width * 0.7, (255, 255, 255), 50)
    base = Image.alpha_composite(base, glow.crop((0, 0, width, height)))

    title_text = "Indian Form Helper"
    sub_text = "Photo, signature & PDF tools — 100% offline"

    mark_px = 244
    gap = 36
    # Reserve a generous margin: the type is sized to whatever is left.
    text_max = width - mark_px - gap - 2 * 72
    title_font = fit_font(title_text, text_max, 72, bold=True)
    sub_font = fit_font(sub_text, text_max, 30, bold=False)

    title_w = title_font.getbbox(title_text)[2]
    sub_w = sub_font.getbbox(sub_text)[2]
    block_w = mark_px + gap + max(title_w, sub_w)
    x0 = (width - block_w) // 2

    mark = render_icon(mark_px, with_background=False, mark_span_ratio=0.88)
    base.alpha_composite(mark, (x0, (height - mark_px) // 2))

    draw = ImageDraw.Draw(base)
    text_x = x0 + mark_px + gap
    title_h = title_font.getbbox(title_text)[3]
    sub_h = sub_font.getbbox(sub_text)[3]
    total_h = title_h + 22 + sub_h
    y = (height - total_h) // 2
    draw.text((text_x, y), title_text, font=title_font, fill=(255, 255, 255, 255))
    draw.text((text_x, y + title_h + 22), sub_text, font=sub_font, fill=(226, 232, 240, 255))
    return base


# --------------------------------------------------------------------------
# Output plan
# --------------------------------------------------------------------------
# Android launcher icon densities (legacy square/round, 48dp base).
LEGACY_MIPMAP = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
# Adaptive icon layers are 108dp; the safe zone is the central 66dp.
ADAPTIVE_MIPMAP = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
# Splash drawables, portrait and landscape, per density.
SPLASH_DRAWABLE = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}
# Icons index.html and a PWA manifest reference.
WEB_ICONS = {"favicon.png": 64, "icon-192.png": 192, "icon-512.png": 512,
             "apple-touch-icon.png": 180}


def out(*parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def save(img, path):
    img.save(path, "PNG", optimize=True)
    print(f"  {os.path.relpath(path, ROOT)}  ({img.width}x{img.height})")


def main():
    print("@capacitor/assets sources")
    save(render_icon(1024), out("resources", "icon-only.png"))
    # The adaptive foreground keeps the mark inside the 66/108 safe circle.
    save(render_icon(1024, with_background=False, mark_span_ratio=0.40),
         out("resources", "icon-foreground.png"))
    save(brand_background(1024).resize((1024, 1024), Image.LANCZOS),
         out("resources", "icon-background.png"))
    save(render_splash(2732, 2732), out("resources", "splash.png"))
    save(render_splash(2732, 2732, dark=True), out("resources", "splash-dark.png"))

    print("Play Store listing")
    # 512x512, 32-bit with alpha, square: Google applies its own mask.
    save(render_icon(512), out("resources", "play-store", "play-store-icon-512.png"))
    save(render_feature_graphic(), out("resources", "play-store", "feature-graphic-1024x500.png"))

    print("Android res tree (copy into android/app/src/main/res/)")
    for density, px in LEGACY_MIPMAP.items():
        icon = render_icon(px)
        save(icon, out("resources", "android", "res", f"mipmap-{density}", "ic_launcher.png"))
        # The round variant is the same art; the launcher masks it itself.
        save(icon, out("resources", "android", "res", f"mipmap-{density}", "ic_launcher_round.png"))
    for density, px in ADAPTIVE_MIPMAP.items():
        save(render_icon(px, with_background=False, mark_span_ratio=0.40),
             out("resources", "android", "res", f"mipmap-{density}", "ic_launcher_foreground.png"))
        save(brand_background(px * SS).resize((px, px), Image.LANCZOS),
             out("resources", "android", "res", f"mipmap-{density}", "ic_launcher_background.png"))
    for folder, (w, h) in SPLASH_DRAWABLE.items():
        save(render_splash(w, h), out("resources", "android", "res", folder, "splash.png"))
        save(render_splash(w, h, dark=True),
             out("resources", "android", "res", f"{folder}-night" if folder != "drawable" else "drawable-night",
                 "splash.png"))

    print("Web / PWA icons")
    for name, px in WEB_ICONS.items():
        save(render_icon(px), out("src", "assets", "icon", name))

    print("\nDone.")


if __name__ == "__main__":
    main()
