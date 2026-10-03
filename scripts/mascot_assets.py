"""Rasterise the artist's SVG masters into every raster the brand ships.

Run from the repo root: python3 scripts/mascot_assets.py <dir holding 1.svg..4.svg>
Writes the pose sprites, the mark (client/public/mark.png and the header's sprout-mark.webp),
the favicons and app icons, and brand.json's markDataUri for the server and opengraph-service
templates. Needs ImageMagick (with librsvg) on PATH. Everything here is derived.
"""
import base64
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SRC = Path(sys.argv[1])
PUBLIC = "client/public"
OUT = f"{PUBLIC}/mascot"
BRAND_JSON = "brand.json"
POSES = {"idle": "1.svg", "greeting": "2.svg", "empty-handed": "3.svg", "sprout": "4.svg"}
RASTER_DENSITY = 192
SOLID = 128
SIZE = 640
MARK_SIZE = 256
MASTER_SIZE = 512
INLINE_MARK_SIZE = 96
BULB_FRINGE = 5
PLATE = (255, 255, 255)
APPLE_TOUCH_SCALE = 0.78
MASKABLE_SCALE = 0.62


def rasterise(svg):
    png = subprocess.run(
        ["magick", "-background", "none", "-density", str(RASTER_DENSITY), str(svg), "png:-"],
        check=True,
        capture_output=True,
    ).stdout
    return Image.open(io.BytesIO(png)).convert("RGBA")


def largest_part_mask(alpha):
    """The biggest connected piece, i.e. the character without its companion."""
    mask = alpha.point(lambda v: 255 if v > SOLID else 0)
    best, best_area = None, 0
    while (bb := mask.getbbox()) is not None:
        seed = next(
            (x, y) for y in range(bb[1], bb[3]) for x in range(bb[0], bb[2]) if mask.getpixel((x, y)) == 255
        )
        ImageDraw.floodfill(mask, seed, SOLID)
        part = mask.point(lambda v: 255 if v == SOLID else 0)
        area = sum(part.histogram()[255:])
        if area > best_area:
            best, best_area = part, area
        mask = mask.point(lambda v: 0 if v == SOLID else v)
    return best


def bare_bulb(art):
    """The bulb alone, without the motion ticks around it."""
    keep = largest_part_mask(art.getchannel("A")).filter(ImageFilter.MaxFilter(BULB_FRINGE))
    bulb = art.copy()
    bulb.putalpha(ImageChops.darker(art.getchannel("A"), keep))
    return bulb


def square(img, size, bottom):
    """Square canvas centred on the character, wide enough to keep everything else in frame."""
    alpha = img.getchannel("A")
    bb = alpha.getbbox()
    body = largest_part_mask(alpha).getbbox()
    centre = (body[0] + body[2]) / 2
    half_w = max(centre - bb[0], bb[2] - centre)
    s = round(max(2 * half_w, bb[3] - bb[1]))
    c = Image.new("RGBA", (s, s), (255, 255, 255, 0))
    a = img.crop(bb)
    y = s - a.height if bottom else (s - a.height) // 2
    c.paste(a, (round(s / 2 - (centre - bb[0])), y))
    return c.resize((size, size), Image.LANCZOS)


def on_plate(mark, size, scale):
    """iOS blacks out transparency and Android masks to a circle, so these icons get a paper plate."""
    plate = Image.new("RGBA", (size, size), PLATE + (255,))
    inner = round(size * scale)
    offset = (size - inner) // 2
    plate.alpha_composite(mark.resize((inner, inner), Image.LANCZOS), (offset, offset))
    return plate.convert("RGB")


def write_brand_rasters(mark):
    mark.save(f"{PUBLIC}/mark.png", optimize=True)
    mark.resize((MARK_SIZE, MARK_SIZE), Image.LANCZOS).save(f"{OUT}/sprout-mark.webp", quality=90, method=6)
    for px in (16, 32):
        mark.resize((px, px), Image.LANCZOS).save(f"{PUBLIC}/favicon-{px}x{px}.png", optimize=True)
    mark.save(f"{PUBLIC}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    on_plate(mark, 180, APPLE_TOUCH_SCALE).save(f"{PUBLIC}/apple-touch-icon.png", optimize=True)
    for px in (192, 512):
        on_plate(mark, px, MASKABLE_SCALE).save(f"{PUBLIC}/android-chrome-{px}x{px}.png", optimize=True)


def write_inline_mark(mark):
    buf = io.BytesIO()
    mark.resize((INLINE_MARK_SIZE, INLINE_MARK_SIZE), Image.LANCZOS).save(buf, "WEBP", quality=85, method=6)
    with open(BRAND_JSON) as f:
        brand = json.load(f)
    brand["markDataUri"] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    with open(BRAND_JSON, "w") as f:
        json.dump(brand, f, indent=2)
        f.write("\n")


Path(OUT).mkdir(parents=True, exist_ok=True)
for name, svg in POSES.items():
    art = rasterise(SRC / svg)
    bottom = name != "sprout"
    square(art, SIZE, bottom).save(f"{OUT}/{name}.webp", quality=90, method=6)
    if name == "sprout":
        mark = square(bare_bulb(art), MASTER_SIZE, bottom)
        write_brand_rasters(mark)
        write_inline_mark(mark)
    print(name, "ok")
