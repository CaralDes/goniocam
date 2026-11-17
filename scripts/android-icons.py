"""Génère les icônes et écrans de démarrage Android (projet Capacitor) à partir du pictogramme GonioCam.
Usage : python3 scripts/android-icons.py  (depuis la racine du projet, après « npx cap add android »)."""
import glob
import math
from PIL import Image, ImageDraw

BG = (15, 23, 42, 255)
RES = 'android/app/src/main/res'


def glyph(size, scale=1.0, bg=True):
    im = Image.new('RGBA', (size, size), BG if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = size * scale
    off = (size - s) / 2
    cx, cy = off + s * 0.30, off + s * 0.68
    r = s * 0.42
    w = max(2, int(s * 0.06))
    d.pieslice([cx - r, cy - r, cx + r, cy + r], -60, 0, fill=(34, 197, 94, 90))
    d.arc([cx - r, cy - r, cx + r, cy + r], -60, 0, fill=(34, 197, 94, 255), width=max(2, int(s * 0.035)))
    d.line([cx, cy, cx + r * 1.25, cy], fill=(255, 255, 255, 255), width=w)
    a = math.radians(-60)
    d.line([cx, cy, cx + r * 1.25 * math.cos(a), cy + r * 1.25 * math.sin(a)], fill=(34, 197, 94, 255), width=w)
    d.ellipse([cx - w * 1.2, cy - w * 1.2, cx + w * 1.2, cy + w * 1.2], fill=(255, 255, 255, 255))
    return im


for dpi, n in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    base = f'{RES}/mipmap-{dpi}/'
    glyph(n, 0.85).save(base + 'ic_launcher.png')
    im = glyph(n, 0.8)
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, n - 1, n - 1], fill=255)
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    out.save(base + 'ic_launcher_round.png')
    glyph(int(n * 108 / 48), 0.5, bg=False).save(base + 'ic_launcher_foreground.png')

for f in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(f).size
    im = Image.new('RGBA', (w, h), BG)
    g = glyph(int(min(w, h) * 0.35))
    im.paste(g, ((w - g.size[0]) // 2, (h - g.size[1]) // 2))
    im.convert('RGB').save(f)

with open(f'{RES}/values/ic_launcher_background.xml', 'w') as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F172A</color>\n</resources>\n')
print('Icônes Android générées')
