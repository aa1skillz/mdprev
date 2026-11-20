/**
 * Mermaid cần DOM nên chạy ở luồng chính, sau khi worker dựng xong HTML.
 * Khối ```mermaid được pipeline đánh dấu `.cb[data-mermaid]` (hiện như khối code); ở đây thay dần từng khối bằng
 * <figure class="mermaid"> chứa SVG. Bản xem hiện ngay; mỗi sơ đồ chỉ dựng khi nó cuộn tới gần màn hình (cổng theo
 * `data-line`, mở bằng `openMermaidGate`), hoặc khi có chỗ cần HTML đầy đủ (pop-out, slide, in, chép, xuất: `wantAllMermaid`).
 * Các lần dựng nối tiếp nhau, mỗi lần sau một lượt rảnh để gõ phím không bị chặn. Lỗi cú pháp thì giữ nguyên khối code.
 * Thư viện chỉ được tải khi tài liệu có sơ đồ.
 *
 * Layout: giữ mặc định của Mermaid 12 là ELK (chunk ~450 KB gzip, chỉ tải khi một sơ đồ flowchart/state/class/ER được dựng).
 * Đã thử dagre (~17 KB): sơ đồ state của bài mẫu bị chồng nhãn, đường nối rối; ELK dễ đọc hơn hẳn nên đáng số byte đó,
 * nhất là khi chỉ tải lúc sơ đồ cuộn tới và service worker cache lại.
 */
type Mermaid = typeof import('mermaid')['default'];
type Config = Parameters<Mermaid['initialize']>[0];
let lib: Promise<Mermaid> | undefined;
const cache = new Map<string, string>();
let uid = 0;

const isDarkNow = () => document.documentElement.dataset['theme'] === 'dark';
export const hasMermaid = (html: string): boolean => html.includes('data-mermaid');
/** Tải thư viện (một lần). Lỗi mạng thì lần sau thử lại. */
export function preloadMermaid(): Promise<Mermaid> {
  lib ??= import('mermaid').then((m) => m.default);
  lib.catch(() => { lib = undefined; });
  return lib;
}

const base = (dark: boolean, labels = true): Config => ({
  startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral', suppressErrorRendering: true,
  htmlLabels: labels, flowchart: { htmlLabels: labels },
  gantt: { fontSize: 13, sectionFontSize: 13, barHeight: 22, barGap: 6 }, // mặc định 11px: sau khi co vào cột chỉ còn ~7px, không đọc được
  ...(dark ? { themeVariables: { edgeLabelBackground: '#3c3c3c' } } : {}), // nhãn cạnh: chữ #ccc trên nền mặc định #585858 chỉ đạt 4,43:1 (axe), nền tối hơn thì ≥ 7:1
} as Config);

const idle = (): Promise<void> => new Promise((r) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout: 250 }); else setTimeout(r, 0);
});

// ---- cổng: mỗi khối chờ tới khi gần màn hình, hoặc tới khi có ai cần đủ mọi sơ đồ ----
let all = false;
const waiting = new Map<string, Set<() => void>>();
const opened = new Set<string>(); // khối đã thấy trước khi kịp đăng ký cổng
/** Mở cổng của khối có `data-line` này (bản xem gọi khi khối cuộn tới gần). */
export function openMermaidGate(line: string): void {
  opened.add(line);
  const s = waiting.get(line);
  if (!s) return;
  waiting.delete(line);
  s.forEach((f) => f());
}
/** Từ giờ dựng mọi sơ đồ, không chờ cuộn (có cửa sổ/chức năng cần HTML đầy đủ). Giữ tới khi tải lại trang. */
export function wantAllMermaid(): void {
  all = true;
  for (const s of waiting.values()) s.forEach((f) => f());
  waiting.clear();
}
const gate = (line: string | null): Promise<void> => {
  if (all || line === null || opened.has(line)) return Promise.resolve();
  return new Promise((r) => { const s = waiting.get(line) ?? new Set(); s.add(r); waiting.set(line, s); });
};
/** Bản xem đổi nội dung: quên các cổng đã mở theo dòng (dòng có thể đã trỏ tới khối khác). */
export function resetMermaidGates(): void { opened.clear(); }

/**
 * Gantt có `axisFormat` chỉ tới tháng/năm (không có ngày, tuần, giờ) mà không đặt `tickInterval` thì Mermaid vẫn đặt mốc theo tuần:
 * nhãn lặp lại ("Jan 2026 Jan 2026 Jan 2026 Jan 2026 Feb 2026 ..."). Thêm `tickInterval 1month` cho đúng trường hợp đó. Tác giả đã đặt thì giữ nguyên.
 */
export function prepSource(source: string): string {
  if (!/^\s*gantt\b/m.test(source) || /^\s*tickInterval\b/m.test(source)) return source;
  return source.replace(/^([ \t]*axisFormat[ \t]+)(.*)$/m, (m, pre: string, fmt: string) => (/%[dejaAUWwuxXHIMSLpZc]/.test(fmt) ? m : `${m}\n${pre.replace(/axisFormat[ \t]+$/, '')}tickInterval 1month`));
}

/**
 * Node có màu nền do tác giả đặt (`style X fill:…`, `classDef`) mà không đặt màu chữ: chữ lấy màu của theme (sáng ở giao diện tối, tối ở giao diện sáng)
 * nên có thể gần như tàng hình trên nền pastel/đậm. Chọn chữ sáng hay tối theo độ sáng của nền, ở mọi theme.
 * SVG chưa gắn vào trang nên đọc `fill` inline của hình (Mermaid ghi `style="fill:… !important"`), không dùng getComputedStyle.
 */
export function fixNodeContrast(fig: ParentNode): void {
  const cx = document.createElement('canvas').getContext('2d');
  if (!cx) return;
  const rgb = (c: string): [number, number, number] | null => {
    cx.fillStyle = '#010203'; cx.fillStyle = c;
    const v = String(cx.fillStyle);
    if (v === '#010203' && c.replace(/\s/g, '').toLowerCase() !== '#010203') return null; // màu không hợp lệ
    const h = /^#([0-9a-f]{6})$/i.exec(v);
    if (h) return [0, 2, 4].map((i) => parseInt(h[1]!.slice(i, i + 2), 16)) as [number, number, number];
    const m = /^rgba?\(([^)]+)\)/.exec(v);
    return m ? (m[1]!.split(',').slice(0, 3).map((x) => Number(x)) as [number, number, number]) : null;
  };
  const lum = ([r, g, b]: [number, number, number]) => { const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  for (const node of fig.querySelectorAll<SVGGElement>('g.node')) {
    const label = node.querySelector<SVGGElement>('g.label');
    if (label?.style.color) continue; // tác giả đã đặt màu chữ
    const shape = [...node.querySelectorAll<SVGElement>('rect, path, polygon, circle, ellipse')].find((e) => !e.closest('foreignObject') && e.style.fill && e.style.fill !== 'none');
    if (!shape) continue;
    const fill = rgb(shape.style.fill);
    if (!fill) continue;
    const L = lum(fill);
    const ink = ratio(L, lum([26, 26, 26])) >= ratio(L, lum([245, 245, 245])) ? '#1a1a1a' : '#f5f5f5';
    for (const t of node.querySelectorAll<HTMLElement | SVGElement>('span, p, div, text, tspan')) {
      t.style.setProperty('color', ink, 'important');
      if (t.tagName.toLowerCase() === 'text' || t.tagName.toLowerCase() === 'tspan') t.style.setProperty('fill', ink, 'important');
    }
  }
}

let chain: Promise<unknown> = Promise.resolve();
/** Dựng lần lượt: Mermaid không chịu được hai lần render chồng nhau. */
const errCache = new Map<string, string>(); // nguồn sơ đồ lỗi -> thông điệp ngắn
const shortWhy = (err: unknown): string => String((err as Error)?.message ?? 'invalid syntax').split('\n')[0]!.replace(/^Error:\s*/, '').slice(0, 140) || 'invalid syntax';
const serial = <T>(f: () => Promise<T>): Promise<T> => { const p = chain.then(f, f); chain = p.catch(() => undefined); return p; };

/** Thay các khối Mermaid trong `html` bằng SVG, mỗi khối khi cổng của nó mở. Xong hết (hoặc bị bỏ vì cũ) thì resolve. */
export async function upgradeMermaid(html: string, dark: boolean, opts: { stale: () => boolean; onUpdate: (html: string) => void }): Promise<void> {
  if (!hasMermaid(html)) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const blocks = [...tpl.content.querySelectorAll<HTMLElement>('.cb[data-mermaid]')];
  if (blocks.length === 0) return;
  // thư viện Mermaid (nặng, ~2 s script ở điện thoại) chỉ nạp khi có một sơ đồ gần màn hình: bài mẫu mở ở Read trên điện thoại không còn trả giá cho sơ đồ nằm dưới nếp gấp
  await Promise.race(blocks.map((b) => gate(b.getAttribute('data-line'))));
  if (opts.stale()) return;
  // và (chỉ trên điện thoại, nơi bài mẫu mở ở Read) không trong 5 giây đầu của trang: ~2 s script của Mermaid chen vào lúc trang còn đang dựng làm chậm tương tác đầu (TBT), trong khi sơ đồ nằm dưới nếp gấp
  if (!all && matchMedia('(max-width: 640px)').matches && performance.now() < 5000) await new Promise<void>((r) => setTimeout(r, 5000 - performance.now()));
  if (opts.stale()) return;
  let mm: Mermaid;
  try { mm = await preloadMermaid(); } catch {
    if (opts.stale()) return;
    blocks.forEach((b) => b.setAttribute('data-mm-failed', '')); // không nạp được thư viện: bỏ chỗ giữ chỗ, hiện lại mã nguồn
    const o1 = document.createElement('div'); o1.append(tpl.content.cloneNode(true)); opts.onUpdate(o1.innerHTML);
    return;
  }
  if (opts.stale()) return;
  await Promise.all(blocks.map(async (b) => {
    const source = b.querySelector('pre')?.textContent?.trim() ?? '';
    if (!source) return;
    const line = b.getAttribute('data-line');
    const key = (dark ? 'd:' : 'l:') + source;
    let svg = cache.get(key);
    let failed = errCache.get(key);
    if (svg === undefined && failed === undefined) {
      await gate(line);
      if (opts.stale()) return;
      svg = await serial(async () => {
        await idle();
        if (opts.stale()) return undefined;
        mm.initialize(base(dark));
        try { return (await mm.render(`mm-${++uid}`, prepSource(source), sandbox())).svg; } catch (err) { document.getElementById(`dmm-${uid}`)?.remove(); errCache.set(key, shortWhy(err)); return undefined; }
      });
      if (svg === undefined) { if (opts.stale()) return; failed = errCache.get(key); }
      else {
        if (cache.size > 60) cache.delete(cache.keys().next().value as string);
        cache.set(key, svg);
      }
    }
    if (opts.stale()) return;
    if (svg === undefined) {
      // sơ đồ lỗi: giữ mã nguồn, thêm một dòng báo lỗi ngay trên khối (thay vì im lặng hiện chữ trơ)
      if (failed === undefined) return;
      const note = document.createElement('p');
      note.className = 'mm-err';
      note.setAttribute('role', 'note');
      note.textContent = 'Diagram error: ' + failed;
      b.before(note);
      b.setAttribute('data-mm-failed', '');
      const o2 = document.createElement('div');
      o2.append(tpl.content.cloneNode(true));
      opts.onUpdate(o2.innerHTML);
      return;
    }
    const fig = document.createElement('figure');
    fig.className = 'mermaid';
    if (line) fig.setAttribute('data-line', line);
    fig.innerHTML = svg;
    fixNodeContrast(fig);
    // tên truy cập cho trình đọc màn hình: loại sơ đồ + các nhãn chữ trong hình; tabindex để cuộn ngang bằng bàn phím khi sơ đồ rộng hơn cột
    const kind = (source.split(/\s/, 1)[0] ?? '').replace(/-v\d+$/, '').replace(/^graph$/, 'flowchart');
    const labels = [...new Set([...fig.querySelectorAll('text, .nodeLabel, .edgeLabel')].map((t) => t.textContent?.trim() ?? '').filter(Boolean))];
    fig.setAttribute('role', 'img');
    fig.setAttribute('aria-label', `${kind} diagram${labels.length ? ': ' + labels.slice(0, 6).join(', ') + (labels.length > 6 ? `, and ${labels.length - 6} more` : '') : ''}`);
    fig.tabIndex = 0;
    const sv = fig.querySelector('svg'), vbw = Number(sv?.getAttribute('viewBox')?.split(/[\s,]+/)[2]);
    if (sv && vbw > 480) { sv.style.setProperty('--mw-pv', Math.round(Math.min(vbw, Math.max(480, vbw * 0.75))) + 'px'); sv.style.minWidth = 'var(--mw, 480px)'; } // 480px mặc định (xuất/slide/in); bản xem trong app nâng lên 75% qua studio.css // sơ đồ vốn rộng thì cuộn ngang trong khung thay vì co chữ tới mức không đọc được (tối thiểu 75% cỡ tự nhiên, hoặc 480px); sơ đồ nhỏ giữ nguyên
    if (vbw > 700) { fig.setAttribute('data-wide', ''); fig.style.setProperty('--w', Math.min(vbw, 960) + 'px'); } // sơ đồ rộng thoát khỏi cột chữ hẹp (CSS, chỉ ở bản xem) để giữ cỡ chữ gần tự nhiên
    b.replaceWith(fig);
    const out = document.createElement('div');
    out.append(tpl.content.cloneNode(true));
    opts.onUpdate(out.innerHTML);
  }));
}

/**
 * Sơ đồ cho bản xuất (DOCX): dựng lại bằng theme sáng, nhãn SVG thuần (htmlLabels tắt) vì nhãn HTML trong <foreignObject>
 * làm canvas bị "taint" và không xuất được PNG. Trả về chuỗi SVG, null nếu lỗi cú pháp hay không nạp được thư viện.
 */
/** Mermaid dựng sơ đồ trong một phần tử tạm để đo chữ; nếu để nó tự gắn vào <body> thì trang dài thêm vài trăm px trong lúc dựng (thanh cuộn hiện ra rồi mất, cột chia nhảy 8px: CLS). Hộp này nằm ngoài luồng và ngoài màn hình. */
let box: HTMLElement | null = null;
function sandbox(): HTMLElement {
  if (box?.isConnected) return box;
  box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  document.body.append(box);
  return box;
}

export async function mermaidSvgForExport(source: string): Promise<string | null> {
  let mm: Mermaid;
  try { mm = await preloadMermaid(); } catch { return null; }
  return serial(async () => {
    mm.initialize(base(false, false));
    try { return (await mm.render(`mmx-${++uid}`, prepSource(source.trim()), sandbox())).svg; } catch { document.getElementById(`dmmx-${uid}`)?.remove(); return null; } finally {
      // initialize gộp cấu hình: trả nhãn HTML về như cũ để bản xem dựng sau đó không bị ảnh hưởng
      mm.initialize(base(isDarkNow()));
    }
  });
}
