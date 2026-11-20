import { describe, expect, it } from 'vitest';
import { buildResolver, findWikilinks, noteKey } from '../src/lib/vault/wikilink';

describe('findWikilinks', () => {
  it('parses every syntax form', () => {
    const r = findWikilinks('a [[Note]] b [[Note|Alias]] c [[Note#Head]] d [[Note#Head|Al]] e [[#Local]] f ![[Embed]]');
    expect(r.map((x) => [x.target, x.heading, x.alias, x.embed])).toEqual([
      ['Note', undefined, undefined, false],
      ['Note', undefined, 'Alias', false],
      ['Note', 'Head', undefined, false],
      ['Note', 'Head', 'Al', false],
      ['', 'Local', undefined, false],
      ['Embed', undefined, undefined, true],
    ]);
    expect(r[0]?.raw).toBe('[[Note]]');
  });
  it('reports 1-based lines', () => {
    const r = findWikilinks('x\n\n[[A]]\ny [[B]] z');
    expect(r.map((x) => x.line)).toEqual([3, 4]);
  });
  it('skips front matter, fenced code (``` and ~~~) and inline code', () => {
    const md = '---\ntitle: [[fm]]\n---\n[[real]]\n```\n[[in fence]]\n```\n~~~js\n[[tilde]]\n~~~\n`[[inline]]` and ``[[double]]`` but [[after]]\n';
    expect(findWikilinks(md).map((x) => x.target)).toEqual(['real', 'after']);
  });
  it('line numbers count front matter lines', () => {
    expect(findWikilinks('---\na: 1\n---\n[[X]]')[0]?.line).toBe(4);
  });
  it('ignores empty brackets', () => {
    expect(findWikilinks('[[]] [[ ]]')).toEqual([]);
  });
});

describe('noteKey', () => {
  it('lowercases and drops the markdown extension', () => {
    expect(noteKey('Projects/Alpha.MD')).toBe('projects/alpha');
    expect(noteKey('a/B.markdown')).toBe('a/b');
    expect(noteKey('a/b.txt')).toBe('a/b.txt');
  });
});

describe('buildResolver', () => {
  const paths = ['Home.md', 'Projects/Alpha.md', 'Projects/Notes.md', 'Areas/Deep/Notes.md', 'Areas/Notes.md', 'Zeta/Notes.md', 'Ydir/Notes.md', 'img/Photo.PNG', 'docs/file.pdf'];
  const r = buildResolver(paths);
  it('is case-insensitive with optional extension', () => {
    expect(r('home')).toBe('Home.md');
    expect(r('HOME.md')).toBe('Home.md');
    expect(r('alpha')).toBe('Projects/Alpha.md');
  });
  it('matches folder-qualified targets on a / boundary', () => {
    expect(r('Projects/Alpha')).toBe('Projects/Alpha.md');
    expect(r('deep/notes')).toBe('Areas/Deep/Notes.md');
    expect(r('rojects/Alpha')).toBeNull();
  });
  it('prefers same folder, then shortest path, then alphabetical', () => {
    expect(r('Notes', 'Zeta/x.md')).toBe('Zeta/Notes.md');
    expect(r('Notes', 'Areas/Deep/y.md')).toBe('Areas/Deep/Notes.md');
    expect(r('Notes', 'Home.md')).toBe('Ydir/Notes.md'); // ngắn nhất (Ydir = Zeta), hoà thì abc
    expect(r('Notes')).toBe('Ydir/Notes.md');
    expect(buildResolver(['b/N.md', 'a/N.md'])('n')).toBe('a/N.md');
  });
  it('resolves non-markdown files against all paths', () => {
    expect(r('photo.png')).toBe('img/Photo.PNG');
    expect(r('File.PDF')).toBe('docs/file.pdf');
    expect(r('missing.png')).toBeNull();
  });
  it('returns null for unknown notes and empty targets', () => {
    expect(r('nope')).toBeNull();
    expect(r('')).toBeNull();
  });
  it('treats dotted names without a real extension as notes', () => {
    expect(buildResolver(['v1.2.md'])('v1.2')).toBe('v1.2.md');
  });
});
