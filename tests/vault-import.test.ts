import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { VAULT_IMAGE_LIMITS, readVaultFiles, readVaultZip } from '../src/lib/vault/import';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG_OK = strToU8('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
const SVG_BAD = strToU8('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
const file = (path: string, data: Uint8Array) => ({ path, size: data.length, arrayBuffer: async () => data.slice().buffer });

describe('readVaultZip', () => {
  it('keeps notes and images, strips the common top folder, reports what it dropped', async () => {
    const zip = zipSync({
      'vault/Home.md': strToU8('# Home\n![[cat.png]]'),
      'vault/img/cat.png': PNG,
      'vault/img/logo.svg': SVG_OK,
      'vault/img/evil.svg': SVG_BAD,
      'vault/img/fake.png': strToU8('<html>'),
      'vault/doc.pdf': strToU8('%PDF'),
      'vault/.git/x.png': PNG,
    });
    const r = await readVaultZip(zip);
    expect([...r.vfs.keys()].filter((p) => p.endsWith('.md'))).toEqual(['Home.md']);
    expect(r.images.map((i) => [i.path, i.type])).toEqual([['img/cat.png', 'image/png'], ['img/logo.svg', 'image/svg+xml']]);
    expect(r.dropped.map((d) => [d.path, d.reason])).toEqual([['img/evil.svg', 'unsafe SVG (event handler)'], ['img/fake.png', 'not a valid image']]);
  });
  it('refuses zip-slip paths and absolute paths', async () => {
    const zip = zipSync({ '../evil.png': PNG, '/abs.png': PNG, 'ok/a.md': strToU8('x'), 'ok/b.png': PNG });
    const r = await readVaultZip(zip);
    expect(r.images.map((i) => i.path)).toEqual(['b.png']);
  });
  it('skips images over the size limit with a clear reason', async () => {
    const big = new Uint8Array(VAULT_IMAGE_LIMITS.maxImageBytes + 1); big.set(PNG);
    const r = await readVaultZip(zipSync({ 'a.md': strToU8('x'), 'big.png': big, 'small.png': PNG }));
    expect(r.images.map((i) => i.path)).toEqual(['small.png']);
    expect(r.dropped).toEqual([{ path: 'big.png', size: big.length, reason: 'over 8 MB' }]);
  });
  it('stops at the total image budget', async () => {
    const r = await readVaultZip(zipSync({ 'a.md': strToU8('x'), 'a.png': PNG, 'b.png': PNG, 'c.png': PNG }), { maxTotalBytes: PNG.length * 2 });
    expect(r.images.map((i) => i.path)).toEqual(['a.png', 'b.png']);
    expect(r.dropped.map((d) => d.reason)).toEqual(['image budget used up']);
  });
});

describe('readVaultFiles', () => {
  it('reads a picked folder: notes, images, unicode names, root folder removed', async () => {
    const r = await readVaultFiles([
      file('My Vault/Đà Lạt.md', strToU8('# Đà Lạt')),
      file('My Vault/ảnh/mèo con.PNG', PNG),
      file('My Vault/node_modules/x.png', PNG),
      file('My Vault/bad.svg', SVG_BAD),
    ]);
    expect([...r.vfs.keys()]).toContain('Đà Lạt.md');
    expect(r.images.map((i) => i.path)).toEqual(['ảnh/mèo con.PNG']);
    expect(r.dropped.map((d) => d.path)).toEqual(['bad.svg']);
    expect(r.root).toBe('My Vault');
  });
  it('does not read images over the limit (size checked before reading)', async () => {
    let read = false;
    const r = await readVaultFiles([
      file('v/a.md', strToU8('x')),
      { path: 'v/huge.png', size: VAULT_IMAGE_LIMITS.maxImageBytes + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } },
    ]);
    expect(read).toBe(false);
    expect(r.dropped).toEqual([{ path: 'huge.png', size: VAULT_IMAGE_LIMITS.maxImageBytes + 1, reason: 'over 8 MB' }]);
  });
});
