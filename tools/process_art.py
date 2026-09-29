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
    # 主角迈步帧(双帧走路动画)
    "knight_walk": 46,
    "ranger_walk": 46,
    "arcanist_walk": 46,
    "warden_walk": 48,
    # 第二章「霜语冰原」
    "prop_pine": 116,
    "prop_icerock": 44,
    "prop_crystal": 40,
    "snowpuff": 26,
    "iceturtle": 40,
    "blizzardhawk": 26,
    "frostmage": 32,
    "boss_velsha": 128,
    # 第三章「烬语荒漠」
    "cinderrat": 22,
    # 怪物第二帧(双帧动画)
    "shroomling_f2": 30,
    "windbee_f2": 24,
    "blightwolf_f2": 36,
    "cinderrat_f2": 22,
    "dunebeetle": 36,
    "flamedancer": 34,
    "duststinger": 32,
    "boss_kazra": 130,
    "prop_cactus": 60,
    "prop_sandrock": 48,
    "prop_tumble": 32,
    # 第三批:拾取物 / 传送门 / 元素图标(2026-09-29)
    "pickup_chest": 30,
    "pickup_stardust": 24,
    "pickup_potion": 26,
    "pickup_rune": 26,
    "portal_gate": 88,
    "elem_fire": 20,
    "elem_ice": 20,
    "elem_lightning": 20,
    "elem_poison": 20,
    # 第三批之二:UI 9-slice 面板 + 技能图标(按技能原型:斩击/投射/突进/大招)
    "icon_slash": 26,
    "icon_shot": 26,
    "icon_dash": 26,
    "icon_ult": 26,
    # 第三批之三:怪物第二帧(双帧动画;缺源图自动跳过,按补齐进度逐个生效)
    "oakgolem_f2": 64,
    "snowpuff_f2": 26,
    "iceturtle_f2": 40,
    "blizzardhawk_f2": 26,
    "frostmage_f2": 32,
    "dunebeetle_f2": 36,
    "flamedancer_f2": 34,
    "duststinger_f2": 32,
}
TILE = {"grass_tile": 96, "snow_tile": 96, "sand_tile": 96}

# 特效贴图:纯黑底,运行时 'lighter' 加法混合(黑=不发光,无需抠图)。
# 处理:亮度>16 的 bbox 裁剪 → 等比缩放到目标高。
FX = {"fx_slash": 64, "fx_burst": 64, "fx_ring": 96, "fx_beam": 128}

# 9-slice UI 面板:抠图后强制正方形输出(切片尺寸由绘制端按比例取,见 gfx/nineSlice.ts)
PANEL = {"ui_panel": 32}
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

    # 幕布判定:品红幕布必须按通道判(白/浅蓝精灵与品红的"通道和距"很小,
    # 早先用 sum-abs 会把雪绒球这类白色精灵整只吃掉 → 见 CHANGELOG 2f0cf7 后修复)
    magenta_bg = br > 180 and bb > 180 and bg < 120

    def is_bg(p):
        if magenta_bg:
            return p[0] > 165 and p[2] > 165 and p[1] < 110
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

    # 品红幕布:封闭孔洞里的残留(洪泛够不到)按纯色距直接清除
    # (品红几乎不会出现在角色本体上,安全;绿幕不做全局清除以保护绿色生物)
    if magenta_bg:
        for y in range(h):
            for x in range(w):
                p = px[x, y]
                if p[3] > 0 and p[0] > 165 and p[2] > 165 and p[1] < 110 and abs(p[0] - p[2]) < 70:
                    px[x, y] = (0, 0, 0, 0)

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


# 双帧动画对:两帧必须同画布,且按【主体】对齐 —— 不能按全图 bbox,
# 否则带落叶/沙尘/雪粉的那一帧 bbox 变宽变高,底锚绘制时身体就会跳、还会一大一小。
PAIRS = [
    "shroomling", "windbee", "blightwolf", "cinderrat", "oakgolem", "snowpuff",
    "iceturtle", "blizzardhawk", "frostmage", "dunebeetle", "flamedancer", "duststinger",
]
MIN_ALPHA = 40


def components(img: Image.Image):
    """连通域(4 邻域)按面积降序:用于把主体与碎屑(落叶/沙尘/火星)分开。"""
    a = img.getchannel("A")
    px = a.load()
    w, h = img.size
    seen = bytearray(w * h)
    comps = []
    for y0 in range(h):
        row = y0 * w
        for x0 in range(w):
            i0 = row + x0
            if seen[i0] or px[x0, y0] <= MIN_ALPHA:
                continue
            stack = [(x0, y0)]
            seen[i0] = 1
            minx = maxx = x0
            miny = maxy = y0
            area = 0
            while stack:
                x, y = stack.pop()
                area += 1
                if x < minx: minx = x
                elif x > maxx: maxx = x
                if y < miny: miny = y
                elif y > maxy: maxy = y
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        i = ny * w + nx
                        if not seen[i] and px[nx, ny] > MIN_ALPHA:
                            seen[i] = 1
                            stack.append((nx, ny))
            if area > 20:
                comps.append((area, (minx, miny, maxx + 1, maxy + 1)))
    comps.sort(reverse=True)
    return comps


def body_box(img: Image.Image):
    """主体包围盒:最大连通域 + 面积≥其 5% 的部件(分离的手/帽/尾算同一主体)。"""
    comps = components(img)
    if not comps:
        return img.getbbox()
    big = [c for c in comps if c[0] >= comps[0][0] * 0.05]
    return (
        min(c[1][0] for c in big), min(c[1][1] for c in big),
        max(c[1][2] for c in big), max(c[1][3] for c in big),
    )


def process_pair(name: str, target_h: int) -> bool:
    fb = SRC / f"{name}.png"
    ff = SRC / f"{name}_f2.png"
    if not fb.exists() or not ff.exists():
        return False
    imgs = [key_out(Image.open(fb)), key_out(Image.open(ff))]
    full = [i.getbbox() for i in imgs]           # 含碎屑:裁剪用,保证不丢图
    bodies = [body_box(i) for i in imgs]         # 仅主体:缩放/对齐用
    if any(b is None for b in full) or any(b is None for b in bodies):
        return False

    body_h = [b[3] - b[1] for b in bodies]
    scale = target_h / max(body_h)               # 共用缩放比:压扁帧保持自身比例
    crops = [i.crop(f) for i, f in zip(imgs, full)]
    crops = [
        c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.NEAREST)
        for c in crops
    ]
    # 主体在裁剪坐标里的位置(缩放后)
    body_rel = []
    for (fx0, fy0, _, _), (bx0, by0, bx1, by1) in zip(full, bodies):
        body_rel.append((
            (bx0 - fx0) * scale, (by0 - fy0) * scale, (bx1 - fx0) * scale, (by1 - fy0) * scale,
        ))

    cw = max(c.width for c in crops) + 2
    below = [c.height - br[3] for c, br in zip(crops, body_rel)]   # 主体底边之下的碎屑高度
    ch = int(max(body_rel[i][3] - body_rel[i][1] + below[i] for i in range(2))) + 2

    for suffix, c, br in zip(("", "_f2"), crops, body_rel):
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        dx = int(round(cw / 2 - (br[0] + br[2]) / 2))              # 主体水平居中
        dy = int(round(ch - 1 - br[3]))                            # 主体底边对齐
        dx = max(0, min(cw - c.width, dx))
        dy = max(0, min(ch - c.height, dy))
        canvas.alpha_composite(c, (dx, dy))
        canvas.save(OUT / f"{name}{suffix}.png")
    print(f"{name}: pair {cw}x{ch} (主体高 {target_h})")
    return True


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pair_bases = set(PAIRS)
    for name, target_h in TARGETS.items():
        # 已成对的基名/二帧由 process_pair 统一处理(同画布 + 对齐)
        if name in pair_bases or name.endswith("_f2"):
            continue
        f = SRC / f"{name}.png"
        if not f.exists():
            continue  # 瘦身工作流:源图已清、成品在 public/sprites,跳过
        img = key_out(Image.open(f))
        box = img.getbbox()
        img = img.crop(box)
        scale = target_h / img.height
        img = img.resize((max(1, round(img.width * scale)), target_h), Image.NEAREST)
        img.save(OUT / f"{name}.png")
        print(f"{name}: {img.width}x{img.height}")
    for name, size in FX.items():
        src = SRC / f"{name}.png"
        if not src.exists():
            print(f"{name}: 缺源图,跳过")
            continue
        img = Image.open(src).convert("RGB")
        px = img.load()
        w, h = img.size
        minx, miny, maxx, maxy = w, h, 0, 0
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                r, g, b = px[x, y]
                if r + g + b > 48:
                    minx = min(minx, x); maxx = max(maxx, x)
                    miny = min(miny, y); maxy = max(maxy, y)
        if maxx <= minx:
            print(f"{name}: 全黑?跳过")
            continue
        img = img.crop((max(0, minx - 4), max(0, miny - 4), min(w, maxx + 5), min(h, maxy + 5)))
        scale = size / img.height
        img = img.resize((max(1, round(img.width * scale)), size), Image.NEAREST)
        img.save(OUT / f"{name}.png")
        print(f"{name}: fx {img.width}x{img.height}")

    for name in PAIRS:
        target = TARGETS.get(name)
        if target is None:
            print(f"{name}: 未登记目标尺寸,跳过")
            continue
        if not process_pair(name, target):
            print(f"{name}: 缺源图,跳过")

    for name, size in PANEL.items():
        pf = SRC / f"{name}.png"
        if not pf.exists():
            print(f"{name}: 缺源图,跳过")
            continue
        img = key_out(Image.open(pf))
        box = img.getbbox()
        if box:
            img = img.crop(box)
        img = img.resize((size, size), Image.NEAREST)
        img.save(OUT / f"{name}.png")
        print(f"{name}: panel {size}x{size}")

    for name, size in TILE.items():
        tf = SRC / f"{name}.png"
        if not tf.exists():
            continue
        img = Image.open(tf).convert("RGB")
        # 裁掉 5% 边框(生成图边缘偏暗会形成平铺接缝)
        bw, bh = img.size
        m = int(min(bw, bh) * 0.05)
        img = img.crop((m, m, bw - m, bh - m))
        img = img.resize((size, size), Image.BOX)
        img.save(OUT / f"{name}.png")
        print(f"{name}: tile {size}x{size}")


if __name__ == "__main__":
    main()
