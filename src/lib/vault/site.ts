/**
 * Vault Markdown -> site tĩnh (zip). Chỉ link tương đối, không fetch, không ES module, nên mở được cả từ file://.
 * Không import pipeline.ts của studio (kéo theo shiki): chỉ dùng slug.ts và tự copy regex front matter.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { SKIP, visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';
import { strToU8, zipSync } from 'fflate';
import type { Element, Root as HastRoot } from 'hast';
import type { Root, RootContent, Parent, Paragraph } from 'mdast';
import { idMaker, plainHeading } from '../studio/slug';
import { WIKI_RE_SRC, buildResolver, findWikilinks, isFileTarget, parseWikiInner } from './wikilink';
import { SITE_CSS, SITE_JS } from './site-assets';
import { blockOf, embedSize, headText, isImagePath, safeImageBytes, sectionOf } from './embed';

export interface SiteNote { path: string; text: string }
/** Ảnh mang theo của vault (byte thật), xuất vào `assets/img/`. */
export interface SiteImage { path: string; bytes: Uint8Array }
export interface BrokenLink { from: string; line: number; target: string; kind: 'note' | 'heading' | 'file' }
export interface SiteOptions { title: string; baseUrl?: string | undefined; now: Date }

const MD_EXT = /\.(md|markdown)$/i;
const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ---------- đường dẫn trang ----------

const slugSeg = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';

const slugPath = (notePath: string): string => {
  const segs = notePath.split('/').filter(Boolean);
  const last = (segs.pop() ?? '').replace(MD_EXT, '');
  return [...segs.map(slugSeg), slugSeg(last)].join('/');
};

/** 'Projects/My Note.md' -> 'projects/my-note.html' */
export function htmlPathOf(notePath: string): string {
  return slugPath(notePath) + '.html';
}

/** Đường dẫn note -> đường dẫn .html; trùng thì thêm -2, -3 (xác định vì sắp đường dẫn trước). `index.html` dành cho trang chủ. */
export function pageMap(paths: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>(['index.html']);
  for (const p of [...new Set(paths)].sort(cmp)) {
    const stem = slugPath(p);
    let html = stem + '.html';
    for (let n = 2; used.has(html); n++) html = `${stem}-${n}.html`;
    used.add(html);
    out.set(p, html);
  }
  return out;
}

/** Đường dẫn ảnh trong vault -> `assets/img/<đường dẫn slug>.<đuôi thường>`; trùng thì thêm -2, -3. Không bao giờ ra ngoài `assets/img/`. */
export function imageMap(paths: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const p of [...new Set(paths)].sort(cmp)) {
    const segs = p.split('/').filter(Boolean);
    const last = segs.pop() ?? '';
    const dot = last.lastIndexOf('.');
    const ext = dot > 0 ? last.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const stem = 'assets/img/' + [...segs.map(slugSeg), slugSeg(dot > 0 ? last.slice(0, dot) : last)].join('/');
    let f = `${stem}.${ext || 'bin'}`;
    for (let n = 2; used.has(f); n++) f = `${stem}-${n}.${ext || 'bin'}`;
    used.add(f);
    out.set(p, f);
  }
  return out;
}

/** Đường dẫn tương đối `url` (của link/ảnh trong note `notePath`) thành đường dẫn trong vault; `null` nếu ra ngoài vault, `undefined` nếu không phải đường dẫn tương đối. */
function vaultPath(url: string, notePath: string): string | null | undefined {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return undefined;
  let p: string;
  try { p = decodeURIComponent(/^([^#?]*)/.exec(url)?.[1] ?? ''); } catch { return undefined; }
  if (!p) return undefined;
  const segs = p.startsWith('/') ? [] : dirOf(notePath).split('/').filter(Boolean);
  for (const s of p.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (!segs.length) return null; segs.pop(); } else segs.push(s);
  }
  return segs.join('/');
}

/** Ảnh Markdown `![x](đường/dẫn.png)` -> ảnh trong vault: theo đường dẫn tương đối, không có thì theo tên (như wikilink). */
function imageTarget(url: string, notePath: string, imgLower: Map<string, string>, resolve: (t: string, from?: string) => string | null): string | null | undefined {
  const v = vaultPath(url, notePath);
  if (v === undefined || !isImagePath(v || url)) return undefined;
  const hit = v ? imgLower.get(v.toLowerCase()) : undefined;
  if (hit) return hit;
  const byName = resolve(baseOf(v ?? url), notePath);
  return byName && imgLower.has(byName.toLowerCase()) ? byName : null;
}

/** URL tương đối từ trang `from` tới trang `to` (cả hai là đường dẫn trong zip). */
function relUrl(from: string, to: string): string {
  const a = dirOf(from).split('/').filter(Boolean);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return '../'.repeat(a.length - i) + b.slice(i).join('/');
}

const prefixOf = (page: string): string => '../'.repeat(page.split('/').length - 1);

// ---------- tách front matter, tiêu đề, heading ----------

/** Copy nhỏ của splitFrontMatter (pipeline.ts kéo shiki nên không import): body giữ số dòng. */
function splitFm(src: string): { title: string | undefined; body: string } {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { title: undefined, body: src };
  let title: string | undefined;
  try {
    const d = parseYaml(m[1] ?? '') as unknown;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const t = (d as Record<string, unknown>)['title'];
      if (typeof t === 'string' || typeof t === 'number') title = String(t).trim() || undefined;
    }
  } catch { /* YAML hỏng: bỏ qua tiêu đề */ }
  return { title, body: '\n'.repeat(m[0].split('\n').length - 1) + src.slice(m[0].length) };
}

interface Heads { ids: Set<string>; byText: Map<string, string>; h1: string | undefined }

/** Quét heading ngoài code fence theo đúng cách editor cấp id (idMaker + plainHeading). */
function scanHeadings(body: string): Heads {
  const ids = new Set<string>();
  const byText = new Map<string, string>();
  let h1: string | undefined;
  const nextId = idMaker();
  let fence = '';
  for (const raw of body.split(/\r?\n/)) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(raw);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; continue; }
    if (f) { fence = f[1] ?? ''; continue; }
    const h = /^ {0,3}(#{1,6})[ \t]+(.*)$/.exec(raw);
    if (!h) continue;
    const text = plainHeading(headText(h[2] ?? ''));
    const id = nextId(text);
    ids.add(id);
    if (!byText.has(text.toLowerCase())) byText.set(text.toLowerCase(), id);
    if (h[1] === '#' && h1 === undefined && text) h1 = text;
  }
  return { ids, byText, h1 };
}

interface Meta { path: string; html: string; title: string; body: string; heads: Heads }

function metaOf(n: SiteNote, html: string): Meta {
  const { title: fmTitle, body } = splitFm(n.text);
  const heads = scanHeadings(body);
  return { path: n.path, html, title: fmTitle ?? heads.h1 ?? baseOf(n.path).replace(MD_EXT, ''), body, heads };
}

// ---------- kiểm tra vault ----------

export function checkVault(notes: SiteNote[], imagePaths: string[] = []): { broken: BrokenLink[]; notes: number; links: number } {
  const resolve = buildResolver([...notes.map((n) => n.path), ...imagePaths]);
  const imgLower = new Map(imagePaths.map((p) => [p.toLowerCase(), p] as const));
  const bodies = new Map(notes.map((n) => [n.path, splitFm(n.text).body] as const));
  const heads = new Map<string, Heads>();
  for (const n of notes) heads.set(n.path, scanHeadings(splitFm(n.text).body));
  const broken: BrokenLink[] = [];
  const byLower = new Map(notes.map((n) => [n.path.toLowerCase(), n.path]));
  let links = 0;
  for (const n of [...notes].sort((a, b) => cmp(a.path, b.path))) {
    for (const l of mdLinksOf(n.text)) { // link .md thường: không có note đích thì trang xuất ra trỏ vào chỗ trống
      const to = mdTarget(l.url, n.path, byLower);
      if (to === undefined) continue;
      links++;
      if (to === null) broken.push({ from: n.path, line: l.line, target: l.url, kind: 'note' });
    }
    for (const l of mdImagesOf(n.text)) { // ảnh Markdown tương đối: phải có trong vault
      const to = imageTarget(l.url, n.path, imgLower, resolve);
      if (to === undefined) continue;
      links++;
      if (to === null) broken.push({ from: n.path, line: l.line, target: l.url, kind: 'file' });
    }
    for (const r of findWikilinks(n.text)) {
      links++;
      const file = isFileTarget(r.target);
      const to = r.target ? resolve(r.target, n.path) : n.path;
      if (r.embed && file && !(to && imgLower.has(to.toLowerCase()))) { broken.push({ from: n.path, line: r.line, target: r.target, kind: 'file' }); continue; }
      if (!to) { broken.push({ from: n.path, line: r.line, target: r.target, kind: file ? 'file' : 'note' }); continue; }
      if (r.heading && !file) {
        const h = heads.get(to);
        const missing = r.heading.startsWith('^')
          ? blockOf(bodies.get(to) ?? '', r.heading.slice(1)) === null
          : !!h && !h.byText.has(plainHeading(r.heading).toLowerCase()) && !h.ids.has(r.heading);
        if (missing) broken.push({ from: n.path, line: r.line, target: `${r.target}#${r.heading}`, kind: 'heading' });
      }
    }
  }
  return { broken, notes: notes.length, links };
}

// ---------- dựng trang ----------

const parser = unified().use(remarkParse).use(remarkGfm);

interface Ctx {
  /** Đường dẫn .html của trang đang dựng. */
  page: string;
  notePath: string;
  resolve: (t: string, from?: string) => string | null;
  metas: Map<string, Meta>;
  byLower: Map<string, string>;
  outgoing: Set<string>;
  /** Ảnh trong vault -> file trong zip (`assets/img/…`). */
  imgOut: Map<string, string>;
  imgLower: Map<string, string>;
}

// Nút mdast tự định nghĩa: remark-rehype dựng theo data.hName / data.hProperties
type Custom = { type: string; data: { hName: string; hProperties: Record<string, unknown> }; children: RootContent[] };
const custom = (hName: string, hProperties: Record<string, unknown>, children: unknown[]): RootContent =>
  ({ type: 'wikiNode', data: { hName, hProperties }, children }) as unknown as RootContent;
const isEmbedBlock = (n: unknown): boolean => (n as Custom).type === 'wikiNode' && (n as Custom).data.hName === 'aside';

const textNode = (value: string): RootContent => ({ type: 'text', value });
const linkNode = (url: string, note: string, label: string): RootContent =>
  ({ type: 'link', url, title: null, data: { hProperties: { className: ['wl'], dataNote: note } }, children: [{ type: 'text', value: label }] }) as RootContent;
const brokenNode = (label: string, title: string): RootContent => custom('span', { className: ['wl', 'wl-broken'], title }, [textNode(label)]);

/** Link Markdown thường tới file .md: đường dẫn note trong vault, `null` nếu không có note đó, `undefined` nếu không phải link .md tương đối. */
function mdTarget(url: string, notePath: string, byLower: Map<string, string>): string | null | undefined {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return undefined;
  const m = /^([^#?]*)/.exec(url);
  let p: string;
  try { p = decodeURIComponent(m?.[1] ?? ''); } catch { return undefined; }
  if (!MD_EXT.test(p)) return undefined;
  const segs = p.startsWith('/') ? [] : dirOf(notePath).split('/').filter(Boolean);
  for (const s of p.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (!segs.length) return null; segs.pop(); } else segs.push(s);
  }
  return byLower.get(segs.join('/').toLowerCase()) ?? null;
}

/** Link `[x](note.md)` trong văn bản (bỏ code rào và code inline), kèm số dòng, cho checkVault. */
function mdLinksOf(text: string): { url: string; line: number }[] {
  const out: { url: string; line: number }[] = [];
  let fence = '';
  text.split('\n').forEach((raw, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
    if (fence) { if (f && f[1]!.startsWith(fence)) fence = ''; return; }
    if (f) { fence = f[1]!; return; }
    const line = raw.replace(/(`+)[^`]*?\1/g, '');
    for (const m of line.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ url: m[1]!, line: i + 1 });
  });
  return out;
}

/** Ảnh `![x](url)` trong văn bản (bỏ code), kèm số dòng, cho checkVault. */
function mdImagesOf(text: string): { url: string; line: number }[] {
  const out: { url: string; line: number }[] = [];
  let fence = '';
  text.split('\n').forEach((raw, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
    if (fence) { if (f && f[1]!.startsWith(fence)) fence = ''; return; }
    if (f) { fence = f[1]!; return; }
    const line = raw.replace(/(`+)[^`]*?\1/g, '');
    for (const m of line.matchAll(/!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ url: m[1]!, line: i + 1 });
  });
  return out;
}

/** Link Markdown thường tới file .md khác trong vault -> URL .html tương đối. */
function rewriteMdUrl(url: string, c: Ctx): string | null {
  const hit = mdTarget(url, c.notePath, c.byLower);
  if (!hit) return null;
  const m = /^([^#?]*)([?#].*)?$/.exec(url);
  const meta = c.metas.get(hit);
  if (!meta) return null;
  if (hit !== c.notePath) c.outgoing.add(hit);
  const frag = m?.[2]?.startsWith('#') ? m[2] : '';
  return (hit === c.notePath && frag ? '' : relUrl(c.page, meta.html)) + frag;
}

/** Biến `[[…]]` trong text node thành link/span, `![[…]]` thành khối nhúng; sửa link .md. */
function transform(tree: Root, c: Ctx, inEmbed: boolean): void {
  visit(tree, (node, index, parent) => {
    if (node.type === 'image') {
      const hit = imageTarget(node.url, c.notePath, c.imgLower, c.resolve);
      const out = hit ? c.imgOut.get(hit) : undefined;
      if (out) node.url = relUrl(c.page, out);
      return undefined;
    }
    if (node.type === 'link' || node.type === 'definition') {
      const to = rewriteMdUrl(node.url, c);
      if (to !== null) node.url = to;
      return node.type === 'link' ? SKIP : undefined;
    }
    if (node.type !== 'text' || !parent || index === undefined || !node.value.includes('[[')) return undefined;
    const out: RootContent[] = [];
    const re = new RegExp(WIKI_RE_SRC, 'g');
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(node.value))) {
      const p = parseWikiInner(m[2] ?? '');
      if (!p) continue;
      if (m.index > last) out.push(textNode(node.value.slice(last, m.index)));
      last = m.index + m[0].length;
      out.push(wikiNode(m[1] === '!', p, c, inEmbed));
    }
    if (!last) return undefined;
    if (last < node.value.length) out.push(textNode(node.value.slice(last)));
    (parent as Parent).children.splice(index, 1, ...out);
    return [SKIP, index + out.length];
  });
  // khối nhúng không được nằm trong <p>: tách đoạn quanh nó
  visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
    if (!parent || index === undefined || !node.children.some(isEmbedBlock)) return undefined;
    const segs: RootContent[] = [];
    let run: Paragraph['children'] = [];
    const flush = (): void => {
      if (run.some((n) => n.type !== 'text' || n.value.trim())) segs.push({ type: 'paragraph', children: run });
      run = [];
    };
    for (const ch of node.children) {
      if (isEmbedBlock(ch)) { flush(); segs.push(ch as unknown as RootContent); } else run.push(ch);
    }
    flush();
    (parent as Parent).children.splice(index, 1, ...segs);
    return [SKIP, index + segs.length];
  });
}

function wikiNode(embed: boolean, p: { target: string; heading?: string | undefined; alias?: string | undefined }, c: Ctx, inEmbed: boolean): RootContent {
  const shown = p.alias ?? (p.target && p.heading ? `${p.target} › ${p.heading}` : p.target || p.heading || '');
  if (embed && isFileTarget(p.target)) {
    const hit = c.resolve(p.target, c.notePath);
    const out = hit ? c.imgOut.get(hit) : undefined;
    if (!hit || !out) return brokenNode(`${p.target} (not included)`, isImagePath(p.target) ? 'Image not in the vault' : 'File not included in the export');
    const sz = embedSize(p.heading ? undefined : p.alias);
    const alt = sz.alt ?? baseOf(hit).replace(/\.[^.]*$/, '');
    return custom('img', { src: relUrl(c.page, out), alt, ...(sz.width ? { width: sz.width } : {}), ...(sz.height ? { height: sz.height } : {}), loading: 'lazy' }, []);
  }
  const to = p.target ? c.resolve(p.target, c.notePath) : c.notePath;
  const meta = to ? c.metas.get(to) : undefined;
  if (!to || !meta) return brokenNode(shown, 'Missing note');
  if (to !== c.notePath) c.outgoing.add(to);
  if (embed) {
    const label = p.alias ?? meta.title;
    if (inEmbed) return linkNode(relUrl(c.page, meta.html), meta.html, label); // không nhúng đệ quy
    let part = meta.body;
    if (p.heading) {
      const cut = p.heading.startsWith('^') ? blockOf(meta.body, p.heading.slice(1)) : sectionOf(meta.body, p.heading);
      if (cut === null) return brokenNode(shown, p.heading.startsWith('^') ? 'Missing block' : 'Missing heading');
      part = cut;
    }
    const sub = parser.parse(part);
    transform(sub, { ...c, notePath: to }, true);
    const head = custom('div', { className: ['embed-h'] }, [linkNode(relUrl(c.page, meta.html), meta.html, meta.title)]);
    return custom('aside', { className: ['embed'] }, [head, ...sub.children]);
  }
  let id = '';
  if (p.heading) {
    const want = plainHeading(p.heading).toLowerCase();
    id = meta.heads.byText.get(want) ?? (meta.heads.ids.has(p.heading) ? p.heading : '');
  }
  const url = id ? (meta.html === c.page ? '' : relUrl(c.page, meta.html)) + '#' + id : relUrl(c.page, meta.html);
  return linkNode(url, meta.html, shown);
}

const SAFE_URL = /^(https?:|mailto:)/i;
const textOf = (n: { type: string; value?: string; children?: unknown[] }): string =>
  n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map((ch) => textOf(ch as never)).join('');

/** Lọc href/src (http, https, mailto, #, tương đối) và cấp id heading như editor; heading trong khối nhúng không lấy id. */
function rehypeSite() {
  return (tree: HastRoot) => {
    const nextId = idMaker();
    const walk = (node: HastRoot | Element, inEmbed: boolean): void => {
      for (const ch of node.children) {
        if (ch.type !== 'element') continue;
        const props = ch.properties;
        for (const k of ['href', 'src'] as const) {
          const v = props[k];
          if (typeof v !== 'string') continue;
          const s = v.replace(/[\u0000- \u007f-\u009f]/g, '');
          const scheme = /^[a-z][a-z0-9+.-]*:/i.test(s);
          if ((scheme && !SAFE_URL.test(s)) || s.startsWith('//')) delete props[k];
        }
        const cls = props['className'];
        const embed = inEmbed || (ch.tagName === 'aside' && Array.isArray(cls) && cls.includes('embed'));
        if (/^h[1-6]$/.test(ch.tagName) && !embed && props['id'] === undefined) props['id'] = nextId(textOf(ch));
        walk(ch, embed);
      }
    };
    walk(tree, false);
  };
}

async function renderBody(tree: Root): Promise<string> {
  const p = unified().use(remarkRehype).use(rehypeSite).use(rehypeStringify);
  return String(p.stringify((await p.run(tree)) as HastRoot));
}

/** Văn bản thuần của note (bỏ code, heading) để làm đoạn trích. */
function plainText(n: { type: string; value?: string; alt?: string | null; children?: unknown[] }): string {
  switch (n.type) {
    case 'text': case 'inlineCode': return n.value ?? '';
    case 'image': return n.alt ?? '';
    case 'code': case 'heading': case 'html': case 'yaml': case 'definition': case 'thematicBreak': return '';
    case 'break': return ' ';
  }
  const inner = (n.children ?? []).map((ch) => plainText(ch as never)).join('');
  return ['paragraph', 'listItem', 'tableCell', 'tableRow', 'blockquote'].includes(n.type) ? inner + ' ' : inner;
}

function excerptOf(body: string): string {
  const t = plainText(parser.parse(body))
    .replace(new RegExp(WIKI_RE_SRC, 'g'), (_s, bang: string, inner: string) => {
      const p = parseWikiInner(inner);
      return bang || !p ? '' : (p.alias ?? (p.target || p.heading || ''));
    })
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

interface PageArgs { title: string; siteTitle: string; desc: string; page: string; baseUrl: string | undefined; ogType: string; body: string }

function doc(a: PageArgs, backlinks: string): string {
  const pre = prefixOf(a.page);
  const url = a.baseUrl ? a.baseUrl + '/' + (a.page === 'index.html' ? '' : a.page) : '';
  const full = a.page === 'index.html' ? a.siteTitle : `${a.title} · ${a.siteTitle}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(a.desc)}">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(a.desc)}">
<meta property="og:type" content="${a.ogType}">
<meta property="og:site_name" content="${esc(a.siteTitle)}">
${url ? `<meta property="og:url" content="${esc(url)}">\n<link rel="canonical" href="${esc(url)}">\n` : ''}<link rel="stylesheet" href="${pre}assets/site.css">
</head>
<body>
<header class="site-h"><a href="${pre}index.html">${esc(a.siteTitle)}</a></header>
${a.body}${backlinks}
<footer class="site-f">Exported with mdprev</footer>
<script src="${pre}assets/previews.js"></script><script src="${pre}assets/site.js"></script>
</body>
</html>
`;
}

export async function buildSite(notes: SiteNote[], opts: SiteOptions, images: SiteImage[] = []): Promise<{ files: Record<string, string>; binary: Record<string, Uint8Array>; broken: BrokenLink[] }> {
  const imgs = images.filter((i) => isImagePath(i.path) && safeImageBytes(i.path, i.bytes)); // SVG không an toàn hay file đổi đuôi: không xuất
  const sorted = [...notes].sort((a, b) => cmp(a.path, b.path));
  const pages = pageMap(sorted.map((n) => n.path));
  const metas = new Map<string, Meta>();
  for (const n of sorted) metas.set(n.path, metaOf(n, pages.get(n.path) ?? htmlPathOf(n.path)));
  const resolve = buildResolver([...sorted.map((n) => n.path), ...imgs.map((i) => i.path)]);
  const byLower = new Map(sorted.map((n) => [n.path.toLowerCase(), n.path] as const));
  const imgOut = imageMap(imgs.map((i) => i.path));
  const imgLower = new Map(imgs.map((i) => [i.path.toLowerCase(), i.path] as const));
  const baseUrl = opts.baseUrl?.trim().replace(/\/+$/, '') || undefined;

  const bodies = new Map<string, string>();
  const backlinks = new Map<string, Set<string>>();
  for (const n of sorted) {
    const meta = metas.get(n.path);
    if (!meta) continue;
    const outgoing = new Set<string>();
    const tree = parser.parse(meta.body);
    transform(tree, { page: meta.html, notePath: n.path, resolve, metas, byLower, outgoing, imgOut, imgLower }, false);
    const html = await renderBody(tree);
    bodies.set(n.path, (meta.heads.h1 === undefined ? `<h1 class="doc-title">${esc(meta.title)}</h1>\n` : '') + html);
    for (const to of outgoing) {
      const s = backlinks.get(to);
      if (s) s.add(n.path); else backlinks.set(to, new Set([n.path]));
    }
  }

  const files: Record<string, string> = {};
  const previews: Record<string, { t: string; x: string }> = {};
  for (const n of sorted) {
    const meta = metas.get(n.path);
    if (!meta) continue;
    const ex = excerptOf(meta.body);
    previews[meta.html] = { t: meta.title, x: clip(ex, 300) };
    const from = [...(backlinks.get(n.path) ?? [])]
      .map((p) => metas.get(p))
      .filter((m): m is Meta => !!m)
      .sort((a, b) => a.title.localeCompare(b.title, 'en') || cmp(a.path, b.path));
    const bl = from.length
      ? `\n<aside class="backlinks"><h2>Linked from</h2><ul>${from.map((m) => `<li><a class="wl" href="${esc(relUrl(meta.html, m.html))}" data-note="${esc(m.html)}">${esc(m.title)}</a></li>`).join('')}</ul></aside>`
      : '';
    files[meta.html] = doc({ title: meta.title, siteTitle: opts.title, desc: clip(ex, 160) || meta.title, page: meta.html, baseUrl, ogType: 'article', body: `<main class="md-doc">\n${bodies.get(n.path) ?? ''}</main>` }, bl);
  }

  files['index.html'] = doc({ title: opts.title, siteTitle: opts.title, desc: `${sorted.length} notes`, page: 'index.html', baseUrl, ogType: 'website', body: indexBody(sorted.map((n) => metas.get(n.path)).filter((m): m is Meta => !!m), opts.title) }, '');
  files['assets/site.css'] = SITE_CSS;
  files['assets/site.js'] = SITE_JS;
  // `<` thoát thành < để `</script>` không thể xuất hiện trong file; U+2028/2029 cũng thoát cho chắc
  files['assets/previews.js'] = 'window.MDPREV_PREVIEWS = ' + JSON.stringify(previews).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n';
  if (baseUrl) {
    const day = opts.now.toISOString().slice(0, 10);
    const urls = ['', ...sorted.map((n) => metas.get(n.path)?.html ?? '')].filter((u, i) => i === 0 || u);
    files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(baseUrl + '/' + u)}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`;
    files['robots.txt'] = `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
  }
  const binary: Record<string, Uint8Array> = {};
  for (const i of imgs) { const o = imgOut.get(i.path); if (o) binary[o] = i.bytes; }
  return { files, binary, broken: checkVault(notes, imgs.map((i) => i.path)).broken };
}

function indexBody(metas: Meta[], siteTitle: string): string {
  const groups = new Map<string, Meta[]>();
  for (const m of metas) {
    const d = dirOf(m.path);
    const g = groups.get(d);
    if (g) g.push(m); else groups.set(d, [m]);
  }
  const sections = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : cmp(a.toLowerCase(), b.toLowerCase()))).map((d) => {
    const items = (groups.get(d) ?? []).sort((a, b) => a.title.localeCompare(b.title, 'en') || cmp(a.path, b.path));
    return `<section>\n<h2>${esc(d || 'Top level')}<span class="count">${items.length}</span></h2>\n<ul>${items.map((m) => `<li><a class="wl" href="${esc(m.html)}" data-note="${esc(m.html)}">${esc(m.title)}</a></li>`).join('')}</ul>\n</section>`;
  });
  return `<main class="idx">\n<h1>${esc(siteTitle)}</h1>\n<p class="sub">${metas.length} ${metas.length === 1 ? 'note' : 'notes'}</p>\n${sections.join('\n')}\n</main>`;
}

export async function buildSiteZip(notes: SiteNote[], opts: SiteOptions, images: SiteImage[] = []): Promise<{ zip: Uint8Array; broken: BrokenLink[]; pages: number; images: number }> {
  const { files, binary, broken } = await buildSite(notes, opts, images);
  const data: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  for (const [k, v] of Object.entries(files)) data[k] = strToU8(v);
  for (const [k, v] of Object.entries(binary)) data[k] = [v, { level: 0 }]; // ảnh đã nén sẵn: không nén lại
  const pages = Object.keys(files).filter((k) => k.endsWith('.html')).length;
  return { zip: zipSync(data, { mtime: opts.now }), broken, pages, images: Object.keys(binary).length };
}
