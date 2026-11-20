import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { emit, on } from '../../lib/bus';
import { filterCommands, type CmdDef, type Seg } from '../../lib/search';
import { TRANSFORMS } from '../../lib/studio/transform';
import { Icon } from './icons';

const CMDS: CmdDef[] = [
  { id: 'help', key: 'help phim tat shortcuts', label: 'Keyboard shortcuts', hint: '?', desc: 'Show every shortcut.' },
  { id: 'theme-system', key: 'theme system follow os auto he thong', label: 'Theme: follow the system', hint: '', desc: 'Stop overriding light or dark and follow the operating system.' },
  { id: 'theme', key: 'dark light sang toi theme', label: 'Toggle light / dark', hint: 'd', desc: 'Switch between the light and dark theme.' },
];
/** Lệnh của studio Markdown, chỉ hiện khi đang ở /app/ (gõ > rồi tên lệnh). Chạy bằng sự kiện `studio` trên bus. */
const ZEN_SET: [string, string, string[]][] = [['chrome', 'Controls', ['auto', 'always', 'hidden']], ['tw', 'Typewriter', ['center', 'third', 'free']], ['focus', 'Focus', ['paragraph', 'sentence']], ['dim', 'Fade', ['off', 'soft', 'strong']], ['face', 'Font', ['sans', 'mono']], ['size', 'Size', ['s', 'm', 'l']], ['col', 'Width', ['narrow', 'normal', 'wide']], ['copy', 'Copy format', ['md', 'rich', 'plain']]];
const STUDIO: CmdDef[] = [
  { id: 'studio:zen', key: 'studio zen focus tap trung', label: 'Zen mode', hint: 'esc, f', desc: 'A quiet column on the face you are using: Edit opens writing, Read and Split open the rendered text. Alt+V switches.' },
  { id: 'studio:zen-write', key: 'studio zen write viet focus tap trung', label: 'Zen, write', hint: '', desc: 'Open Zen straight on the writing face: paragraphs fade with distance from the one you are in.' },
  { id: 'studio:zen-read', key: 'studio zen read doc xem preview', label: 'Zen, read', hint: 'alt+v', desc: 'Zen column showing the rendered Markdown; Alt+V or the Write button switches to writing.' },
  { id: 'studio:sync', key: 'studio sync scroll cuon dong bo split', label: 'Toggle sync scroll', hint: '', desc: 'In Split, make the source and the preview scroll together, or on their own.' },
  { id: 'studio:install', key: 'studio install app offline cai dat ung dung', label: 'Install mdprev as an app', hint: '', desc: 'Add it to your device so it opens in its own window and works without a network.' },
  { id: 'studio:find', key: 'studio find replace tim thay the', label: 'Find and replace', hint: '⌘F', desc: 'Search the document, regex supported.' },
  { id: 'studio:jump', key: 'studio jump heading outline muc luc', label: 'Jump to heading', hint: 'o', desc: 'Filter headings and jump.' },
  { id: 'studio:save', key: 'studio save luu', label: 'Save', hint: '⌘S', desc: 'Save to the opened file, or download .md.' },
  { id: 'studio:export-md', key: 'studio export download markdown md tai', label: 'Download Markdown', hint: '', desc: 'Save the document as .md.' },
  { id: 'studio:export-html', key: 'studio export html standalone', label: 'Export HTML', hint: '', desc: 'Standalone .html with styles.' },
  { id: 'studio:export-pdf', key: 'studio export pdf print in', label: 'Export PDF (print)', hint: '', desc: 'Print only the rendered document.' },
  { id: 'studio:export-epub', key: 'studio export epub ebook sach', label: 'Export EPUB', hint: '', desc: 'E-book with contents and embedded images.' },
  { id: 'studio:export-tex', key: 'studio export latex tex', label: 'Export LaTeX', hint: '', desc: '.tex for XeLaTeX; unsupported parts are noted.' },
  { id: 'studio:export-textpack', key: 'studio export textpack textbundle bear ulysses', label: 'Export TextPack', hint: '', desc: 'Markdown plus pasted images in one file; opens back in mdprev.' },
  { id: 'studio:copy-md', key: 'studio copy markdown chep', label: 'Copy Markdown', hint: '', desc: 'Copy the source.' },
  { id: 'studio:copy-html', key: 'studio copy html chep', label: 'Copy HTML', hint: '', desc: 'Copy the rendered body as HTML.' },
  { id: 'studio:copy-rich', key: 'studio copy rich text chep', label: 'Copy rich text', hint: '', desc: 'Paste with formatting into Docs or Notion.' },
  { id: 'studio:share', key: 'studio share link chia se', label: 'Copy share link', hint: '', desc: 'Compress the document into a #hash link.' },
  { id: 'studio:authorship', key: 'studio authorship pasted typed provenance dan go tay', label: 'Toggle authorship marks', hint: '', desc: 'Mark pasted and dropped text. Local and approximate, not proof.' },
  { id: 'studio:theme', key: 'studio theme document colors font style giao dien', label: 'Document theme…', hint: '', desc: 'Colors, font and size of the document; saved styles, custom CSS, your templates.' },
  { id: 'studio:share-pw', key: 'studio share password encrypt link chia se mat khau ma hoa', label: 'Share with password…', hint: '', desc: 'Encrypted #hash link that opens with a password; optional soft expiry.' },
  { id: 'studio:authorship-reset', key: 'studio authorship start over reset clear marks lam lai xoa', label: 'Start over authorship marks', hint: '', desc: 'Forget which text was pasted or typed; everything now counts as existing text.' },
  { id: 'studio:writing-log-clear', key: 'studio writing log streak goal clear delete reset xoa nhat ky', label: 'Clear writing log', hint: '', desc: 'Delete the words-per-day record and streak kept in this browser.' },
  { id: 'studio:vault-folder', key: 'studio vault folder open publish static site obsidian notes wikilink thu muc', label: 'Open folder as vault… (publish as a site)', hint: '', desc: 'A folder of Markdown notes with [[wikilinks]]; then Export site… makes a static site.' },
  { id: 'studio:vault-zip', key: 'studio vault zip open publish static site obsidian notes wikilink', label: 'Open zip as vault… (publish as a site)', hint: '', desc: 'A zip of Markdown notes with [[wikilinks]]; then Export site… makes a static site.' },
  { id: 'studio:new', key: 'studio new document moi tao', label: 'New document', hint: '', desc: 'Start an empty document. The current one stays in Recent.' },
  { id: 'studio:clear', key: 'studio clear document remove all text empty delete xoa het sach', label: 'Clear document', hint: '', desc: 'Remove all text, after asking. The current text stays in Restore previous.' },
  { id: 'studio:sample', key: 'studio sample mau vi du demo', label: 'Load the sample document', hint: '', desc: 'A short document that shows what the editor can do. Yours stays in Recent.' },
  { id: 'studio:template', key: 'studio template new from mau', label: 'New from template…', hint: '', desc: 'README, decision record, meeting notes, changelog and more.' },
  { id: 'studio:open-url', key: 'studio open url link github', label: 'Open from a link…', hint: '', desc: 'Paste a GitHub or raw link to a Markdown file.' },
  { id: 'studio:restore', key: 'studio restore previous khoi phuc', label: 'Restore previous document', hint: '', desc: 'Swap back to the document before the last replace.' },
  { id: 'studio:fix-trailing', key: 'studio fix trailing whitespace khoang trang', label: 'Fix trailing whitespace', hint: '', desc: 'Remove trailing spaces flagged by lint.' },
  { id: 'studio:popout', key: 'studio pop out preview cua so', label: 'Pop out preview', hint: '', desc: 'Open the preview in its own window.' },
  { id: 'studio:spell', key: 'studio spellcheck chinh ta', label: 'Cycle spellcheck', hint: '', desc: 'Off or English.' },
  { id: 'studio:width', key: 'studio width preview rong hep', label: 'Toggle preview width', hint: '', desc: 'Narrow or wide reading column.' },
  { id: 'studio:present', key: 'studio present slides slide trinh chieu', label: 'Present as slides', hint: 's', desc: 'Split at --- or at headings, arrows to move.' },
  { id: 'studio:present-here', key: 'studio present slides current here trinh chieu tu day', label: 'Present from the current slide', hint: 'alt+p', desc: 'Start at the slide that holds the cursor.' },
  { id: 'studio:zen-present', key: 'studio zen present slides trinh chieu', label: 'Zen, present slides', hint: '', desc: 'Present from the first slide without leaving zen.' },
  { id: 'studio:zen-present-here', key: 'studio zen present slides here trinh chieu tu day', label: 'Zen, present from here', hint: 'alt+p', desc: 'Present from the slide you are writing.' },
  { id: 'studio:export-pdf-toc', key: 'studio export pdf print contents toc muc luc in', label: 'Export PDF with contents', hint: '', desc: 'Print with a table of contents page.' },
  { id: 'studio:export-slides-pdf', key: 'studio export slides pdf print deck trinh chieu in', label: 'Export slides as PDF', hint: '', desc: 'One 16:9 page per slide.' },
  { id: 'studio:export-docx', key: 'studio export word docx tai', label: 'Export Word (.docx)', hint: '', desc: 'Headings, lists, tables, footnotes and images as a Word file.' },
  { id: 'studio:images', key: 'studio images pictures assets anh da dan', label: 'Pasted images', hint: '', desc: 'List, insert or delete images stored in this browser.' },
  ...([['row-above', 'insert row above'], ['row-below', 'insert row below'], ['row-del', 'delete row'], ['col-left', 'insert column left'], ['col-right', 'insert column right'], ['col-del', 'delete column'], ['align-left', 'align column left'], ['align-center', 'align column center'], ['align-right', 'align column right'], ['sort-asc', 'sort rows A-Z'], ['sort-desc', 'sort rows Z-A']] as const).map(([op, name]) => ({ id: `studio:table:${op}`, key: `studio table bang ${name}`, label: `Table, ${name}`, hint: '', desc: 'Acts on the table at the cursor.' })),
  { id: 'studio:doc-style', key: 'studio document style paper compact theme kieu tai lieu', label: 'Cycle document style', hint: '', desc: 'default, paper, compact for preview, HTML export and print.' },
  { id: 'studio:inspector', key: 'studio inspector panel toggle bang kiem tra', label: 'Toggle inspector', hint: '⌘⇧\\', desc: 'Outline, properties, checks and history, or findings for a skill.' },
  { id: 'studio:sidebar', key: 'studio sidebar files panel toggle cay tep', label: 'Toggle file panel', hint: '⌘\\', desc: 'Files of the skill copy you are editing.' },
  { id: 'studio:history', key: 'studio changes history snapshots lich su thay doi', label: 'Changes and history', hint: '', desc: 'Revert single changes, restore earlier snapshots.' },
  { id: 'studio:template-readme', key: 'studio template readme new tao moi mau', label: 'New from template, README', hint: '', desc: 'Replace the document with a README outline.' },
  { id: 'studio:template-adr', key: 'studio template adr decision record new tao moi mau', label: 'New from template, Decision record', hint: '', desc: 'Replace the document with an ADR outline.' },
  { id: 'studio:template-meeting', key: 'studio template meeting notes new tao moi mau', label: 'New from template, Meeting notes', hint: '', desc: 'Replace the document with meeting notes.' },
  { id: 'studio:template-changelog', key: 'studio template changelog new tao moi mau', label: 'New from template, Changelog', hint: '', desc: 'Replace the document with a changelog.' },
  { id: 'studio:template-design', key: 'studio template design doc rfc proposal new tao moi mau', label: 'New from template, Design doc', hint: '', desc: 'Replace the document with a design doc outline.' },
  { id: 'studio:template-postmortem', key: 'studio template postmortem incident review new tao moi mau', label: 'New from template, Incident postmortem', hint: '', desc: 'Replace the document with a blameless postmortem.' },
  { id: 'studio:template-runbook', key: 'studio template runbook oncall alert new tao moi mau', label: 'New from template, Runbook', hint: '', desc: 'Replace the document with an on-call runbook.' },
  { id: 'studio:template-bug', key: 'studio template bug report issue new tao moi mau', label: 'New from template, Bug report', hint: '', desc: 'Replace the document with a bug report.' },
  { id: 'studio:template-pr', key: 'studio template pull request pr description new tao moi mau', label: 'New from template, Pull request', hint: '', desc: 'Replace the document with a pull request description.' },
  { id: 'studio:template-weekly', key: 'studio template weekly update status report new tao moi mau', label: 'New from template, Weekly update', hint: '', desc: 'Replace the document with a weekly update.' },
  { id: 'studio:template-api', key: 'studio template api reference endpoint docs new tao moi mau', label: 'New from template, API reference', hint: '', desc: 'Replace the document with an API reference outline.' },
  { id: 'studio:template-note', key: 'studio template technical note math diagram new tao moi mau', label: 'New from template, Technical note', hint: '', desc: 'Replace the document with a note that uses math, a diagram and code.' },
  // cài đặt zen đổi bằng chữ: Ctrl/⌘+K trong zen mở Palette sẵn `>zen `
  ...ZEN_SET.flatMap(([k, name, vals]) => vals.map((v) => ({ id: `studio:zen-set:${k}:${v}`, key: `studio zen ${name} ${k} ${v}`, label: `Zen ${name.toLowerCase()}, ${v}`, hint: '', desc: `Set ${name.toLowerCase()} to ${v} in zen.` }))),
  ...TRANSFORMS.map((t) => ({ id: `studio:transform-${t.id}`, key: `studio transform ${t.label} ${t.id}`, label: `${t.label}`, hint: '', desc: `Transform text (${t.hint}).` })),
];
const allCmds = (): CmdDef[] => (document.body.dataset['view'] === 'app' ? [...STUDIO, ...CMDS] : CMDS);

interface Row { id: string; segs: Seg[]; right: string; sub: string; group: string; run: () => void }
const GROUPS = ['File', 'Edit', 'View', 'Present', 'Help'];
/** Nhóm của lệnh (chỉ để hiện đầu mục khi chưa gõ gì). */
const groupOf = (id: string): string => (/^studio:(save|export|copy|share|restore|images|new|open|template|install|vault)/.test(id) ? 'File' : /^studio:present/.test(id) ? 'Present' : /^studio:(zen|spell|width|doc-style|inspector|sidebar|popout|history|theme)|^theme/.test(id) ? 'View' : id === 'help' ? 'Help' : 'Edit');

/** Command palette: lọc lệnh không dấu, nhiều từ. Dấu > ở đầu (thói quen cũ) được bỏ qua. */
export default function Palette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  const close = () => { setOpen(false); emit('search-state', false); (opener.current as HTMLElement | null)?.focus?.(); };
  const openIt = (q0 = '') => {
    opener.current = document.activeElement;
    setQ(q0); setSel(0); setOpen(true); emit('search-state', true);
    setTimeout(() => input.current?.focus(), 30);
  };
  useEffect(() => {
    const offs = [on('search', (o) => { if (o === true) openIt(); else if (typeof o === 'string') openIt(o); }), on<{ type: string }>('key', (a) => { if (a.type === 'escape') { setOpen(false); emit('search-state', false); } })];
    const click = (e: MouseEvent) => { const t = (e.target as HTMLElement).closest('[data-open-search]'); if (t) { e.preventDefault(); openIt(); } };
    document.addEventListener('click', click);
    if (location.hash === '#search') openIt();
    return () => { offs.forEach((f) => f()); document.removeEventListener('click', click); };
  }, []);

  const runCmd = (id: string) => {
    close();
    if (id.startsWith('studio:')) return emit('studio', { cmd: id.slice(7) });
    if (id === 'help') return emit('help');
    if (id === 'theme') return emit('theme');
    if (id === 'theme-system') return emit('theme-system');
  };

  const rows = useMemo<Row[]>(() => {
    if (!open) return []; // SSR không có document; chỉ lọc khi mở
    const raw = q.trim().replace(/^>\s*/, '');
    const out = filterCommands(allCmds(), raw).map(({ cmd, segs }) => ({ id: cmd.id, segs, right: cmd.hint, sub: cmd.desc, group: groupOf(cmd.id), run: () => runCmd(cmd.id) }));
    return raw ? out : [...out].sort((x, y) => GROUPS.indexOf(x.group) - GROUPS.indexOf(y.group)); // chưa gõ gì: gom theo nhóm; gõ rồi: giữ thứ tự xếp hạng
  }, [q, open]);

  const cur = Math.min(sel, Math.max(0, rows.length - 1));
  const scrollTo = (i: number) => setTimeout(() => { const l = list.current, r = document.getElementById('sr-' + i); if (!l || !r) return; if (r.offsetTop < l.scrollTop) l.scrollTop = r.offsetTop; else if (r.offsetTop + r.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = r.offsetTop + r.offsetHeight - l.clientHeight; }, 0);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = Math.min(rows.length - 1, Math.max(0, cur + (e.key === 'ArrowDown' ? 1 : -1))); setSel(n); scrollTo(n); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[cur]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  if (!open) return null;
  const showGroups = !q.trim().replace(/^>\s*/, '');
  return (
    <div class="pal-scrim" onClick={close}>
      <div class="pal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="pal-head">
          <span class="pal-ic" aria-hidden="true"><Icon n="cmd" s={16} /></span>
          <input ref={input} aria-label="Command palette" value={q} onInput={(e) => { setQ((e.target as HTMLInputElement).value); setSel(0); }} onKeyDown={onKey} placeholder="Search commands" spellcheck={false} autocomplete="off" />
          <span class="pal-count">{rows.length} commands</span>
          <kbd class="pal-esc">esc</kbd>
        </div>
        <div ref={list} id="sr-list" class="pal-list">
          {rows.map((r, n) => (
            <>
              {showGroups && (n === 0 || rows[n - 1]!.group !== r.group) && <div class="pal-group" role="presentation">{r.group}</div>}
              <a key={r.id} id={'sr-' + n} href="#" class={'pal-row' + (cur === n ? ' on' : '')} aria-current={cur === n ? 'true' : undefined} onClick={(e) => { e.preventDefault(); r.run(); }} onMouseEnter={() => cur !== n && setSel(n)}>
                <span class="pal-t">{r.segs.map((g, i) => <span key={i} class={g.h ? 'pal-hl' : undefined}>{g.t}</span>)}</span>
                <span class="pal-k">{r.right}</span>
                <span class="pal-d">{r.sub}</span>
              </a>
            </>
          ))}
          {rows.length === 0 && <div class="pal-none">No command matches “{q}”.</div>}
        </div>
        <div class="pal-foot"><button type="button" class="pal-x" aria-label="Close" onClick={close}>Close</button><span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>↵</kbd> run</span><span><kbd>esc</kbd> close</span></div>
      </div>
    </div>
  );
}
