#!/usr/bin/env python3
"""Sinh đường nét (path) của logo mdprev từ phông thật, để favicon, header và ảnh OG không phụ thuộc phông hệ thống.
Cần fonttools và brotli (python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli). Chạy: /tmp/ft/bin/python tools/make-brand.py
Ghi: public/favicon.svg, src/components/brand-mark.json và brand-wordmark.json (path cho BrandLogo.astro và make-og.cjs)."""
import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

def glyph(path, ch, xheight_px, cx, baseline):
    f = TTFont(path); gs = f.getGlyphSet(); name = f.getBestCmap()[ord(ch)]
    xh = f['OS/2'].sxHeight or 500
    s = xheight_px / xh
    bp = BoundsPen(gs); gs[name].draw(bp); x0, _, x1, _ = bp.bounds
    tx = cx - (x0 + x1) / 2 * s
    pen = SVGPathPen(gs, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
    gs[name].draw(TransformPen(pen, (s, 0, 0, -s, tx, baseline)))
    return pen.getCommands()

# V2 (Cris chọn phương án A): con trỏ soạn thảo (vạch đứng mảnh) trên trang gập, thay chữ m
M = 'M12.5 10h2.6v16h-2.6z'
json.dump({'cur': M}, open('src/components/brand-mark.json', 'w'))

def run(path, text, size_px, x0, baseline, track=0.0, kern=None):
    """Đặt chuỗi glyph liên tiếp theo advance của phông; trả (path d, bề rộng px)."""
    f = TTFont(path); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
    s = size_px / upm; x = x0; ds = []
    for ch in text:
        n = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
        gs[n].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        ds.append(pen.getCommands()); x += gs[n].width * s + track * size_px
    return ' '.join(ds), x - x0 - track * size_px
MD, MDW = run('tools/fonts/jetbrains-mono-latin-500-normal.woff2', 'md', 18, 0, 17, -0.05)
PV, PVW = run('tools/fonts/newsreader-latin-400-italic.woff2', 'prev', 20.2, MDW + 0.6, 17, -0.012)
W = MDW + 0.6 + PVW
json.dump({'md': MD, 'prev': PV, 'w': round(W, 2), 'h': 24}, open('src/components/brand-wordmark.json', 'w'))

def svg(body, fold, glyph, dbody=None, dfold=None, dglyph=None):
    style = f'<style>.s{{fill:{body}}}.a{{fill:{fold}}}.g{{fill:{glyph}}}'
    if dbody: style += f'@media(prefers-color-scheme:dark){{.s{{fill:{dbody}}}.a{{fill:{dfold}}}.g{{fill:{dglyph}}}}}'
    style += '</style>'
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' + style +
            '<path class="s" d="M2 2h20l8 8v20H2z"/><path class="a" d="M22 2v8h8z"/>'
            f'<path class="g" d="{M}"/></svg>\n')
# thân accent xanh mực, góc gập là mặt sau trang (xanh nhạt), con trỏ trắng; theme tối: xanh nhạt, con trỏ tối
open('public/favicon.svg', 'w').write(svg('#1e5ba1', '#9cc0ee', '#ffffff', '#7fb0f2', '#d6e6fb', '#16233a'))
print('ok', len(M))
