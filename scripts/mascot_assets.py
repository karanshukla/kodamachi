"""Cut the coloured mascot sheet into every raster the brand ships.

Run from the repo root: python3 scripts/mascot_assets.py <sheet>
Writes the pose sprites, the mark (client/public/mark.png and the header's sprout-mark.webp),
the favicons and app icons, and brand.json's markDataUri for the server and opengraph-service
templates. Rerun it on the lossless master when it arrives; everything here is derived.
"""
import base64
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

SRC = sys.argv[1] if len(sys.argv) > 1 else "Kodamachi Coloured version.jpeg"
PUBLIC = "client/public"
OUT = f"{PUBLIC}/mascot"
BRAND_JSON = "brand.json"
COL_SPLIT = 740
ROW_SPLIT = 925
QUADRANTS = {
    "idle": (0, 0, COL_SPLIT, ROW_SPLIT),
    "greeting": (COL_SPLIT, 0, None, ROW_SPLIT),
    "empty-handed": (0, ROW_SPLIT, COL_SPLIT, None),
    "sprout": (COL_SPLIT, ROW_SPLIT, None, None),
}
PAPER_THRESHOLD = 236
GAP_CLOSE = 5
EDGE_SOFTEN = 1.2
PAD = 6
SIZE = 640
MARK_SIZE = 256
MASTER_SIZE = 512
INLINE_MARK_SIZE = 96
PLATE = (255, 255, 255)
APPLE_TOUCH_SCALE = 0.78
MASKABLE_SCALE = 0.62


def silhouette(rgb):
    """Everything not reachable from the corner through near-white paper."""
    ink = rgb.convert("L").point(lambda v: 255 if v < PAPER_THRESHOLD else 0)
    sealed = ink.filter(ImageFilter.MaxFilter(GAP_CLOSE))
    canvas = ImageOps.expand(sealed, border=1, fill=0)
    ImageDraw.floodfill(canvas, (0, 0), 128)
    canvas = canvas.crop((1, 1, canvas.width - 1, canvas.height - 1))
    inside = canvas.point(lambda v: 0 if v == 128 else 255)
    return inside.filter(ImageFilter.MinFilter(GAP_CLOSE))


def cut_out(rgb):
    art = rgb.convert("RGBA")
    art.putalpha(silhouette(rgb).filter(ImageFilter.GaussianBlur(EDGE_SOFTEN * 0.6)))
    return art


def bare_bulb(rgb):
    """The bulb alone, without the motion ticks around it."""
    shape = silhouette(rgb)
    x0, y0, x1, y1 = shape.getbbox()
    seed = ((x0 + x1) // 2, y0 + (y1 - y0) * 2 // 3)
    ImageDraw.floodfill(shape, seed, 128)
    bulb = shape.point(lambda v: 255 if v == 128 else 0)
    art = rgb.convert("RGBA")
    art.putalpha(bulb.filter(ImageFilter.GaussianBlur(EDGE_SOFTEN * 0.6)))
    return art


def largest_part(alpha):
    """Bounding box of the biggest connected piece, i.e. the character without its companion."""
    mask = alpha.point(lambda v: 255 if v > 128 else 0)
    best, best_area = None, 0
    while (bb := mask.getbbox()) is not None:
        seed = next(
            (x, y) for y in range(bb[1], bb[3]) for x in range(bb[0], bb[2]) if mask.getpixel((x, y)) == 255
        )
        ImageDraw.floodfill(mask, seed, 128)
        part = mask.point(lambda v: 255 if v == 128 else 0)
        area = sum(part.histogram()[255:])
        if area > best_area:
            best, best_area = part.getbbox(), area
        mask = mask.point(lambda v: 0 if v == 128 else v)
    return best


def square(img, size, bottom):
    """Square canvas centred on the character, wide enough to keep everything else in frame."""
    alpha = img.getchannel("A")
    bb = alpha.getbbox()
    body = largest_part(alpha)
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
src = Image.open(SRC).convert("RGB")
for name, (x0, y0, x1, y1) in QUADRANTS.items():
    quad = src.crop((x0, y0, x1 or src.width, y1 or src.height))
    quad = ImageOps.expand(quad, border=PAD, fill=(255, 255, 255))
    bottom = name != "sprout"
    square(cut_out(quad), SIZE, bottom).save(f"{OUT}/{name}.webp", quality=90, method=6)
    if name == "sprout":
        mark = square(bare_bulb(quad), MASTER_SIZE, bottom)
        write_brand_rasters(mark)
        write_inline_mark(mark)
    print(name, "ok")
