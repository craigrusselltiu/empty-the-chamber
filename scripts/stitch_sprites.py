"""Stitch pseudo-pixel per-direction strips into one sheet per animation.

Each output sheet has 8 rows (one per direction, order in DIRS) and one column per frame.
Also writes public/sprites/<char>/<char>.json describing every animation.

Usage: python scripts/stitch_sprites.py
"""
import json
from pathlib import Path
from PIL import Image

SRC = Path("E:/GitHub/pseudo-pixel/characters")
OUT = Path(__file__).resolve().parent.parent / "public" / "sprites"
CHARS = {"rust": "red_panda_ps1_v2/out", "reno": "raccoon/out"}
# Counter-clockwise from screen-right, so row = round(angle / 45deg) % 8
DIRS = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"]

for name, rel in CHARS.items():
    src = SRC / rel
    dst = OUT / name
    dst.mkdir(parents=True, exist_ok=True)
    anims = sorted({p.stem.rsplit("_", 1)[0] for p in src.glob("*.json")})
    meta = {"directions": DIRS, "animations": {}}
    for anim in anims:
        strips = []
        for d in DIRS:
            j = json.loads((src / f"{anim}_{d}.json").read_text())
            strips.append((Image.open(src / f"{anim}_{d}.png").convert("RGBA"), j["frames"]))
        fw, fh = strips[0][1][0]["frame"]["w"], strips[0][1][0]["frame"]["h"]
        counts = {len(f) for _, f in strips}
        assert len(counts) == 1, f"{name}/{anim}: frame counts differ {counts}"
        n = counts.pop()
        sheet = Image.new("RGBA", (fw * n, fh * len(DIRS)))
        for row, (img, frames) in enumerate(strips):
            for i, f in enumerate(frames):
                r = f["frame"]
                sheet.paste(img.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])), (i * fw, row * fh))
        sheet.save(dst / f"{anim}.png")
        meta["frameWidth"], meta["frameHeight"] = fw, fh
        meta["animations"][anim] = {
            "image": f"{anim}.png",
            "frames": n,
            "durations": [f["duration"] for f in strips[0][1]],
        }
        print(f"{name}/{anim}.png  {n} frames x {len(DIRS)} dirs  {sheet.size}")
    (dst / f"{name}.json").write_text(json.dumps(meta, indent=2))
