/** Chia sẻ bằng link: nén tài liệu vào phần #hash của URL (không gửi nội dung tới server nào). */
export const b64 = (u: Uint8Array): string => { let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64 = (s: string): Uint8Array => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };

export async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream, max = Infinity): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(data as unknown as BufferSource).then(() => w.close()).catch(() => undefined);
  const r = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.length;
    if (n > max) { void r.cancel(); throw new Error('too large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export const canShare = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function encodeShare(text: string): Promise<string> {
  return b64(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')));
}

/** Giải nén, giới hạn kích thước sau giải nén để một link độc hại không làm đầy bộ nhớ. Null nếu hỏng hoặc quá lớn. */
export async function decodeShare(payload: string, maxBytes = 2_000_000): Promise<string | null> {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(await pipe(unb64(payload), new DecompressionStream('deflate-raw'), maxBytes)); } catch { return null; }
}

/** Tài liệu trong link. `theme` là token đã lọc (mục 4); payload có theme dùng envelope để không nhầm với Markdown trông giống JSON. */
export interface SharedDoc { md: string; theme?: Record<string, string> }
const ENV = '\u0000mdprev1\n'; // văn bản gõ tay không bắt đầu bằng NUL
export const packDoc = (d: SharedDoc): string => ENV + JSON.stringify(d.theme ? { md: d.md, theme: d.theme } : { md: d.md });
export function unpackDoc(t: string): SharedDoc | null {
  if (!t.startsWith(ENV)) return { md: t };
  try {
    const o = JSON.parse(t.slice(ENV.length)) as { md?: unknown; theme?: unknown };
    if (typeof o.md !== 'string') return null;
    const th = o.theme && typeof o.theme === 'object' && !Array.isArray(o.theme) ? Object.fromEntries(Object.entries(o.theme).filter((e): e is [string, string] => typeof e[1] === 'string')) : undefined;
    return th ? { md: o.md, theme: th } : { md: o.md };
  } catch { return null; }
}
/** `#d=`: không theme thì nén thẳng Markdown (y như bản cũ), có theme thì nén envelope. */
export const encodeDoc = (d: SharedDoc): Promise<string> => encodeShare(d.theme ? packDoc(d) : d.md);
export async function decodeDoc(payload: string, maxBytes = 2_000_000): Promise<SharedDoc | null> {
  const t = await decodeShare(payload, maxBytes);
  return t === null ? null : unpackDoc(t);
}
