#!/usr/bin/env python3
"""美术管线:AI 原画 → 游戏精灵。
1) 取四角众数为幕布色,从边缘洪泛抠图(不误伤角色同色部位)
2) 边缘去色溢(绿/品红fringe)
3) 按 alpha 包围盒裁剪,NEAREST 降采样到目标显示尺寸
用法: python3 tools/process_art.py
"""
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "art_src"
OUT = ROOT / "web" / "public" / "sprites"

# 目标显示高度(px,游戏内 1:1 绘制;M=48px/m)
TARGETS = {
    "knight": 46,
    "ranger": 46,
    "arcanist": 46,
    "warden": 48,
    "shroomling": 30,
    "windbee": 24,
    "blightwolf": 36,
    "thornvine": 38,
    "oakgolem": 64,
    "boss_nanmir": 132,
    # 第二批:元素系新怪 + 稀有怪
    "emberimp": 28,
    "frostslime": 26,
    "sparklizard": 26,
    "toxintoad": 30,
    "stardustsprite": 24,
    # 场景物件
    "prop_tree": 112,
    "prop_rock": 44,
    "prop_bush": 34,
}
TILE = {"grass_tile": 96}
DIST = 88  # 幕布色距阈值


def key_out(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    # 幕布色 = 四角平均
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    br = sum(c[0] for c in corners) // 4
    bg = sum(c[1] for c in corners) // 4
    bb = sum(c[2] for c in corners) // 4

    def is_bg(p):
        return abs(p[0] - br) + abs(p[1] - bg) + abs(p[2] - bb) < DIST * 3

    # 洪泛:仅清除与边缘连通的幕布像素
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(px[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))

    # 去色溢:紧邻透明区的像素,压制幕布主导通道
    green_bg = bg > br and bg > bb
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0:
                continue
            near_hole = any(
                0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0
                for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1))
            )
            if not near_hole:
                continue
            r, g, b, a = p
            if green_bg and g > max(r, b) + 30:
                px[x, y] = (r, max(r, b) + 20, b, a)
            elif not green_bg and r > g + 30 and b > g + 30:
                px[x, y] = (g + 20, g, g + 20, a)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, target_h in TARGETS.items():
        f = SRC / f"{name}.png"
        img = key_out(Image.open(f))
        box = img.getbbox()
        img = img.crop(box)
        scale = target_h / img.height
        img = img.resize((max(1, round(img.width * scale)), target_h), Image.NEAREST)
        img.save(OUT / f"{name}.png")
        print(f"{name}: {img.width}x{img.height}")
    for name, size in TILE.items():
        img = Image.open(SRC / f"{name}.png").convert("RGB")
        # 裁掉 5% 边框(生成图边缘偏暗会形成平铺接缝)
        bw, bh = img.size
        m = int(min(bw, bh) * 0.05)
        img = img.crop((m, m, bw - m, bh - m))
        img = img.resize((size, size), Image.BOX)
        img.save(OUT / f"{name}.png")
        print(f"{name}: tile {size}x{size}")


if __name__ == "__main__":
    main()
