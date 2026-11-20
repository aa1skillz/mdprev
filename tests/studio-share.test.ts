import { describe, expect, it } from 'vitest';
import { decodeShare, decodeDoc, encodeDoc, packDoc, unpackDoc, unb64, b64 } from '../src/lib/studio/share';
import { decryptShare, encryptShare, peekShare } from '../src/lib/studio/share-crypt';

// Sinh bằng encodeShare của bản trước (2a4374d): link #d= cũ phải mở được y nguyên.
const LEGACY = 'AUIAvf8jIFRpw6p1IMSR4buBCgpIZWxsbyAqKndvcmxkKiog4oCUIMSRw6J5IGzDoCBi4bqjbiBjaGlhIHPhursgY8WpLgo';
const LEGACY_TEXT = '# Tiêu đề\n\nHello **world** — đây là bản chia sẻ cũ.\n';
const pw = () => 'pw-' + Math.random().toString(36).slice(2); // sinh lúc chạy, không để chuỗi giống bí mật trong mã
const FAST = { iter: 100_000 };

describe('share envelope', () => {
  it('legacy #d= payload still decodes', async () => {
    expect(await decodeShare(LEGACY)).toBe(LEGACY_TEXT);
    expect(await decodeDoc(LEGACY)).toEqual({ md: LEGACY_TEXT });
  });
  it('plain doc without theme encodes exactly like before', async () => {
    expect(await encodeDoc({ md: LEGACY_TEXT })).toBe(LEGACY);
  });
  it('theme travels in an envelope', async () => {
    const d = { md: '# A\n', theme: { accent: '#123456' } };
    expect(unpackDoc(packDoc(d))).toEqual(d);
    expect(await decodeDoc(await encodeDoc(d))).toEqual(d);
  });
  it('markdown that looks like JSON stays markdown', () => {
    const t = '{"md":"x","theme":{"accent":"red"}}';
    expect(unpackDoc(t)).toEqual({ md: t });
  });
  it('broken envelope falls back to null', () => {
    expect(unpackDoc('\u0000mdprev1\n{nope')).toBeNull();
    expect(unpackDoc('\u0000mdprev1\n{"md":5}')).toBeNull();
  });
});

describe('#e= encryption', () => {
  it('round trips with the right password', async () => {
    const p = pw();
    const d = { md: '# Bí mật\n\nnội dung', theme: { accent: '#0a4d8c' } };
    const e = await encryptShare(d, p, FAST);
    expect(await decryptShare(e, p)).toEqual(d);
  });
  it('wrong password gives null', async () => {
    const e = await encryptShare({ md: 'x' }, pw(), FAST);
    expect(await decryptShare(e, pw())).toBeNull();
  });
  it('tampering with the header (expiry, salt) breaks decryption', async () => {
    const p = pw();
    const e = await encryptShare({ md: 'x' }, p, { ...FAST, expiresAt: Date.now() + 86_400_000 });
    for (const at of [7, 30, 34]) { // salt, iv, expiry
      const u = unb64(e); u[at] = (u[at] ?? 0) ^ 1;
      expect(await decryptShare(b64(u), p)).toBeNull();
    }
  });
  it('peek reads expiry without the password', async () => {
    const t = Math.floor(Date.now() / 1000) * 1000 + 3_600_000;
    expect(peekShare(await encryptShare({ md: 'x' }, pw(), { ...FAST, expiresAt: t }))).toEqual({ expiresAt: t });
    expect(peekShare(await encryptShare({ md: 'x' }, pw(), FAST))).toEqual({});
  });
  it('rejects absurd iteration counts without running them', async () => {
    const p = pw();
    const u = unb64(await encryptShare({ md: 'x' }, p, FAST));
    u[2] = 0xff; // iter u32 BE byte cao nhất → ~4 tỉ vòng
    const t0 = Date.now();
    expect(peekShare(b64(u))).toBeNull();
    expect(await decryptShare(b64(u), p)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it('truncated or garbage payloads give null', async () => {
    const p = pw();
    const e = await encryptShare({ md: 'hello world' }, p, FAST);
    expect(await decryptShare(e.slice(0, 20), p)).toBeNull();
    expect(await decryptShare(e.slice(0, -4), p)).toBeNull();
    expect(await decryptShare('***', p)).toBeNull();
    expect(peekShare('')).toBeNull();
  });
  it('defaults to 600k iterations', async () => {
    const u = unb64(await encryptShare({ md: 'x' }, pw()));
    expect(new DataView(u.buffer).getUint32(2)).toBe(600_000);
  });
});

describe('#e= review follow-ups', () => {
  it('password is NFC-normalized (Vietnamese typed as NFD on another device still opens)', async () => {
    const base = 'mật khẩu ' + Math.random().toString(36).slice(2);
    const e = await encryptShare({ md: 'x' }, base.normalize('NFC'), FAST);
    expect(await decryptShare(e, base.normalize('NFD'))).toEqual({ md: 'x' });
  });
  it('too few iterations and oversized payloads are rejected', async () => {
    const u = unb64(await encryptShare({ md: 'x' }, pw(), FAST));
    new DataView(u.buffer).setUint32(2, 1000);
    expect(peekShare(b64(u))).toBeNull();
    expect(peekShare('A'.repeat(40_001))).toBeNull();
  });
  it('a decompression bomb stops at the size cap', async () => {
    const p = pw();
    const e = await encryptShare({ md: 'a'.repeat(3_000_000) }, p, FAST);
    expect(await decryptShare(e, p)).toBeNull();
  });
});
