/**
 * Gợi ý văn phong tiếng Anh (không phải lỗi): cụm từ thừa/sáo ngữ, câu bị động, câu quá dài, từ lặp gần nhau.
 * Chỉ có luật tiếng Anh (sản phẩm cho người dùng toàn cầu). Bỏ qua front matter, code (khối, thụt lề, inline), URL, bảng, HTML và heading.
 */
export type StyleKind = 'wordy' | 'passive' | 'long' | 'repeat';
export interface StyleIssue { line: number; kind: StyleKind; message: string }
export interface WritingStats { words: number; sentences: number; minutes: number; avgSentence: number }

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const LONG = 30;
const WPM = 230;

// [cụm, gợi ý]; gợi ý rỗng = từ đệm, thường bỏ được
const EN_WORDY: [string, string][] = [
  ['in order to', 'to'], ['due to the fact that', 'because'], ['at this point in time', 'now'], ['in the event that', 'if'],
  ['for the purpose of', 'to'], ['in spite of the fact that', 'although'], ['with regard to', 'about'], ['a large number of', 'many'],
  ['the majority of', 'most'], ['has the ability to', 'can'], ['is able to', 'can'], ['make use of', 'use'], ['prior to', 'before'],
  ['at the end of the day', ''], ['needless to say', ''], ['it goes without saying', ''], ['each and every', 'each'], ['first and foremost', 'first'],
  ['very', ''], ['really', ''], ['basically', ''], ['actually', ''], ['literally', ''], ['simply', ''], ['quite', ''], ['totally', ''], ['extremely', ''],
];
const IRREG = 'written|done|made|given|taken|seen|known|shown|built|sent|found|held|kept|left|lost|paid|put|run|said|set|sold|told|thought|understood|won|chosen|driven|broken|spoken|forgotten|hidden|begun|drawn|grown|thrown|brought|bought|caught|taught|meant|felt|heard|led|read';
const NOT_PASSIVE = new Set(['interested', 'tired', 'excited', 'worried', 'supposed', 'used', 'married', 'concerned', 'pleased', 'bored', 'scared', 'based', 'related', 'detailed', 'advanced', 'complicated', 'experienced', 'limited', 'needed', 'red', 'bed', 'shed', 'fed', 'wed']);
const EN_PASSIVE = new RegExp(`\\b(am|is|are|was|were|be|been|being)\\s+(?:not\\s+)?(?:\\w+ly\\s+)?(\\w+ed|${IRREG})\\b`, 'gi');
const EN_STOP = new Set('that this with from have they them their there these those which what when where while would could should about after before other into than then were your will been also some such only more most very just like over each many much even does make made used using because between'.split(' '));

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = (list: [string, string][]) => list.map(([p, s]) => ({ p, s, re: new RegExp(`(?<![\\p{L}\\p{N}])${esc(p)}(?![\\p{L}\\p{N}])`, 'giu') }));
const EN_W = phraseRe(EN_WORDY);

/** Văn bản thuần của một dòng: bỏ cú pháp Markdown, code inline, URL, HTML. */
function plain(line: string): string {
  return line
    .replace(/`+[^`]*`+/g, ' ')
    .replace(/\${1,2}(?!\s)[^$\n]*?(?<!\s)\${1,2}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\bhttps?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}(?:>\s?)+/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/[*_~]+/g, '');
}

interface Block { line: number; text: string; heading: boolean; starts: number[] }

/** Chia tài liệu thành khối văn xuôi (đoạn, mục danh sách, trích dẫn), bỏ phần không phải văn xuôi. */
function blocks(src: string): Block[] {
  const lines = src.split('\n');
  const out: Block[] = [];
  let i = 0;
  if (/^---[ \t]*$/.test(lines[0] ?? '')) { const end = lines.findIndex((l, n) => n > 0 && /^(---|\.\.\.)[ \t]*$/.test(l)); if (end > 0) i = end + 1; }
  let fence = '', math = false, cur: Block | null = null, prevBlank = true;
  const flush = () => { if (cur && cur.text.trim()) out.push(cur); cur = null; };
  for (; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const f = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; prevBlank = false; continue; }
    if (f) { flush(); fence = f[1] ?? ''; continue; }
    // công thức $$…$$ không phải văn xuôi (\times, \text… không được tách thành từ)
    if (math) { if (/\$\$\s*$/.test(raw)) math = false; prevBlank = false; continue; }
    if (/^\s*\$\$/.test(raw)) { flush(); if (!/\$\$\s*$/.test(raw.replace(/^\s*\$\$/, ''))) math = true; prevBlank = false; continue; }
    const blank = raw.trim() === '';
    if (blank) { flush(); prevBlank = true; continue; }
    const indented = /^( {4}|\t)/.test(raw) && prevBlank && !cur;
    const table = /^\s*\|/.test(raw) || /^\s*:?-{3,}:?\s*\|/.test(raw);
    const html = /^\s*<\/?[a-zA-Z!]/.test(raw);
    const rule = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(raw);
    if (indented || table || html || rule || /^\s{0,3}\[[^\]]+\]:\s/.test(raw)) { flush(); prevBlank = false; continue; }
    const head = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+/.test(raw) || /^\s{0,3}>/.test(raw);
    if (head || item) flush();
    const text = plain(head ? head[1] ?? '' : raw);
    if (!cur) cur = { line: i + 1, text: '', heading: !!head, starts: [] };
    cur.starts.push(cur.text.length);
    cur.text += (cur.text ? ' ' : '') + text;
    if (cur.starts.length > 1) cur.starts[cur.starts.length - 1]! += 1;
    if (head) flush();
    prevBlank = false;
  }
  flush();
  return out;
}

const lineAt = (b: Block, off: number): number => { let k = 0; while (k + 1 < b.starts.length && b.starts[k + 1]! <= off) k++; return b.line + k; };

/** Câu: tách sau . ! ? … khi theo sau là khoảng trắng; giữ vị trí bắt đầu trong khối. */
function sentences(text: string): { s: string; at: number }[] {
  const out: { s: string; at: number }[] = [];
  const re = /[^.!?…]+(?:[.!?…]+(?=\s|$)|$)|[.!?…]+/g;
  let m: RegExpExecArray | null;
  let buf = '', at = -1;
  while ((m = re.exec(text))) {
    if (at < 0) at = m.index;
    buf += m[0];
    // "e.g." hay "3.5" không phải hết câu: chỉ cắt khi sau dấu là khoảng trắng hoặc hết khối
    const end = /[.!?…]$/.test(m[0]) && (re.lastIndex >= text.length || /\s/.test(text[re.lastIndex] ?? ''));
    if (end || re.lastIndex >= text.length) { if (buf.trim()) out.push({ s: buf, at }); buf = ''; at = -1; }
    if (m[0] === '') re.lastIndex++;
  }
  if (buf.trim()) out.push({ s: buf, at: Math.max(0, at) });
  return out;
}

export function styleCheck(src: string): StyleIssue[] {
  const out: (StyleIssue & { o: number })[] = [];
  let base = 0;
  for (const b of blocks(src)) {
    base += 1e6;
    if (b.heading) continue;
    const add = (off: number, kind: StyleKind, message: string) => out.push({ line: lineAt(b, off), kind, message, o: base + off });
    for (const w of EN_W) {
      for (const m of b.text.matchAll(w.re)) add(m.index ?? 0, 'wordy', w.s ? `Wordy "${w.p}": try "${w.s}"` : `Filler "${w.p}": often safe to cut`);
    }
    for (const m of b.text.matchAll(EN_PASSIVE)) if (!NOT_PASSIVE.has((m[2] ?? '').toLowerCase())) add(m.index ?? 0, 'passive', `Passive voice "${m[0].replace(/\s+/g, ' ')}"`);
    for (const { s, at } of sentences(b.text)) {
      const n = s.match(WORD)?.length ?? 0;
      if (n > LONG) add(at, 'long', `Long sentence (${n} words)`);
    }
    // từ lặp: từ đôi liền nhau ("the the"); từ nội dung lặp trong 12 từ
    const toks = [...b.text.matchAll(WORD)].map((m) => ({ w: m[0].toLowerCase(), at: m.index ?? 0 }));
    const said = new Set<string>();
    for (let k = 1; k < toks.length; k++) {
      const a = toks[k - 1]!, c = toks[k]!;
      if (a.w === c.w && !/^\d/.test(a.w) && !said.has('2' + a.w) && /^\s+$/.test(b.text.slice(a.at + a.w.length, c.at))) { said.add('2' + a.w); add(a.at, 'repeat', `Doubled word "${a.w} ${c.w}"`); }
    }
    const last = new Map<string, number>();
    toks.forEach((t, k) => {
      if (t.w.length < 4 || EN_STOP.has(t.w)) return;
      const key = t.w.replace(/(?<=\w{3})s$/, '');
      const p = last.get(key);
      if (p !== undefined && k - p <= 12 && k - p > 1 && !said.has(key)) { said.add(key); add(t.at, 'repeat', `"${t.w}" repeated within a few words`); }
      last.set(key, k);
    });
  }
  return out.sort((a, b) => a.o - b.o).map(({ o: _o, ...i }) => i);
}

export function writingStats(src: string): WritingStats {
  let words = 0, sents = 0;
  for (const b of blocks(src)) {
    words += b.text.match(WORD)?.length ?? 0;
    sents += sentences(b.text).filter((x) => /[\p{L}\p{N}]/u.test(x.s)).length;
  }
  return { words, sentences: sents, minutes: words ? Math.max(1, Math.round(words / WPM)) : 0, avgSentence: sents ? words / sents : 0 };
}
