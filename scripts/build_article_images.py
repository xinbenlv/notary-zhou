#!/usr/bin/env python3
"""把 Gemini 生成的原始 PNG 加工成文章配图，保证 29+ 篇视觉统一。

输入目录需含：cover-bg.png（16:9 背景，左侧留白）与若干 NN-name.png（3:2 章节图）。
输出到 public/images/articles/<slug>/：og.jpg（1200x630，叠加中文标题）
与 NN-name.jpg（1200x800）。

用法：
  python3 scripts/build_article_images.py \
    --slug us-notary-vs-china-notary \
    --src /tmp/img/us-notary-vs-china-notary \
    --kicker "公证知识 · 公证基础" \
    --title "美国公证员和中国公证处|根本不是一回事" \
    --subtitle "同名不同事：一个证明身份与签署，一个证明真实与合法"

标题用 | 分行；不写 | 则自动按宽度折行。
"""
import argparse
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

# 站点品牌色（与 src/styles/global.css 一致）
GREEN = (27, 59, 50)
TERRA = (216, 132, 101)
MUTED = (107, 114, 108)
YELLOW = (240, 184, 58)

SONGTI = "/System/Library/Fonts/Supplemental/Songti.ttc"
HEITI = "/System/Library/Fonts/Hiragino Sans GB.ttc"

OG_W, OG_H = 1200, 630
SECTION_W, SECTION_H = 1200, 800
MARGIN_X = 76


def songti_black(size):
    return ImageFont.truetype(SONGTI, size, index=0)


def songti_bold(size):
    return ImageFont.truetype(SONGTI, size, index=1)


def heiti(size):
    return ImageFont.truetype(HEITI, size, index=0)


def save_jpg(im, path, quality=84):
    im.convert("RGB").save(path, "JPEG", quality=quality, optimize=True, progressive=True)


def wrap_title(title, draw, max_width, size):
    """按 | 显式分行；否则按可用宽度折行。"""
    if "|" in title:
        return [s.strip() for s in title.split("|") if s.strip()]
    font = songti_black(size)
    lines, cur = [], ""
    for ch in title:
        if draw.textlength(cur + ch, font=font) <= max_width:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def trim_uniform_bands(im, max_frac=0.14, flat_sd=4.0, step=10.0):
    """裁掉模型常在上下（偶尔左右）留下的近乎纯色边带。

    这类色带本是给裁切预留的出血区，但当它与画面之间形成明显阶跃时，
    在页面上会读成意外的白边。判定：最外一行/列极均匀（标准差小），
    且与稍往里处存在明显亮度阶跃，则逐步内收。
    """
    from PIL import ImageStat

    g = im.convert("L")
    w, h = im.size

    def row_stats(y):
        s = ImageStat.Stat(g.crop((0, y, w, y + 1)))
        return s.mean[0], s.stddev[0]

    def col_stats(x):
        s = ImageStat.Stat(g.crop((x, 0, x + 1, h)))
        return s.mean[0], s.stddev[0]

    def scan(n, stats, limit):
        """从边缘向内找到色带结束的位置"""
        m0, s0 = stats(0 if n == 0 else n)
        if s0 > flat_sd:
            return 0
        i = 0
        while i < limit:
            m, s = stats(i)
            if s > flat_sd or abs(m - m0) > step:
                break
            i += 1
        return i if i < limit else 0

    top = scan(0, lambda i: row_stats(i), int(h * max_frac))
    bot = scan(0, lambda i: row_stats(h - 1 - i), int(h * max_frac))
    left = scan(0, lambda i: col_stats(i), int(w * max_frac))
    right = scan(0, lambda i: col_stats(w - 1 - i), int(w * max_frac))

    if not (top or bot or left or right):
        return im
    return im.crop((left, top, w - right, h - bot))


def detect_text_zone(im, min_frac=0.34, max_frac=0.56):
    """探测插画从哪一列开始，据此决定标题可用宽度。

    模型每次把主体放在何处并不可控，写死百分比会让长标题压到插画上。
    这里按列计算灰度标准差：背景是平整的米色（方差极低），插画一出现方差
    骤升。取第一根"忙碌"的列作为右边界。
    """
    g = im.convert("L")
    w, h = g.size
    band = g.crop((0, int(h * 0.2), w, int(h * 0.8)))  # 只看竖直中段，忽略上下出血
    px = band.load()
    bw, bh = band.size
    step = max(1, bh // 60)  # 抽样行，够用且快

    quiet_threshold = 6.0
    for x in range(int(w * min_frac), int(w * max_frac)):
        vals = [px[x, y] for y in range(0, bh, step)]
        mean = sum(vals) / len(vals)
        sd = (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5
        if sd > quiet_threshold:
            return max(int(w * min_frac), x - MARGIN_X - 24) # 留出安全间距
    return int(w * max_frac)


def build_cover(src_png, out_path, kicker, title, subtitle, wordmark="周公证员"):
    im = Image.open(src_png).convert("RGB")
    im = trim_uniform_bands(im)
    w, h = im.size
    # 只裁需要调整的那一维，保留生成时的左右构图（插画在右、左侧留白给标题）
    target_ratio = OG_W / OG_H
    if w / h < target_ratio:  # 源图偏高 → 裁高度
        new_h = round(w / target_ratio)
        top = (h - new_h) // 2
        im = im.crop((0, top, w, top + new_h))
    else:  # 源图偏宽 → 从右侧裁，保住左边的标题留白
        new_w = round(h * target_ratio)
        im = im.crop((0, 0, new_w, h))
    im = im.resize((OG_W, OG_H), Image.LANCZOS)

    d = ImageDraw.Draw(im)
    text_width = detect_text_zone(im)

    # 标题自适应：先控制行数，再缩字号直到每行都放得下
    size = 60
    while size >= 40:
        if len(wrap_title(title, d, text_width, size)) <= 2:
            break
        size -= 4
    lines = wrap_title(title, d, text_width, size)[:2]
    while size > 32 and max(d.textlength(l, font=songti_black(size)) for l in lines) > text_width:
        size -= 2

    # 竖直居中排布
    line_gap = int(size * 1.5)
    block_h = len(lines) * line_gap
    top = (OG_H - block_h) // 2 - 10

    # kicker：黄色短线 + 说明文字
    ky = top - 72
    d.rectangle([MARGIN_X, ky + 12, MARGIN_X + 44, ky + 18], fill=YELLOW)
    d.text((MARGIN_X + 58, ky), kicker, font=heiti(24), fill=MUTED)

    for i, line in enumerate(lines):
        d.text((MARGIN_X, top + i * line_gap), line, font=songti_black(size), fill=GREEN)

    if subtitle:
        sy = top + block_h + 26
        # 优先缩小字号保全文义；实在放不下才截断并加省略号
        sub_size = 25
        while sub_size > 18 and d.textlength(subtitle, font=heiti(sub_size)) > text_width:
            sub_size -= 1
        sub_font = heiti(sub_size)
        if d.textlength(subtitle, font=sub_font) > text_width:
            while len(subtitle) > 8 and d.textlength(subtitle + "…", font=sub_font) > text_width:
                subtitle = subtitle[:-1]
            subtitle += "…"
        d.text((MARGIN_X, sy), subtitle, font=sub_font, fill=MUTED)

    # 左下角品牌署名
    wy = OG_H - 85
    d.text((MARGIN_X, wy), wordmark, font=songti_bold(30), fill=GREEN)
    tw = d.textlength(wordmark, font=songti_bold(30))
    d.text((MARGIN_X + tw + 16, wy + 7), "NotaryZhou.com", font=heiti(22), fill=TERRA)

    save_jpg(im, out_path, quality=85)
    return out_path


def build_section(src_png, out_path):
    im = Image.open(src_png).convert("RGB")
    im = trim_uniform_bands(im)
    w, h = im.size
    # 裁成精确 3:2：裁掉多出来的那一维即可。裁边带后图可能比目标更"扁"，
    # 此时若仍按高度裁会越界，PIL 会补边而不是缩放——那会凭空造出黑边。
    target = SECTION_W / SECTION_H
    if w / h > target:          # 偏宽 → 裁宽度
        new_w = round(h * target)
        left = (w - new_w) // 2
        im = im.crop((left, 0, left + new_w, h))
    else:                        # 偏高 → 裁高度
        new_h = round(w / target)
        top = (h - new_h) // 2
        im = im.crop((0, top, w, top + new_h))
    im = im.resize((SECTION_W, SECTION_H), Image.LANCZOS)
    save_jpg(im, out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--src", required=True, help="含 cover-bg.png 与 NN-*.png 的目录")
    ap.add_argument("--kicker", required=True, help='如 "公证知识 · 文件回国使用"')
    ap.add_argument("--title", required=True, help="封面标题，用 | 分行")
    ap.add_argument("--subtitle", default="")
    ap.add_argument("--out-root", default="public/images/articles")
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    out = pathlib.Path(args.out_root) / args.slug
    out.mkdir(parents=True, exist_ok=True)

    cover_src = src / "cover-bg.png"
    if not cover_src.exists():
        sys.exit(f"✗ 缺少封面背景：{cover_src}")
    made = [build_cover(cover_src, out / "og.jpg", args.kicker, args.title, args.subtitle)]

    for png in sorted(src.glob("[0-9][0-9]-*.png")):
        made.append(build_section(png, out / f"{png.stem}.jpg"))

    if len(made) == 1:
        sys.exit("✗ 未找到任何章节图（应命名为 01-xxx.png）")

    for p in made:
        size_kb = pathlib.Path(p).stat().st_size // 1024
        print(f"  ✓ {p}  {size_kb} KB")


if __name__ == "__main__":
    main()
