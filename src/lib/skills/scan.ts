import type { ScriptFinding, Severity } from './types';

/**
 * Quét tĩnh script bằng bảng luật. KHÔNG chạy gì, và KHÔNG phải bảo đảm an toàn: sẽ có báo nhầm lẫn bỏ sót.
 * Mỗi phát hiện chỉ nói "nên đọc dòng này". Luật đã hiệu chuẩn trên 77 script của 20 skill thật.
 *
 * Mọi luật phải chạy tuyến tính theo độ dài dòng: dòng được quét ĐẦY ĐỦ (không cắt ngắn), vì cắt ngắn cho phép giấu
 * lệnh nguy hiểm sau một đoạn đệm dài. Đừng thêm luật có `[^x]*` lồng sau một từ khoá có thể lặp.
 */
export type { ScriptFinding };

type Lang = 'py' | 'sh' | 'js';
interface Hit { severity: Severity; message: string }
interface Rule { id: string; langs: readonly Lang[]; check: (line: string) => Hit | null }

const re = (id: string, langs: readonly Lang[], rx: RegExp, severity: Severity, message: string): Rule => ({
  id, langs, check: (l) => (rx.test(l) ? { severity, message } : null),
});

/** Giới hạn số lần xuất hiện được phân tích trên một dòng (chống dòng cố tình lặp một từ khoá hàng trăm nghìn lần). */
const MAX_HITS_PER_LINE = 200;
const SEGMENT = 2000;

const DANGEROUS_TARGET = /^(\/|~|\$|\.\.)|^\*$|^\/\*$/;

/** `rm` đệ quy và ép: review khi đích là gốc, thư mục nhà, biến, `..`, `*` hay đường dẫn tuyệt đối; còn lại là note. */
function rmRule(line: string): Hit | null {
  let worst: Hit | null = null;
  let n = 0;
  for (const m of line.matchAll(/(?<![\w./-])rm(?=\s)/g)) {
    if (++n > MAX_HITS_PER_LINE) break;
    const start = (m.index ?? 0) + 2;
    // chỉ xét đoạn lệnh này: dừng ở && || ; |
    const seg = (line.slice(start, start + SEGMENT).split(/&&|\|\||[;|]/)[0] ?? '').trim();
    let recursive = false;
    let force = false;
    let endOfFlags = false;
    const targets: string[] = [];
    for (const tok of seg.split(/\s+/)) {
      if (tok === '') continue;
      if (!endOfFlags && tok === '--') { endOfFlags = true; continue; }
      if (!endOfFlags && tok.startsWith('--')) { if (tok === '--recursive') recursive = true; else if (tok === '--force') force = true; continue; }
      if (!endOfFlags && /^-[A-Za-z]+$/.test(tok)) { if (/[rR]/.test(tok)) recursive = true; if (tok.includes('f')) force = true; continue; }
      targets.push(tok.replace(/^["']+|["']+$/g, ''));
    }
    if (!recursive || !force || targets.length === 0) continue;
    const bad = targets.some((t) => DANGEROUS_TARGET.test(t) || /\/\*$/.test(t));
    const hit: Hit = bad
      ? { severity: 'review', message: 'Deletes files recursively and by force, with a target that is broad or built from a variable.' }
      : { severity: 'note', message: 'Deletes files recursively and by force (a relative path).' };
    if (!worst || hit.severity === 'review') worst = hit;
  }
  return worst;
}

/** `curl`/`wget` đẩy vào shell. Tìm các dấu `|` dẫn vào sh/bash/zsh rồi nhìn ngược về dấu `|` trước đó (tuyến tính). */
function pipeToShell(line: string): Hit | null {
  let n = 0;
  for (const m of line.matchAll(/\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/g)) {
    if (++n > MAX_HITS_PER_LINE) break;
    const at = m.index ?? 0;
    const prev = line.lastIndexOf('|', at - 1);
    const seg = line.slice(Math.max(prev + 1, at - SEGMENT), at);
    if (/\b(curl|wget)\b/.test(seg)) return { severity: 'review', message: 'Downloads something and pipes it straight into a shell.' };
  }
  return null;
}

const RULES: readonly Rule[] = [
  re('shell-true', ['py'], /shell\s*=\s*True/, 'review', 'Runs a command through the shell (shell=True).'),
  re('os-system', ['py'], /\bos\.(system|popen)\(/, 'review', 'Runs a shell command (os.system or os.popen).'),
  re('dyn-exec', ['py'], /(?<![\w.])(eval|exec)\(/, 'review', 'Runs text as code (eval or exec).'),
  re('dyn-exec', ['js'], /(?<![\w.])eval\(|new Function\(/, 'review', 'Runs text as code (eval or new Function).'),
  { id: 'pipe-to-shell', langs: ['sh', 'py', 'js'], check: pipeToShell },
  { id: 'rm-rf', langs: ['sh', 'py'], check: rmRule },
  re('secret-path', ['sh', 'py', 'js'], /\/\.(ssh|aws|gnupg)\b|\bid_(rsa|ed25519)\b|\.netrc\b|\.git-credentials\b/, 'review', 'Mentions a place where keys or credentials are kept.'),
  { id: 'decode-exec', langs: ['py', 'js', 'sh'], check: (l) => (/(b64decode|atob\(|base64\s+(-d|--decode)|fromhex)/.test(l) && /\b(exec|eval|Function|sh|bash)\b/.test(l) ? { severity: 'review', message: 'Decodes text and runs it.' } : null) },
  re('obfuscated', ['py', 'js', 'sh'], /[A-Za-z0-9+/]{200,}={0,2}/, 'review', 'Contains a long encoded blob.'),
  re('net', ['py'], /\b(requests\.|urllib|httpx\.|socket\.)|^\s*(import|from)\s+(requests|httpx|urllib|socket|aiohttp)\b/, 'note', 'Makes network requests.'),
  re('net', ['js'], /\bfetch\(|XMLHttpRequest|\bhttps?\.request\(|\baxios\b/, 'note', 'Makes network requests.'),
  re('net', ['sh'], /\b(curl|wget)\s/, 'note', 'Makes network requests.'),
  re('install', ['sh', 'py', 'js'], /\b(pip3?|npm|pnpm|yarn|apt(-get)?|brew|cargo)\s+install\b/, 'note', 'Installs packages.'),
];

const LANG_BY_EXT: Record<string, Lang> = { py: 'py', sh: 'sh', bash: 'sh', zsh: 'sh', js: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js' };

export function scriptLang(path: string): Lang | null {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const i = base.lastIndexOf('.');
  return i < 0 ? null : (LANG_BY_EXT[base.slice(i + 1).toLowerCase()] ?? null);
}

export function scanScript(path: string, text: string): ScriptFinding[] {
  const lang = scriptLang(path);
  if (!lang) return [];
  const rules = RULES.filter((r) => r.langs.includes(lang));
  const out: ScriptFinding[] = [];
  const comment = lang === 'js' ? /^\s*(\/\/|\/\*|\*)/ : /^\s*#/;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    // Dòng chỉ có chú thích không chạy được; bỏ qua (hiệu chuẩn: script đánh giá của Anthropic nhắc đường dẫn khoá SSH trong chú thích).
    if (comment.test(line)) continue;
    for (const r of rules) {
      const hit = r.check(line);
      if (hit) out.push({ ruleId: r.id, severity: hit.severity, line: i + 1, message: hit.message });
    }
  }
  return out;
}
