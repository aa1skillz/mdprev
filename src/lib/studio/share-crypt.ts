/**
 * Link chia sẻ có mật khẩu `#e=` (nạp lười, chỉ khi cần). AES-GCM 256, khoá từ PBKDF2-SHA256.
 * Bytes = header ‖ ciphertext. Header là additionalData của AES-GCM: sửa salt, số vòng hay hạn dùng thì giải mã hỏng.
 * Header: ver u8 = 1 · flags u8 (bit0 = có hạn) · iter u32 BE · salt 16 · iv 12 · expiry u32 BE (giây Unix, nếu bit0).
 * Hết hạn chỉ là mềm: trang xem từ chối sau thời điểm đó, theo đồng hồ máy người xem.
 */
import { b64, packDoc, pipe, unb64, unpackDoc, type SharedDoc } from './share';

export const ITER = 600_000;
const MIN_ITER = 100_000, MAX_ITER = 2_000_000;
const MAX_PAYLOAD = 40_000; // ký tự base64url; link dài hơn đã bị chặn lúc tạo (16k)
const BASE = 34; // ver + flags + iter + salt + iv

interface Head { iter: number; salt: Uint8Array; iv: Uint8Array; expiresAt?: number; head: Uint8Array; body: Uint8Array }

function parse(payload: string): Head | null {
  if (!payload || payload.length > MAX_PAYLOAD || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  let u: Uint8Array;
  try { u = unb64(payload); } catch { return null; }
  if (u.length < BASE || u[0] !== 1) return null;
  const flags = u[1] ?? 0;
  if (flags & ~1) return null;
  const len = flags & 1 ? BASE + 4 : BASE;
  if (u.length < len + 16) return null; // tối thiểu: tag GCM 16 byte
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const iter = dv.getUint32(2);
  if (iter < MIN_ITER || iter > MAX_ITER) return null; // link độc có thể đòi hàng tỉ vòng để treo máy người xem
  const h: Head = { iter, salt: u.slice(6, 22), iv: u.slice(22, 34), head: u.slice(0, len), body: u.slice(len) };
  if (flags & 1) h.expiresAt = dv.getUint32(BASE) * 1000;
  return h;
}

async function keyOf(password: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const canEncrypt = (): boolean => typeof crypto !== 'undefined' && !!crypto.subtle && typeof CompressionStream === 'function';

export async function encryptShare(doc: SharedDoc, password: string, opts: { expiresAt?: number; iter?: number } = {}): Promise<string> {
  const iter = opts.iter ?? ITER;
  const exp = opts.expiresAt;
  const head = new Uint8Array(exp ? BASE + 4 : BASE);
  const dv = new DataView(head.buffer);
  head[0] = 1; head[1] = exp ? 1 : 0;
  dv.setUint32(2, iter);
  head.set(crypto.getRandomValues(new Uint8Array(16)), 6);
  head.set(crypto.getRandomValues(new Uint8Array(12)), 22);
  if (exp) dv.setUint32(BASE, Math.floor(exp / 1000));
  const plain = await pipe(new TextEncoder().encode(packDoc(doc)), new CompressionStream('deflate-raw'));
  const key = await keyOf(password, head.slice(6, 22), iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: head.slice(22, 34) as BufferSource, additionalData: head as BufferSource }, key, plain as BufferSource));
  const out = new Uint8Array(head.length + ct.length);
  out.set(head); out.set(ct, head.length);
  return b64(out);
}

/** Đọc phần không mã hoá (hạn dùng) để từ chối link quá hạn trước khi hỏi mật khẩu. Null nếu link hỏng. */
export function peekShare(payload: string): { expiresAt?: number } | null {
  const h = parse(payload);
  if (!h) return null;
  return h.expiresAt === undefined ? {} : { expiresAt: h.expiresAt };
}

/** Null cho mọi lỗi (sai mật khẩu, link sửa, link cắt cụt, quá lớn): người gọi hiện một thông báo chung. */
export async function decryptShare(payload: string, password: string, maxBytes = 2_000_000): Promise<SharedDoc | null> {
  const h = parse(payload);
  if (!h) return null;
  try {
    const key = await keyOf(password, h.salt, h.iter);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: h.iv as BufferSource, additionalData: h.head as BufferSource }, key, h.body as BufferSource));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await pipe(plain, new DecompressionStream('deflate-raw'), maxBytes));
    return unpackDoc(text);
  } catch { return null; }
}
