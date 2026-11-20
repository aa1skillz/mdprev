/**
 * Markdown → .docx. Dựng từ cây mdast (cùng remark-parse + GFM + math như bản xem) nên nghĩa giống bản xem:
 * tiêu đề dùng style Heading 1–6 của Word (có ngăn điều hướng, mục lục), mỗi tiêu đề có bookmark để link `#id` thành link nội bộ,
 * danh sách có đánh số thật, chú thích thành footnote của Word, bảng có viền, khối code phông đơn cách có nền.
 * Công thức giữ dạng TeX (phông Cambria Math), sơ đồ Mermaid và ảnh do người gọi cung cấp dưới dạng ảnh raster.
 * Thư viện `docx` chỉ được nạp khi xuất (import động ở studio).
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { BlockContent, Definition, DefinitionContent, FootnoteDefinition, List, ListItem, PhrasingContent, Root, RootContent, Table as MdTable } from 'mdast';
import {
  AlignmentType, BorderStyle, Bookmark, Document, ExternalHyperlink, FootnoteReferenceRun, HeadingLevel, ImageRun, InternalHyperlink,
  LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, type ParagraphChild,
} from 'docx';
import { splitFrontMatter } from './frontmatter';
import { normalizeMathDelims } from './mathdelim';
import { idMaker, plainHeading } from './slug';
import { parseCallout, CALLOUTS } from './callout';

export interface DocxImage { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp'; width: number; height: number }
export interface DocxOptions {
  /** Ảnh theo URL trong Markdown (`asset:…`, http…). Null: ghi chữ thay thế và link. */
  image?: (url: string) => Promise<DocxImage | null>;
  /** Sơ đồ Mermaid (theo mã nguồn) đã raster hoá. Null: giữ mã nguồn dạng khối code. */
  diagram?: (source: string) => Promise<DocxImage | null>;
  title?: string;
}

const MONO = 'Consolas';
const CODE_FILL = 'F2EFE9';
const MAX_W = 600; // px (≈ 6,25 in ở 96 dpi), vừa lề A4/Letter mặc định
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6] as const;

const textOf = (n: { type: string; value?: string; children?: unknown[] }): string =>
  n.type === 'text' || n.type === 'inlineCode' || n.type === 'inlineMath' ? n.value ?? '' : (n.children ?? []).map((c) => textOf(c as never)).join('');

interface Marks { bold?: boolean; italics?: boolean; strike?: boolean; mono?: boolean; link?: boolean }

/** Ghi danh sách khối (đồng bộ phần lớn; ảnh và sơ đồ đã được nạp sẵn vào `imgs`). */
class Builder {
  defs = new Map<string, Definition>();
  notes = new Map<string, number>();
  noteDefs = new Map<string, FootnoteDefinition>();
  bookmarks = new Map<string, string>(); // id tiêu đề (như bản xem) → tên bookmark trong Word
  imgs = new Map<string, DocxImage | null>();
  diagrams: (DocxImage | null)[] = [];
  diagramIdx = 0;
  listInstance = 0;
  headIdx = 0;

  inline(nodes: PhrasingContent[], m: Marks = {}): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    const run = (text: string, mm: Marks) => new TextRun({ text, ...(mm.bold ? { bold: true } : {}), ...(mm.italics ? { italics: true } : {}), ...(mm.strike ? { strike: true } : {}), ...(mm.mono ? { font: MONO, shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' } } : {}), ...(mm.link ? { style: 'Hyperlink' } : {}) });
    for (const n of nodes) {
      switch (n.type) {
        case 'text': out.push(run(n.value.replace(/\s*\n\s*/g, ' '), m)); break;
        case 'strong': out.push(...this.inline(n.children, { ...m, bold: true })); break;
        case 'emphasis': out.push(...this.inline(n.children, { ...m, italics: true })); break;
        case 'delete': out.push(...this.inline(n.children, { ...m, strike: true })); break;
        case 'inlineCode': out.push(run(n.value, { ...m, mono: true })); break;
        case 'inlineMath': out.push(new TextRun({ text: n.value, font: 'Cambria Math', italics: true })); break;
        case 'break': out.push(new TextRun({ text: '', break: 1 })); break;
        case 'link': case 'linkReference': {
          const url = n.type === 'link' ? n.url : this.defs.get(n.identifier.toLowerCase())?.url ?? '';
          const kids = this.inline(n.children, { ...m, link: true }) as TextRun[];
          if (url.startsWith('#')) {
            let id = url.slice(1); try { id = decodeURIComponent(id); } catch { /* giữ nguyên */ }
            const bm = this.bookmarks.get(id);
            if (bm) out.push(new InternalHyperlink({ anchor: bm, children: kids })); else out.push(...kids);
          } else if (/^(https?:|mailto:)/i.test(url)) out.push(new ExternalHyperlink({ link: url, children: kids }));
          else out.push(...kids);
          break;
        }
        case 'image': case 'imageReference': {
          const url = n.type === 'image' ? n.url : this.defs.get(n.identifier.toLowerCase())?.url ?? '';
          const img = this.imgs.get(url);
          if (img) out.push(imageRun(img));
          else out.push(run(`[${n.alt || 'image'}]`, { ...m, italics: true }));
          break;
        }
        case 'footnoteReference': {
          const id = this.notes.get(n.identifier.toLowerCase());
          if (id) out.push(new FootnoteReferenceRun(id));
          break;
        }
        default: break; // html thô: bỏ, như bản xem
      }
    }
    return out;
  }

  blocks(nodes: (RootContent | BlockContent | DefinitionContent)[], ctx: { quote?: number } = {}): (Paragraph | Table)[] {
    const out: (Paragraph | Table)[] = [];
    // trong blockquote: thụt lề + viền trái
    const qi = ctx.quote ? { indent: { left: 360 * ctx.quote } } : {};
    const qx = ctx.quote ? { ...qi, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } } } : {};
    for (const n of nodes) {
      switch (n.type) {
        case 'heading': {
          const id = this.headId(textOf(n));
          const bm = `h${++this.headIdx}`;
          this.bookmarks.set(id, bm);
          out.push(new Paragraph({ heading: HEADINGS[n.depth - 1]!, children: [new Bookmark({ id: bm, children: this.inline(n.children) as TextRun[] })] }));
          break;
        }
        case 'paragraph': {
          // một đoạn chỉ có ảnh: đứng riêng, căn giữa
          const only = n.children.length === 1 && (n.children[0]!.type === 'image' || n.children[0]!.type === 'imageReference');
          out.push(new Paragraph({ children: this.inline(n.children), ...qx, ...(only ? { alignment: AlignmentType.CENTER } : {}), spacing: { after: 120 } }));
          break;
        }
        case 'blockquote': {
          const first = n.children[0];
          const t = first?.type === 'paragraph' && first.children[0]?.type === 'text' ? first.children[0].value : '';
          const c = parseCallout(t);
          if (c && first?.type === 'paragraph' && first.children[0]?.type === 'text') {
            first.children[0].value = t.slice(c.len);
            out.push(new Paragraph({ children: [new TextRun({ text: CALLOUTS[c.kind].toUpperCase(), bold: true, size: 18 })], shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: c.kind === 'warning' || c.kind === 'caution' || c.kind === 'important' ? 'C2410C' : '555555', space: 8 } }, indent: { left: 240 } }));
            out.push(...this.blocks(n.children, ctx));
          } else out.push(...this.blocks(n.children, { quote: (ctx.quote ?? 0) + 1 }));
          break;
        }
        case 'list': out.push(...this.list(n, 0, ctx)); break;
        case 'code': {
          if (n.lang === 'mermaid') {
            const img = this.diagrams[this.diagramIdx++] ?? null;
            if (img) { out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [imageRun(img)], spacing: { after: 120 } })); break; }
          }
          const lines = n.value.split('\n');
          out.push(new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' }, spacing: { after: 160 }, ...qi,
            children: lines.map((l, i) => new TextRun({ text: l, font: MONO, size: 18, break: i ? 1 : 0 })),
          }));
          break;
        }
        case 'math': out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: n.value, font: 'Cambria Math', italics: true })], spacing: { after: 160 } })); break;
        case 'thematicBreak': out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } }, spacing: { after: 200 } })); break;
        case 'table': out.push(this.table(n)); break;
        case 'html': case 'definition': case 'footnoteDefinition': case 'yaml': break;
        default: break;
      }
    }
    return out;
  }

  list(n: List, level: number, ctx: { quote?: number }): Paragraph[] {
    const out: Paragraph[] = [];
    const inst = ++this.listInstance;
    for (const item of n.children as ListItem[]) {
      let first = true;
      for (const c of item.children) {
        if (c.type === 'list') { out.push(...this.list(c, level + 1, ctx)); continue; }
        if (c.type !== 'paragraph') { out.push(...(this.blocks([c], ctx) as Paragraph[])); continue; }
        const box = first && typeof item.checked === 'boolean' ? [new TextRun({ text: item.checked ? '☑ ' : '☐ ' })] : [];
        const kids = [...box, ...this.inline(c.children)];
        out.push(first
          ? new Paragraph({ children: kids, ...(n.ordered ? { numbering: { reference: 'ol', level: Math.min(level, 8), instance: inst } } : { bullet: { level: Math.min(level, 8) } }) })
          : new Paragraph({ children: kids, indent: { left: 720 * (level + 1) } }));
        first = false;
      }
    }
    return out;
  }

  table(n: MdTable): Table {
    const align = n.align ?? [];
    const al = (i: number) => (align[i] === 'center' ? AlignmentType.CENTER : align[i] === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT);
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: n.children.map((r, ri) => new TableRow({
        tableHeader: ri === 0,
        children: r.children.map((c, ci) => new TableCell({
          children: [new Paragraph({ alignment: al(ci), children: this.inline(c.children, ri === 0 ? { bold: true } : {}) })],
          ...(ri === 0 ? { shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' } } : {}),
        })),
      })),
    });
  }

  private ids = idMaker();
  headId(text: string): string { return this.ids(plainHeading(text)); }
}

function imageRun(img: DocxImage): ImageRun {
  const k = img.width > MAX_W ? MAX_W / img.width : 1;
  return new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.width * k), height: Math.round(img.height * k) } });
}

/** Cây mdast của văn bản (bỏ front matter, như bản xem). */
export function mdastOf(src: string): Root {
  const { body } = splitFrontMatter(src);
  const p = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
  return p.runSync(p.parse(normalizeMathDelims(body))) as Root;
}

/** Dựng Document từ Markdown. */
export async function buildDocx(src: string, opts: DocxOptions = {}): Promise<Document> {
  const tree = mdastOf(src);
  const b = new Builder();
  const urls = new Set<string>();
  const mermaids: string[] = [];
  const walk = (n: { type: string; children?: unknown[]; url?: string; lang?: string | null; identifier?: string }) => {
    if (n.type === 'definition') b.defs.set((n.identifier ?? '').toLowerCase(), n as unknown as Definition);
    if (n.type === 'footnoteDefinition') b.noteDefs.set((n.identifier ?? '').toLowerCase(), n as unknown as FootnoteDefinition);
    if (n.type === 'code' && n.lang === 'mermaid') mermaids.push((n as unknown as { value: string }).value);
    (n.children as typeof n[] | undefined)?.forEach(walk);
  };
  walk(tree as never);
  const walkImg = (n: { type: string; children?: unknown[]; url?: string; identifier?: string }) => {
    if (n.type === 'image' && n.url) urls.add(n.url);
    if (n.type === 'imageReference') { const d = b.defs.get((n.identifier ?? '').toLowerCase()); if (d) urls.add(d.url); }
    (n.children as typeof n[] | undefined)?.forEach(walkImg);
  };
  walkImg(tree as never);
  // nạp song song ảnh và sơ đồ trước khi dựng (phần dựng là đồng bộ)
  await Promise.all([...urls].map(async (u) => { b.imgs.set(u, opts.image ? await opts.image(u).catch(() => null) : null); }));
  b.diagrams = await Promise.all(mermaids.map((m) => (opts.diagram ? opts.diagram(m).catch(() => null) : Promise.resolve(null))));
  // chú thích: đánh số theo thứ tự tham chiếu đầu tiên, như GitHub
  let next = 1;
  const order = (n: { type: string; children?: unknown[]; identifier?: string }) => {
    if (n.type === 'footnoteReference') { const k = (n.identifier ?? '').toLowerCase(); if (b.noteDefs.has(k) && !b.notes.has(k)) b.notes.set(k, next++); }
    (n.children as typeof n[] | undefined)?.forEach(order);
  };
  order(tree as never);
  // tiêu đề trước: link `#id` cần biết bookmark của tiêu đề nằm phía sau nó
  const pre = new Builder(); pre.defs = b.defs;
  tree.children.forEach((n) => { if (n.type === 'heading') { pre.bookmarks.set(pre.headId(textOf(n)), `h${++pre.headIdx}`); } });
  b.bookmarks = pre.bookmarks;
  const body = b.blocks(tree.children);
  const footnotes: Record<number, { children: Paragraph[] }> = {};
  for (const [k, id] of b.notes) footnotes[id] = { children: b.blocks(b.noteDefs.get(k)!.children).filter((x): x is Paragraph => x instanceof Paragraph) };
  const title = opts.title ?? (tree.children.find((n) => n.type === 'heading' && n.depth === 1) ? textOf(tree.children.find((n) => n.type === 'heading' && n.depth === 1) as never) : 'Document');
  return new Document({
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [{
        reference: 'ol',
        levels: Array.from({ length: 9 }, (_, l) => ({ level: l, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][l % 3]!, text: `%${l + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } })),
      }],
    },
    footnotes,
    sections: [{ children: body.length ? body : [new Paragraph({ children: [] })] }],
  });
}

export async function docxBlob(src: string, opts: DocxOptions = {}): Promise<Blob> { return Packer.toBlob(await buildDocx(src, opts)); }
export async function docxBuffer(src: string, opts: DocxOptions = {}): Promise<Uint8Array> { return new Uint8Array(await Packer.toBuffer(await buildDocx(src, opts))); }
