#!/usr/bin/env python3
"""序列帧处理器:把 AI 生成的动作帧处理成同画布、同尺寸、脚底对齐的精灵序列。

为什么要有这一层:`process_art.py` 的 `PAIRS` 管的是"两帧对"(站立/迈步),
一旦动作变成 3~6 帧,原来那套"按主体 bbox 缩放到目标高"的做法会出两个坑 ——

1. **一大一小**:每帧各自缩放到目标高,抬手/抬腿/剑尖上挑的那一帧主体更高,
   缩放比例就不同 → 播放时身体一会儿大一会儿小(和双帧那次踩的是同一个坑);
2. **身体横移**:锚点若取整图中心,剑或披风伸出去的那一帧,身体会被推偏几个像素
   → 播放时整个人在抖。

所以这里的口径是:
- **统一缩放**:先量每帧**身体连通域**(最大域)的高度,取中位数当基准,所有帧用**同一个比例**缩放;
- **脚底锚定**:水平按身体域中心、垂直按身体域底边对齐到画布(脚踩在地上,剑伸到哪都不影响);
- **画布取所有帧的最大宽高**(再各留 2px 边),不裁剪单帧 —— 这样每帧画布完全一致,底锚绘制不会跳。

用法:
    python3 tools/process_frames.py            # 处理 SEQUENCES 里登记的全部序列
    python3 tools/process_frames.py knight     # 只处理名字以 knight 开头的源帧

源图放 `web/art_src/frames/<name>.png`(品红幕布),成品写 `web/public/sprites/<name>.png`,
命名约定 `<类别>_<动作>_<序号>.png`(见 docs/04-ART-PIPELINE.md §3)。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import process_art  # noqa: E402  复用抠幕布与连通域,避免两份实现漂移

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "art_src" / "frames"
OUT = ROOT / "web" / "public" / "sprites"

# 序列登记:<序列基名>: (动作, 帧数, 目标身高px, 源文件前缀)
# 基名 = 出图用的前缀;成品名 = f"{base}_{seq}_{i}.png"
SEQUENCES: dict[str, tuple[str, int, int]] = {
    # 剑士走路 4 帧(10-FULL-PLAN 轮 27 / 动画批次 1)—— 目标高与既有 knight.png(46px)一致
    "knight_walk": 4,
}
TARGET_H = {"knight_walk": 46}  # 每套序列的目标身高(px)

PAD = 2  # 画布四周留白


def body_component(img: Image.Image):
    """身体连通域 = 面积最大的那块(剑/披风是独立域时不会抢锚点)。"""
    comps = process_art.components(img)
    if not comps:
        return None
    return max(comps, key=lambda c: c[0])[1]


def load_frames(seq: str, n: int) -> list[Image.Image] | None:
    frames = []
    for i in range(1, n + 1):
        f = SRC / f"{seq}_{i}.png"
        if not f.exists():
            print(f"{seq}: 缺源帧 {f.name},跳过")
            return None
        frames.append(process_art.key_out(Image.open(f)))
    return frames


def process_sequence(seq: str, n: int, target_h: int) -> bool:
    frames = load_frames(seq, n)
    if frames is None:
        return False

    bodies = [body_component(f) for f in frames]
    if any(b is None for b in bodies):
        print(f"{seq}: 有帧找不到主体,跳过")
        return False

    # 统一缩放:身体高度取中位数(避免被某个极端姿势带偏),所有帧同一比例
    heights = sorted(b[3] - b[1] for b in bodies)
    ref_h = heights[len(heights) // 2]
    scale = target_h / ref_h

    scaled: list[Image.Image] = []
    for img, body in zip(frames, bodies):
        nw = max(1, round(img.width * scale))
        nh = max(1, round(img.height * scale))
        scaled.append(img.resize((nw, nh), Image.NEAREST))

    # 画布:因为锚点是"身体中心",画布必须**以身体中心为轴左右对称**地够宽,
    # 否则某帧的剑会伸出画布被裁掉(裁掉的剑 = 播放时一闪一闪)。
    # 高度取"最高那一帧的脚底以上高度",脚底落在画布最后一行 —— 与单帧精灵的
    # "画布底边 = 地面"约定一致,切动作时不会上下跳。
    scaled_bodies = [[round(v * scale) for v in b] for b in bodies]
    half_w = max(max((b[0] + b[2]) // 2 - b[0], b[2] - (b[0] + b[2]) // 2) for b in scaled_bodies) + PAD
    cw = half_w * 2
    ch = max(b[3] for b in scaled_bodies) + PAD

    for i, (im, body) in enumerate(zip(scaled, scaled_bodies), start=1):
        bx0, by0, bx1, by1 = body
        cx = (bx0 + bx1) // 2          # 水平:身体中心
        feet = by1                      # 垂直:脚底
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        # 目标:身体中心落在画布水平中心,脚底落在画布最后一行
        canvas.alpha_composite(im, (cw // 2 - cx, ch - 1 - feet))
        canvas.save(OUT / f"{seq}_{i}.png")
        print(f"{seq}_{i}.png: {canvas.width}x{canvas.height}(身体 {bx1 - bx0}x{by1 - by0} @ {cx},{feet})")

    # 自查:同画布 + 脚底对齐(写在输出里,红了就是这套规则被改坏了)
    outs = [Image.open(OUT / f"{seq}_{i}.png") for i in range(1, n + 1)]
    sizes = {im.size for im in outs}
    assert len(sizes) == 1, f"{seq}: 各帧画布不一致 {sizes} —— 底锚绘制会跳"
    return True


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    done = 0
    for base, n in SEQUENCES.items():
        if only and not base.startswith(only):
            continue
        if process_sequence(base, n, TARGET_H[base]):
            done += 1
    print(f"✅ 处理 {done} 套序列")


if __name__ == "__main__":
    main()
