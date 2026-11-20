/**
 * EPUB 3: một chương (text.xhtml), mục lục nav.xhtml theo heading, CSS đọc sách gọn, ảnh nhúng trong sách.
 * `buildEpub` thuần (zip bằng fflate, `mimetype` là mục đầu tiên, không nén). `epubBodyFromHtml` chạy trong trình duyệt:
 * dùng DOMParser + XMLSerializer để ra XHTML thật (thẻ rỗng tự đóng, không entity HTML), gom ảnh, bỏ link tới file không có trong sách.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';

export interface TocEntry { id: string; text: string; level: number }
export interface EpubImage { path: string; type: string; data: Uint8Array }
export interface EpubInput { title: string; lang: string; author?: string | undefined; id: string; modified: string; body: string; css: string; images: EpubImage[]; toc: TocEntry[] }

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XHTML = (title: string, lang: string, body: string, extra = '') => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${x(lang)}" lang="${x(lang)}">
<head><meta charset="utf-8"/><title>${x(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/>${extra}</head>
<body>
${body}
</body>
</html>
`;

/** Mục lục lồng nhau: cấp lùi về thì đóng `ol`, cấp nhảy xa (h1 → h3) vẫn chỉ lồng một bậc. */
export function navXhtml(title: string, lang: string, toc: TocEntry[]): string {
  let ol = '';
  if (!toc.length) ol = `<ol><li><a href="text.xhtml">${x(title)}</a></li></ol>`;
  else {
    const stack: number[] = [];
    for (const t of toc) {
      if (!stack.length) { ol += '<ol>'; stack.push(t.level); }
      else if (t.level > stack[stack.length - 1]!) { ol += '<ol>'; stack.push(t.level); }
      else {
        ol += '</li>';
        while (stack.length > 1 && t.level < stack[stack.length - 1]!) { stack.pop(); ol += '</ol></li>'; }
      }
      ol += `<li><a href="text.xhtml#${x(t.id)}">${x(t.text)}</a>`;
    }
    ol += '</li>';
    for (let i = stack.length; i > 1; i--) ol += '</ol></li>';
    ol += '</ol>';
  }
  return XHTML(title, lang, `<nav epub:type="toc" id="toc"><h1>Contents</h1>${ol}</nav>`);
}

export function buildEpub(o: EpubInput): Uint8Array {
  const props = [/<svg[\s>]/.test(o.body) && 'svg', /<math[\s>]/.test(o.body) && 'mathml'].filter(Boolean).join(' ');
  const items = o.images.map((im, i) => `<item id="img${i + 1}" href="${x(im.path)}" media-type="${im.type}"/>`).join('\n    ');
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${x(o.lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${x(o.id)}</dc:identifier>
    <dc:title>${x(o.title)}</dc:title>
    <dc:language>${x(o.lang)}</dc:language>
    ${o.author ? `<dc:creator>${x(o.author)}</dc:creator>\n    ` : ''}<meta property="dcterms:modified">${o.modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="text" href="text.xhtml" media-type="application/xhtml+xml"${props ? ` properties="${props}"` : ''}/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${items}
  </manifest>
  <spine>
    <itemref idref="text"/>
  </spine>
</package>
`;
  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }], // phải là mục đầu tiên, không nén
    'META-INF/container.xml': strToU8('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n'),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(navXhtml(o.title, o.lang, o.toc)),
    'OEBPS/text.xhtml': strToU8(XHTML(o.title, o.lang, o.body)),
    'OEBPS/style.css': strToU8(o.css),
  };
  for (const im of o.images) files['OEBPS/' + im.path] = [im.data, { level: 0 }];
  return zipSync(files);
}

/** CSS sách: trung tính để trình đọc áp phông và cỡ chữ của người đọc. */
export const EPUB_CSS = `body{line-height:1.5}
h1,h2,h3,h4{line-height:1.25;page-break-after:avoid}
pre{white-space:pre-wrap;font-family:monospace;font-size:0.85em;background:#f4f2ee;padding:0.6em;border-radius:4px}
code{font-family:monospace;font-size:0.9em}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #999}
table{border-collapse:collapse;margin:1em 0}
th,td{border:1px solid #999;padding:0.25em 0.5em}
img,svg{max-width:100%;height:auto}
figure{margin:1em 0}
`;

const CORE_IMG = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

/**
 * Chỉ chạy trong trình duyệt. `html` là thân bài đã qua cleanHtml (ảnh `asset:` đã nhúng data URI).
 * `getImage(url)` tải ảnh web (CORS); không tải được thì ảnh thành chữ thay thế.
 */
export async function epubBodyFromHtml(html: string, getImage: (url: string) => Promise<{ data: Uint8Array; type: string } | null>, diagram?: (index: number) => Promise<{ data: Uint8Array; type: string } | null>): Promise<{ body: string; images: EpubImage[]; toc: TocEntry[] }> {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  const body = doc.body;
  body.querySelectorAll('script,style,button,iframe,object,embed,form,noscript').forEach((n) => n.remove());
  // link tới file khác (đường dẫn tương đối) không có trong sách: epubcheck báo lỗi, đổi thành chữ thường
  body.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href') ?? '';
    if (/^(https?:|mailto:)/i.test(h)) return;
    if (h.startsWith('#') && h.length > 1 && doc.getElementById(decodeURIComponent(h.slice(1)))) return;
    a.removeAttribute('href');
  });
  // HTML5 cũ không hợp lệ trong XHTML của EPUB: align của ô bảng thành style; aria-* trỏ tới id không có thì bỏ
  body.querySelectorAll('[align]').forEach((el) => { const a = el.getAttribute('align'); el.removeAttribute('align'); if (a) el.setAttribute('style', `text-align:${a};${el.getAttribute('style') ?? ''}`); });
  body.querySelectorAll('[aria-describedby],[aria-labelledby]').forEach((el) => {
    for (const k of ['aria-describedby', 'aria-labelledby']) { const v = el.getAttribute(k); if (v && v.split(/\s+/).some((id) => !doc.getElementById(id))) el.removeAttribute(k); }
  });
  // Sơ đồ Mermaid của bản xem dùng nhãn HTML trong foreignObject (không hợp lệ, nhiều trình đọc không vẽ): thay bằng ảnh PNG dựng lại
  const figs = [...body.querySelectorAll('figure.mermaid')];
  for (let i = 0; i < figs.length; i++) {
    const f = figs[i]!;
    const got = diagram ? await diagram(i).catch(() => null) : null;
    const img = doc.createElement('img');
    if (got) { img.setAttribute('src', `data:${got.type};base64,${btoa(Array.from(got.data, (c) => String.fromCharCode(c)).join(''))}`); img.setAttribute('alt', f.getAttribute('aria-label') ?? 'diagram'); }
    else img.setAttribute('alt', 'diagram');
    const nf = doc.createElement('figure');
    nf.append(img);
    f.replaceWith(nf);
  }
  const images: EpubImage[] = [];
  for (const img of [...body.querySelectorAll('img')]) {
    const src = img.getAttribute('src') ?? '';
    let got: { data: Uint8Array; type: string } | null = null;
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
    if (m) {
      try { got = { type: m[1]!, data: m[2] ? Uint8Array.from(atob(m[3]!), (c) => c.charCodeAt(0)) : strToU8(decodeURIComponent(m[3]!)) }; } catch { got = null; }
    } else if (src) got = await getImage(src).catch(() => null);
    if (got && CORE_IMG.has(got.type)) {
      const path = `images/i${images.length + 1}.${EXT[got.type]}`;
      images.push({ path, type: got.type, data: got.data });
      [...img.attributes].forEach((at) => { if (!['alt', 'title', 'width', 'height'].includes(at.name)) img.removeAttribute(at.name); });
      img.setAttribute('src', path);
      if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
    } else {
      const s = doc.createElement('span');
      s.textContent = `[${img.getAttribute('alt') || 'image'}]`;
      img.replaceWith(s);
    }
  }
  // id trùng làm hỏng XHTML: giữ cái đầu
  const seen = new Set<string>();
  body.querySelectorAll('[id]').forEach((el) => { if (seen.has(el.id)) el.removeAttribute('id'); else seen.add(el.id); });
  const toc: TocEntry[] = [...body.querySelectorAll('h1[id],h2[id],h3[id]')].map((h) => ({ id: h.id, text: (h.textContent ?? '').trim(), level: Number(h.tagName[1]) }));
  const xml = new XMLSerializer().serializeToString(body);
  const inner = xml.replace(/^<body[^>]*>/, '').replace(/<\/body>$/, '');
  return { body: inner, images, toc };
}
