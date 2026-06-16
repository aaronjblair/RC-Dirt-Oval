"""One-off: turn the Super Jay shop photo into a transparent opening-logo PNG.
Rotates upright (EXIF), removes everything but the car + driver (rembg), crops to
content, downscales. Output -> public/superjay-logo.png (referenced by the splash)."""
import sys
import numpy as np
from PIL import Image, ImageOps
from rembg import remove, new_session

SRC = r"C:\Users\aaron\Claude\Projects\RCSprint\src\assets\superjay-photo.jpg"
OUT = r"C:\Users\aaron\Claude\Projects\RCSprint\public\superjay-logo.png"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "isnet-general-use"

im = ImageOps.exif_transpose(Image.open(SRC)).convert("RGBA")
print("input", im.size, "model", MODEL)
cut = remove(im, session=new_session(MODEL))

# Clean faint haze/wisps (cables, ghost reflections) so only solid subject survives.
arr = np.array(cut)
arr[:, :, 3][arr[:, :, 3] < 40] = 0
cut = Image.fromarray(arr)

# Keep only the car+driver: isolate the widest run of solid columns and drop the
# detached blob on the left (the blue hand-truck) + stray cable specks.
a = np.array(cut)[:, :, 3]
W = a.shape[1]
solid = a.max(axis=0) > 60
runs, s = [], None
for x in range(W):
    if solid[x] and s is None:
        s = x
    if not solid[x] and s is not None:
        runs.append((s, x - 1)); s = None
if s is not None:
    runs.append((s, W - 1))
main = max(runs, key=lambda r: r[1] - r[0])  # widest run = the car+driver
print("kept column run", main, "of runs", runs)
keep = cut.crop((main[0], 0, main[1] + 1, cut.height))

# Trim thin appendages hanging off the bottom (the car's tie-down straps read as
# stray lines): drop trailing rows whose solid coverage is just a few pixels wide.
ka = np.array(keep)[:, :, 3]
KW = ka.shape[1]
rowcov = (ka > 60).sum(axis=1)
solid_rows = np.where(rowcov > KW * 0.05)[0]
bottom = int(solid_rows[-1]) + 8 if len(solid_rows) else keep.height
keep = keep.crop((0, 0, keep.width, min(keep.height, bottom)))

bbox = keep.getbbox()
print("content bbox", bbox)
cut = keep.crop(bbox)
maxh = 1000
if cut.height > maxh:
    w = round(cut.width * maxh / cut.height)
    cut = cut.resize((w, maxh), Image.LANCZOS)
cut.save(OUT)
print("saved", OUT, cut.size)
