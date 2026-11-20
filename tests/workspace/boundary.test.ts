import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FILE = join(process.cwd(), 'src/lib/workspace/model.ts');
const src = readFileSync(FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const importsOf = (s: string): string[] => [...s.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);

describe('ranh giới src/lib/workspace/model.ts', () => {
  it('chỉ import fflate, ./… và ../skills/types, ../skills/vfs', () => {
    const ok = (s: string) => s === 'fflate' || s.startsWith('./') || s === '../skills/types' || s === '../skills/vfs';
    expect(importsOf(src).filter((s) => !ok(s))).toEqual([]);
    expect(importsOf(src)).toContain('fflate');
  });
  it('không dùng biến toàn cục của trình duyệt', () => {
    const bad = ['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'indexedDB', 'Worker', 'Blob', 'URL.', 'fetch('].filter((g) => new RegExp(`\\b${g.replace('.', '\\.').replace('(', '\\(')}`).test(src));
    expect(bad).toEqual([]);
  });
});
