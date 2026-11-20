/**
 * Wikilink trong bản xem của vault (chạy trong worker dựng Markdown, chỉ nạp khi workspace là vault).
 * `[[note]]` thành link mở note trong workspace (`data-wl`), `![[ảnh]]` và ảnh Markdown tương đối thành ảnh `asset:<id>`
 * (luồng chính đổi thành blob URL như ảnh dán), `![[note#heading]]` / `![[note#^block]]` nhúng đúng phần đó.
 * Phần nhúng không mang vị trí nguồn (không `data-line`, không id heading) để nhấp vào bản xem không nhảy nhầm dòng.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { SKIP, visit } from 'unist-util-visit';
import type { Parent, Paragraph, Root, RootContent } from 'mdast';
import { idMaker, plainHeading } from '../studio/slug';
import { WIKI_RE_SRC, buildResolver, isFileTarget, parseWikiInner } from './wikilink';
import { blockOf, embedSize, headText, isImagePath, sectionOf } from './embed';

export interface VaultCtx {
  /** Đổi khi danh sách note/ảnh hay nội dung các note khác đổi: worker giữ bản đã nhận theo khoá này. */
  key: string;
  /** Note đang mở (nội dung của nó là văn bản đang dựng). */
  self: string;
  /** Các note khác. */
  notes: { path: string; text: string }[];
  images: { path: string; id: string }[];
}

interface Prepared { resolve: (t: string, from?: string) => string | null; texts: Map<string, string>; imgId: Map<string, string>; imgLower: Map<string, string> }
let cache: { key: string; p: Prepared } | null = null;

function prepare(ctx: VaultCtx): Prepared {
  if (cache?.key === ctx.key) return cache.p;
  const texts = new Map(ctx.notes.map((n) => [n.path, n.text] as const));
  const p: Prepared = {
    resolve: buildResolver([ctx.self, ...ctx.notes.map((n) => n.path), ...ctx.images.map((i) => i.path)]),
    texts,
    imgId: new Map(ctx.images.map((i) => [i.path, i.id] as const)),
    imgLower: new Map(ctx.images.map((i) => [i.path.toLowerCase(), i.path] as const)),
  };
  cache = { key: ctx.key, p };
  return p;
}

const FM = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const bodyOf = (t: string) => t.replace(FM, '');
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const titleOf = (path: string) => baseOf(path).replace(/\.(md|markdown)$/i, '');

/** id của heading `h` trong `body`, cấp như bản xem (idMaker theo thứ tự xuất hiện). */
function headingId(body: string, h: string): string {
  const want = plainHeading(h).toLowerCase();
  const next = idMaker();
  let fence = '';
  for (const raw of body.split(/\r?\n/)) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(raw);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; continue; }
    if (f) { fence = f[1] ?? ''; continue; }
    const m = /^ {0,3}#{1,6}[ \t]+(.*)$/.exec(raw);
    if (!m) continue;
    const text = plainHeading(headText(m[1] ?? ''));
    const id = next(text);
    if (text.toLowerCase() === want || id === h) return id;
  }
  return '';
}

const sub = unified().use(remarkParse).use(remarkGfm);
const node = (hName: string, hProperties: Record<string, unknown>, children: unknown[]): RootContent =>
  ({ type: 'wikiNode', data: { hName, hProperties }, children }) as unknown as RootContent;
const text = (value: string): RootContent => ({ type: 'text', value });
const broken = (label: string, title: string) => node('span', { className: ['wl', 'wl-broken'], title }, [text(label)]);
const isEmbed = (n: unknown) => (n as { type: string; data?: { hName?: string } }).type === 'wikiNode' && (n as { data: { hName: string } }).data.hName === 'aside';
const strip = (n: { position?: unknown; children?: unknown[] }): void => { delete n.position; n.children?.forEach((c) => strip(c as never)); };

/** Ảnh Markdown tương đối -> ảnh trong vault (theo đường dẫn, không có thì theo tên). */
function imageOf(url: string, from: string, p: Prepared): string | null {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return null;
  let path: string;
  try { path = decodeURIComponent(url.replace(/[?#].*$/, '')); } catch { return null; }
  if (!isImagePath(path)) return null;
  const segs = path.startsWith('/') ? [] : dirOf(from).split('/').filter(Boolean);
  for (const s of path.split('/')) { if (s === '..') segs.pop(); else if (s && s !== '.') segs.push(s); }
  const hit = p.imgLower.get(segs.join('/').toLowerCase());
  if (hit) return hit;
  const byName = p.resolve(baseOf(path), from);
  return byName && p.imgId.has(byName) ? byName : null;
}

function transform(tree: Root, ctx: VaultCtx, p: Prepared, src: string, from: string, inEmbed: boolean): void {
  visit(tree, (n, index, parent) => {
    if (n.type === 'image') {
      const hit = imageOf(n.url, from, p);
      const id = hit ? p.imgId.get(hit) : undefined;
      if (id) n.url = 'asset:' + id;
      return undefined;
    }
    if (n.type === 'link' || n.type === 'inlineCode' || n.type === 'code') return SKIP;
    if (n.type !== 'text' || !parent || index === undefined || !n.value.includes('[[')) return undefined;
    const out: RootContent[] = [];
    const re = new RegExp(WIKI_RE_SRC, 'g');
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(n.value))) {
      const w = parseWikiInner(m[2] ?? '');
      if (!w) continue;
      if (m.index > last) out.push(text(n.value.slice(last, m.index)));
      last = m.index + m[0].length;
      out.push(wiki(m[1] === '!', w, ctx, p, src, from, inEmbed));
    }
    if (!last) return undefined;
    if (last < n.value.length) out.push(text(n.value.slice(last)));
    (parent as Parent).children.splice(index, 1, ...out);
    return [SKIP, index + out.length];
  });
  visit(tree, 'paragraph', (para: Paragraph, index, parent) => { // khối nhúng không nằm trong <p>
    if (!parent || index === undefined || !para.children.some(isEmbed)) return undefined;
    const segs: RootContent[] = [];
    let run: Paragraph['children'] = [];
    const flush = () => { if (run.some((c) => c.type !== 'text' || c.value.trim())) segs.push({ type: 'paragraph', children: run }); run = []; };
    for (const c of para.children) { if (isEmbed(c)) { flush(); segs.push(c as unknown as RootContent); } else run.push(c); }
    flush();
    (parent as Parent).children.splice(index, 1, ...segs);
    return [SKIP, index + segs.length];
  });
}

function wiki(embed: boolean, w: { target: string; heading?: string | undefined; alias?: string | undefined }, ctx: VaultCtx, p: Prepared, src: string, from: string, inEmbed: boolean): RootContent {
  const shown = w.alias ?? (w.target && w.heading ? `${w.target} › ${w.heading}` : w.target || w.heading || '');
  if (embed && isFileTarget(w.target)) {
    const hit = p.resolve(w.target, from);
    const id = hit ? p.imgId.get(hit) : undefined;
    if (!hit || !id) return broken(w.target, isImagePath(w.target) ? 'Image not in the vault' : 'Only images can be embedded');
    const sz = embedSize(w.alias);
    return node('img', { src: 'asset:' + id, alt: sz.alt ?? baseOf(hit).replace(/\.[^.]*$/, ''), ...(sz.width ? { width: sz.width } : {}), ...(sz.height ? { height: sz.height } : {}) }, []);
  }
  const to = w.target ? p.resolve(w.target, from) : from;
  const body = !to ? undefined : to === ctx.self ? src : p.texts.get(to);
  if (!to || body === undefined) return broken(shown, 'Missing note');
  const b = bodyOf(body);
  const block = w.heading?.startsWith('^');
  if (embed) {
    const link = node('a', { href: '#', className: ['wl'], dataWl: to }, [text(titleOf(to))]);
    if (inEmbed || (to === from && !w.heading)) return node('a', { href: '#', className: ['wl'], dataWl: to }, [text(w.alias ?? titleOf(to))]); // không nhúng đệ quy
    let part = b;
    if (w.heading) {
      const cut = block ? blockOf(b, w.heading.slice(1)) : sectionOf(b, w.heading);
      if (cut === null) return broken(shown, block ? 'Missing block' : 'Missing heading');
      part = cut;
    }
    const t = sub.parse(part);
    strip(t);
    transform(t, ctx, p, src, to, true);
    return node('aside', { className: ['embed'] }, [node('div', { className: ['embed-h'] }, [link]), ...t.children]);
  }
  let hid = '';
  if (w.heading && !block) {
    hid = headingId(b, w.heading);
    if (!hid) return broken(shown, 'Missing heading');
  }
  return node('a', { href: '#', className: ['wl'], dataWl: to, ...(hid ? { dataWh: hid } : {}) }, [text(shown)]);
}

/** Plugin remark: `ctx` là vault hiện tại, `src` là văn bản đang dựng (note `ctx.self`). */
export function remarkVault(this: unknown, opts: { ctx: VaultCtx; src: string }) {
  return (tree: Root) => {
    const p = prepare(opts.ctx);
    transform(tree, opts.ctx, p, bodyOf(opts.src), opts.ctx.self, false);
  };
}
