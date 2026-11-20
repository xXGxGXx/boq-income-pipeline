#!/usr/bin/env python3
"""Draw the app icons (PNG 192/512, maskable 512, SVG). Usage: make_icons.py OUT_DIR"""
import os, sys
from PIL import Image, ImageDraw

ACCENT, ACCENT2, BG1, BG2 = (103, 208, 247), (139, 108, 255), (20, 30, 48), (8, 12, 20)
S = 1024


def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c1, c2):
    g = Image.new("RGB", (size, size)); px = g.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = lerp(c1, c2, (x + y) / (2 * size - 2))
    return g


def symbol(scale):
    """ring + play triangle on a transparent layer, centred; scale 1.0 = fills ~62% of the canvas"""
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    cx = cy = S / 2; r = S * 0.31 * scale; w = max(8, int(S * 0.034 * scale))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT + (255,), width=w)
    t = r * 0.62; tri = [(cx - t * 0.55, cy - t), (cx - t * 0.55, cy + t), (cx + t * 0.95, cy)]
    mask = Image.new("L", (S, S), 0); ImageDraw.Draw(mask).polygon(tri, fill=255)
    grad = gradient(S, ACCENT, ACCENT2).convert("RGBA"); layer.paste(grad, (0, 0), mask)
    return layer


def make(maskable):
    base = gradient(S, BG1, BG2).convert("RGBA")
    if not maskable:
        m = Image.new("L", (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
        out = Image.new("RGBA", (S, S), (0, 0, 0, 0)); out.paste(base, (0, 0), m); base = out
    base.alpha_composite(symbol(0.8 if maskable else 1.0)); return base


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#141e30"/><stop offset="1" stop-color="#080c14"/></linearGradient><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67d0f7"/><stop offset="1" stop-color="#8b6cff"/></linearGradient></defs><rect width="512" height="512" rx="115" fill="url(#b)"/><circle cx="256" cy="256" r="159" fill="none" stroke="#67d0f7" stroke-width="17"/><path d="M226 186v140l108-70z" fill="url(#a)"/></svg>"""

if __name__ == "__main__":
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    a, m = make(False), make(True)
    a.resize((512, 512), Image.LANCZOS).save(os.path.join(out, "icon-512.png"), optimize=True)
    a.resize((192, 192), Image.LANCZOS).save(os.path.join(out, "icon-192.png"), optimize=True)
    m.resize((512, 512), Image.LANCZOS).save(os.path.join(out, "icon-maskable-512.png"), optimize=True)
    open(os.path.join(out, "icon.svg"), "w").write(SVG)
    print("icons written to", out)
