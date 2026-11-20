/**
 * HTML thô trong Markdown bị bỏ (pipeline không bật allowDangerousHtml); riêng vài thẻ trần, vô hại, rất hay dùng thì được giữ lại:
 * `<kbd>`, `<sub>`, `<sup>`, `<mark>`, `<br>`, và `<details>` (+ `open`) với `<summary>chữ thuần</summary>`.
 *
 * An toàn: chỉ khớp thẻ trần KHÔNG thuộc tính (ngoại lệ duy nhất: `open` của details), không phân biệt hoa thường, đầu ra luôn là phần tử
 * dựng bằng tay (tên thẻ cố định, không thuộc tính tuỳ ý). Một khối HTML mà ngoài các thẻ ấy còn thứ gì khác (thẻ khác, thuộc tính, chữ
 * ngoài summary) thì cả khối hiện thành chữ thường đã thoát (không âm thầm mất, cũng không thành phần tử). Khối không có thẻ nào trong
 * danh sách thì giữ nguyên hành vi cũ (bị bỏ).
 */
import type { Root, Parent, Content } from 'mdast';
import type { Processor } from 'unified';

type Tok = { k: 'open'; tag: string; attr: boolean } | { k: 'close'; tag: string } | { k: 'br' } | { k: 'summary'; text: string } | { k: 'text'; text: string };
const TAG = /<(\/?)(kbd|sub|sup|mark|br|details|summary)(\s+open)?\s*(\/?)>/gi;
const BLOCK_PARENTS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition']);

/** Phân tích giá trị một nút html. `none`: không có thẻ cho phép (giữ hành vi cũ); `bad`: lẫn thứ khác (hiện thành chữ). */
function tokenize(v: string): Tok[] | 'none' | 'bad' {
  const toks: Tok[] = [];
  let last = 0, inSummary = false, sum = '', any = false;
  TAG.lastIndex = 0;
  for (let m = TAG.exec(v); m; m = TAG.exec(v)) {
    any = true;
    const gap = v.slice(last, m.index);
    const closing = m[1] === '/', tag = m[2]!.toLowerCase(), openAttr = !!m[3], selfClose = m[4] === '/';
    if (inSummary) { if (gap.includes('<')) return 'bad'; sum += gap; } else if (gap.trim()) { if (gap.includes('<')) return 'bad'; toks.push({ k: 'text', text: gap }); } // chữ thuần giữa các thẻ (ví dụ <details><summary>…</summary>nội dung</details> trên một dòng) thành nút text, tự thoát
    last = m.index + m[0].length;
    if (openAttr && (tag !== 'details' || closing)) return 'bad'; // `open` chỉ cho details mở
    if (tag === 'summary') {
      if (!closing) { if (inSummary || selfClose) return 'bad'; inSummary = true; sum = ''; }
      else if (inSummary) { toks.push({ k: 'summary', text: sum.replace(/\s+/g, ' ').trim() }); inSummary = false; }
      continue;
    }
    if (inSummary) return 'bad'; // thẻ khác lọt vào trong summary
    if (tag === 'br') { if (!closing) toks.push({ k: 'br' }); continue; }
    if (selfClose) return 'bad';
    toks.push(closing ? { k: 'close', tag } : { k: 'open', tag, attr: openAttr });
  }
  if (!any) return 'none';
  if (inSummary) return 'bad';
  const tail = v.slice(last);
  if (tail.trim()) { if (tail.includes('<')) return 'bad'; toks.push({ k: 'text', text: tail }); }
  return toks;
}

type Mark = { type: 'safeOpen'; tag: string; attr: boolean } | { type: 'safeClose'; tag: string };
const el = (tag: string, props: Record<string, unknown>, children: unknown[]): Content => ({ type: 'safeEl', data: { hName: tag, hProperties: props }, children } as unknown as Content);

/** Ghép các dấu mở/đóng cùng cấp thành phần tử; thiếu thẻ đóng thì phần tử kéo tới hết nút cha, thẻ đóng lạc bị bỏ. */
function pair(children: unknown[]): Content[] {
  const out: Content[] = [];
  const stack: { tag: string; node: { children: unknown[] } }[] = [];
  const put = (n: Content) => (stack.length ? stack[stack.length - 1]!.node.children : out).push(n as never);
  for (const c of children as (Content | Mark)[]) {
    const t = (c as Mark).type;
    if (t === 'safeOpen') {
      const m = c as Mark & { type: 'safeOpen' };
      const w = el(m.tag, m.tag === 'details' && m.attr ? { open: true } : {}, []);
      put(w); stack.push({ tag: m.tag, node: w as unknown as { children: unknown[] } });
    } else if (t === 'safeClose') {
      const tag = (c as { tag: string }).tag;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.tag === tag) { stack.length = i; break; }
    } else put(c as Content);
  }
  return out;
}

type Parse = (src: string) => Root;
const shift = (n: unknown, by: number): void => { const x = n as { position?: { start: { line: number }; end: { line: number } }; children?: unknown[] }; if (x.position) { x.position.start.line += by; x.position.end.line += by; } x.children?.forEach((c) => shift(c, by)); };

/** `defer`: phần đọc lại (đuôi của một khối HTML) KHÔNG ghép cặp ở đây: thẻ đóng của nó thuộc về thẻ mở ở cấp cha, nên để cha ghép. */
function walk(node: Parent, parse: Parse, defer = false): void {
  if (!node.children) return;
  const block = BLOCK_PARENTS.has(node.type);
  const next: unknown[] = [];
  let touched = false;
  for (const c of node.children as Content[]) {
    if (c.type === 'html') {
      let value = (c as { value: string }).value;
      let toks: Tok[] | 'none' | 'bad' = 'none';
      let rest: Content[] = [];
      // Khối HTML của CommonMark chỉ kết thúc ở dòng trống, nên `</details>` dán liền với ``` hay đoạn chữ sau nó bị gộp chung một khối.
      // Cắt phần đầu gồm toàn dòng thẻ cho phép; phần còn lại là Markdown bình thường, đọc lại bằng chính bộ đọc này.
      const lines = value.split('\n');
      let i = 0;
      while (i < lines.length && Array.isArray(tokenize(lines[i]!))) i++;
      if (i > 0 && i < lines.length) {
        const t0 = tokenize(lines.slice(0, i).join('\n'));
        if (Array.isArray(t0)) {
          const tail = parse(lines.slice(i).join('\n'));
          shift(tail, (c.position?.start.line ?? 1) - 1 + i);
          walk(tail as unknown as Parent, parse, true);
          rest = tail.children as Content[];
          toks = t0; value = lines.slice(0, i).join('\n');
        } else toks = tokenize(value);
      } else toks = tokenize(value);
      if (toks === 'none') { next.push(c); continue; }
      touched = true;
      if (toks === 'bad') { // hiện nguyên văn như chữ thường (React/hast sẽ thoát)
        const text = { type: 'text', value: (c as { value: string }).value } as Content;
        next.push(block ? { type: 'paragraph', children: [text] } : text);
        continue;
      }
      for (const t of toks) {
        if (t.k === 'open') next.push({ type: 'safeOpen', tag: t.tag, attr: t.attr });
        else if (t.k === 'close') next.push({ type: 'safeClose', tag: t.tag });
        else if (t.k === 'br') next.push({ type: 'break' });
        else if (t.k === 'text') next.push({ type: 'text', value: t.text } as Content);
        else next.push(el('summary', {}, [{ type: 'text', value: t.text }]));
      }
      next.push(...rest);
    } else { walk(c as Parent, parse); next.push(c); }
  }
  if (touched) node.children = (defer ? next : pair(next)) as never;
}

/** Plugin remark: đặt sau remark-parse/gfm, trước các plugin đọc cây. Chỉ dùng cho bản xem (docx/latex không biết nút `safeEl`). */
export function remarkSafeHtml(this: Processor) {
  const parse: Parse = (s) => this.parse(s) as Root;
  return (tree: Root) => { walk(tree as unknown as Parent, parse); };
}
