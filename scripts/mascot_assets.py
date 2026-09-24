"""Cut the coloured mascot sheet into transparent sprites: <pose>.webp, plus sprout-mark.webp.

Run from the repo root: python3 scripts/mascot_assets.py <sheet>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

SRC = sys.argv[1] if len(sys.argv) > 1 else "Kodamachi Coloured version.jpeg"
OUT = "client/public/mascot"
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


Path(OUT).mkdir(parents=True, exist_ok=True)
src = Image.open(SRC).convert("RGB")
for name, (x0, y0, x1, y1) in QUADRANTS.items():
    quad = src.crop((x0, y0, x1 or src.width, y1 or src.height))
    quad = ImageOps.expand(quad, border=PAD, fill=(255, 255, 255))
    bottom = name != "sprout"
    square(cut_out(quad), SIZE, bottom).save(f"{OUT}/{name}.webp", quality=90, method=6)
    if name == "sprout":
        square(bare_bulb(quad), MARK_SIZE, bottom).save(f"{OUT}/sprout-mark.webp", quality=90, method=6)
    print(name, "ok")
