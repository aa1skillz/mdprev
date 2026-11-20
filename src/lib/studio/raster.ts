/** Raster hoá ảnh cho bản xuất DOCX (Word nhận PNG, JPEG, GIF, BMP). Chạy ở luồng chính, cần DOM. */
import type { DocxImage } from './docx';

const KEEP: Record<string, DocxImage['type']> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };

const toPng = (c: HTMLCanvasElement) => new Promise<Uint8Array | null>((res) => {
  try { c.toBlob((b) => { if (!b) { res(null); return; } void b.arrayBuffer().then((a) => res(new Uint8Array(a))); }, 'image/png'); } catch { res(null); } // canvas bị taint: null
});

/** Ảnh bitmap (blob): giữ nguyên nếu Word đọc được, còn lại (WebP, AVIF, SVG) vẽ ra PNG. */
export async function imageForDocx(blob: Blob): Promise<DocxImage | null> {
  try {
    if (blob.type === 'image/svg+xml') return svgForDocx(await blob.text());
    const bmp = await createImageBitmap(blob);
    const { width, height } = bmp;
    const keep = KEEP[blob.type];
    if (keep) { bmp.close(); return { data: new Uint8Array(await blob.arrayBuffer()), type: keep, width, height }; }
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
    const data = await toPng(c);
    return data ? { data, type: 'png', width, height } : null;
  } catch { return null; }
}

/** SVG (chuỗi) → PNG ở 2x cho nét, kích thước hiển thị theo viewBox. */
export async function svgForDocx(svg: string): Promise<DocxImage | null> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = doc.documentElement;
  const vb = (el.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  let w = parseFloat(el.getAttribute('width') ?? '') || vb[2] || 0, h = parseFloat(el.getAttribute('height') ?? '') || vb[3] || 0;
  if (vb.length === 4 && vb[2]! > 0) { w = vb[2]!; h = vb[3]!; } // Mermaid đặt width="100%": lấy cỡ thật từ viewBox
  if (!w || !h) return null;
  el.setAttribute('width', String(w)); el.setAttribute('height', String(h));
  if (!el.getAttribute('xmlns')) el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('svg')); img.src = url; });
    const k = 2, c = document.createElement('canvas');
    c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); // nền trắng: Word không hiển thị đẹp PNG trong suốt trên trang
    g.drawImage(img, 0, 0, c.width, c.height);
    const data = await toPng(c);
    return data ? { data, type: 'png', width: Math.round(w), height: Math.round(h) } : null;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}
