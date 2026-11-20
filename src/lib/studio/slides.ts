/**
 * Chia bản dựng thành slide. Chia trên DOM đã dựng, không chia trên nguồn: một dòng `---` dưới đoạn văn là heading setext,
 * trong khối code chỉ là chữ, và front matter cũng mở đầu bằng `---`.
 */

/** Nhóm các phần tử cấp cao theo tên thẻ: cắt ở <hr>; nếu không có <hr> thì bắt đầu slide mới ở mỗi h1/h2; nếu không có gì thì một slide. */
export function slideRanges(tags: string[]): [number, number][] {
  const n = tags.length;
  if (!n) return [];
  const out: [number, number][] = [];
  const push = (a: number, b: number) => { if (b > a) out.push([a, b]); };
  if (tags.includes('HR')) {
    let s = 0;
    tags.forEach((t, i) => { if (t === 'HR') { push(s, i); s = i + 1; } });
    push(s, n);
  } else if (tags.some((t, i) => (t === 'H1' || t === 'H2') && i > 0) || tags[0] === 'H1' || tags[0] === 'H2') {
    let s = 0;
    tags.forEach((t, i) => { if ((t === 'H1' || t === 'H2') && i > s) { push(s, i); s = i; } });
    push(s, n);
  } else push(0, n);
  return out;
}

export interface Slide { html: string; notes: string; line: number }

const NOTE = /^\s*notes?:\s*/i;
/** Đoạn bắt đầu bằng `Note:` (hoặc `Notes:`) mở phần ghi chú của người trình bày: đoạn đó và mọi thứ sau nó trong slide không hiện lên màn chiếu. */
const isNote = (el: Element) => el.tagName === 'P' && NOTE.test(el.textContent ?? '');

/**
 * HTML của article đã dựng → các slide (nội dung, ghi chú, dòng nguồn đầu tiên để mở đúng slide đang soạn).
 * Ghi chú `Note:` chỉ tách khi tài liệu chia slide bằng `---` (đã chủ ý làm slide): tài liệu thường chia theo heading
 * hay có đoạn mở đầu "Note: …", không được giấu mất nội dung đó.
 */
export function splitSlides(html: string): Slide[] {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const kids = Array.from(body.children);
  const tags = kids.map((k) => k.tagName);
  const deck = tags.includes('HR');
  return slideRanges(tags).map(([a, b]) => {
    const els = kids.slice(a, b);
    const cut = deck ? els.findIndex(isNote) : -1;
    const show = cut < 0 ? els : els.slice(0, cut);
    const notes = cut < 0 ? [] : els.slice(cut);
    if (notes[0]) {
      // bỏ chữ "Note:" ở đầu: nằm trong nút chữ đầu tiên của đoạn
      const w = body.ownerDocument.createTreeWalker(notes[0], NodeFilter.SHOW_TEXT);
      const t = w.nextNode();
      if (t && t.textContent) t.textContent = t.textContent.replace(NOTE, '');
    }
    const line = Number(els.find((e) => e.getAttribute('data-line'))?.getAttribute('data-line') ?? 0);
    return { html: show.map((k) => k.outerHTML).join(''), notes: notes.map((k) => k.outerHTML).join(''), line };
  });
}

/** Slide chứa dòng nguồn `ln`: slide cuối cùng bắt đầu ở hoặc trước dòng đó. */
export function slideAtLine(slides: Slide[], ln: number): number {
  let k = 0;
  slides.forEach((s, i) => { if (s.line && s.line <= ln) k = i; });
  return k;
}
