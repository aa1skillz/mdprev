import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src/lib/skills');
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk(ROOT).filter((f) => /\.ts$/.test(f));
/** Lớp nối với trình duyệt (worker, client RPC) được phép import `../rpc` và dùng DOM/Worker. Mọi file khác là lõi thuần. */
const ADAPTERS = new Set(['client.ts', 'inspect.worker.ts']);
const isCore = (f: string): boolean => !ADAPTERS.has(f.slice(ROOT.length + 1));
const importsOf = (src: string): string[] => [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);

describe('ranh giới lõi src/lib/skills', () => {
  it('có file để kiểm', () => expect(files.length).toBeGreaterThan(5));

  it('lõi chỉ import từ chính nó, yaml và fflate', () => {
    const bad: string[] = [];
    for (const f of files.filter(isCore)) {
      for (const spec of importsOf(readFileSync(f, 'utf8'))) {
        const ok = spec === 'yaml' || spec === 'fflate' || spec.startsWith('./') || (spec.startsWith('../') && !spec.startsWith('../../'));
        if (!ok) bad.push(`${f.slice(ROOT.length + 1)} → ${spec}`);
        if (spec.startsWith('../') && f.slice(ROOT.length + 1).split('/').length < 2) bad.push(`${f.slice(ROOT.length + 1)} → ${spec} (ra ngoài lõi)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('lõi không dùng biến toàn cục của trình duyệt', () => {
    const bad: string[] = [];
    for (const f of files.filter(isCore)) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const g of ['document.', 'window.', 'localStorage', 'sessionStorage', 'navigator.', 'indexedDB', 'Worker(']) if (src.includes(g)) bad.push(`${f.slice(ROOT.length + 1)} dùng ${g}`);
    }
    expect(bad).toEqual([]);
  });

  it('lớp nối chỉ được import thêm ../rpc ngoài lõi', () => {
    const bad: string[] = [];
    for (const f of files.filter((x) => !isCore(x))) {
      for (const spec of importsOf(readFileSync(f, 'utf8'))) {
        if (spec.startsWith('../') && spec !== '../rpc') bad.push(`${f.slice(ROOT.length + 1)} → ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
