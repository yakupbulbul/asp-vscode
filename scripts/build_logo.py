#!/usr/bin/env python3
"""Draw the ASP Studio logo on a 32 x 32 pixel grid and write every asset that uses it:
extension icon (media/icon.svg, media/icon.png), website favicon and logo, touch icon and social image.
Run: python3 scripts/build_logo.py   (needs Pillow for the PNG files)"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
N = 32
BG, WHITE, LIGHT, MID, DARKLINE = "#0a0a0a", "#f5f5f5", "#bdbdbd", "#7f7f7f", "#262626"

grid = [[None] * N for _ in range(N)]          # None = background, else a colour


def put(x, y, colour):
    if 0 <= x < N and 0 <= y < N:
        grid[y][x] = colour


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def in_tri(px, py, a, b, c):
    def s(p, q, r):
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
    d1, d2, d3 = s((px, py), a, b), s((px, py), b, c), s((px, py), c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


def arrow(a, b, colour, r=4.9, width=1.75, head=3.9):
    """A line from node a to node b (centres), stopping r pixels short of both, with a pixel arrowhead."""
    ax, ay = a
    bx, by = b
    L = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / L, (by - ay) / L
    sx, sy = ax + ux * r, ay + uy * r
    tx, ty = bx - ux * (r + 0.6), by - uy * (r + 0.6)            # tip of the arrowhead
    base = (tx - ux * head, ty - uy * head)
    nx, ny = -uy, ux
    tri = [(tx, ty), (base[0] + nx * head * 0.62, base[1] + ny * head * 0.62), (base[0] - nx * head * 0.62, base[1] - ny * head * 0.62)]
    for y in range(N):
        for x in range(N):
            px, py = x + 0.5, y + 0.5
            if seg_dist(px, py, sx, sy, base[0], base[1]) <= width / 2 or in_tri(px, py, *tri):
                put(x, y, colour)


NODES = {"top": (16, 7), "bl": (6, 25), "br": (26, 25)}
arrow(NODES["bl"], NODES["br"], MID)                 # behind the other two
arrow(NODES["bl"], NODES["top"], WHITE)
arrow(NODES["top"], NODES["br"], LIGHT)

RING = ["..XXX..", ".X...X.", "X.....X", "X..C..X", "X.....X", ".X...X.", "..XXX.."]
for name, (cx, cy) in NODES.items():
    core = {"top": LIGHT, "bl": WHITE, "br": WHITE}[name]
    for j, row in enumerate(RING):
        for i, ch in enumerate(row):
            x, y = cx - 3 + i, cy - 3 + j
            if ch == "X":
                put(x, y, WHITE)
            elif ch == "C":
                put(x, y, core)
            else:
                grid[y][x] = None                       # keep the inside of a node free of lines

# rounded-square background: cut the corners in a pixel staircase
CORNER = {(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (0, 2), (3, 0), (0, 3)}
def corner(x, y):
    fx, fy = min(x, N - 1 - x), min(y, N - 1 - y)
    return (fx, fy) in CORNER
CUT = [[corner(x, y) for x in range(N)] for y in range(N)]


def svg(size=N, with_bg=True):
    rects = []
    if with_bg:
        for y in range(N):
            for x in range(N):
                if not CUT[y][x]:
                    rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{BG}"/>')
    for y in range(N):
        for x in range(N):
            if grid[y][x] and not CUT[y][x]:
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{grid[y][x]}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" width="{size}" height="{size}" shape-rendering="crispEdges">'
            + "".join(rects) + "</svg>\n")


def bitmap(scale):
    im = Image.new("RGBA", (N * scale, N * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(N):
        for x in range(N):
            if CUT[y][x]:
                continue
            col = grid[y][x] or BG
            d.rectangle([x * scale, y * scale, (x + 1) * scale - 1, (y + 1) * scale - 1], fill=col)
    return im


def og():
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), (10, 10, 10))
    d = ImageDraw.Draw(im)
    for y in range(H):
        v = int(10 + 14 * y / H)
        d.line((0, y, W, y), fill=(v, v, v))
    logo = bitmap(6)
    im.paste(logo, (90, 96), logo)

    def font(sz, bold=False):
        for f in ["/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"]:
            try:
                return ImageFont.truetype(f, sz, index=1 if bold and f.endswith(".ttc") else 0)
            except Exception:
                pass
        return ImageFont.load_default()
    d.text((90, 340), "ASP Studio", font=font(96, True), fill=(245, 245, 245))
    d.text((90, 460), "Run clingo, read the answer sets,", font=font(40), fill=(160, 160, 160))
    d.text((90, 512), "and watch rules fire round by round.", font=font(40), fill=(160, 160, 160))
    im.save(ROOT / "docs/assets/og.png")


if __name__ == "__main__":
    if "--ascii" in __import__("sys").argv:
        for y in range(N):
            print("".join("." if CUT[y][x] or not grid[y][x] else {WHITE: "W", LIGHT: "l", MID: "m"}.get(grid[y][x], "?") for x in range(N)))
    (ROOT / "media/icon.svg").write_text(svg(128))
    bitmap(8).save(ROOT / "media/icon.png")
    (ROOT / "docs/assets/favicon.svg").write_text(svg(64))
    bitmap(1).resize((32, 32), Image.NEAREST).save(ROOT / "docs/assets/favicon-32.png")
    bitmap(6).save(ROOT / "docs/assets/apple-touch-icon.png")           # 192 px, an exact pixel multiple
    og()
    print("logo assets written")
