import type * as preact from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { styleCheck, writingStats, type StyleIssue, type WritingStats } from '../../lib/studio/style-check';
import { readLog, streak, dayKey } from '../../lib/studio/writing-log';
import type { SkillReport } from '../../lib/skills/types';
import { verdictFor } from '../../lib/skills/report';
/** Panel Inspector bên phải của editor: các tab dùng lại dữ liệu và hàm của MarkdownStudio (không có logic riêng). Chỉ được dựng khi mở. */
export type InspectorTab = 'outline' | 'props' | 'checks' | 'history' | 'overview' | 'findings';
/** `skill`: đang sửa một bản sao skill, tab là Overview · Findings · Outline (spec Quiet Pro). */
export type InspectorMode = 'doc' | 'skill';
export interface InspectorIssue { line: number; message: string }

export interface InspectorPanelProps {
  mode?: InspectorMode;
  /** Báo cáo của skill đang sửa (mode `skill`); undefined khi đang quét, null khi bản sao không có SKILL.md. */
  report?: SkillReport | null | undefined;
  /** Mở tab Checks từ dòng trạng thái: đưa focus tới mục của dòng này. */
  focusLine?: { line: number; n: number } | null;
  /** Hành động sửa nhanh từ Overview (hiện chỉ có `frontmatter`: thêm khối frontmatter vào SKILL.md đang mở). */
  onFix?: (what: 'frontmatter') => void;
  onEditProp?: (key: string, value: string) => void;
  onOpenFinding?: (file: string | undefined, line: number | undefined) => void;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  /** Dựng tab Outline (danh sách tiêu đề có lọc, kéo và Alt+↑/↓ do MarkdownStudio quản). */
  renderOutline: () => preact.ComponentChildren;
  fmRows?: [string, string][];
  issues?: InspectorIssue[];
  onGoto?: (line: number) => void;
  trailing?: number;
  onFixTrailing?: () => void;
  /** Dựng nội dung tab History (StudioHistory nhúng); chỉ được gọi khi tab được chọn. */
  renderHistory?: () => preact.ComponentChildren;
  /** Văn bản (đã debounce) cho Style Check và thống kê viết; chỉ tính khi tab Checks mở. */
  src?: string;
  /** Word goal của Zen (0 = tắt). */
  goal?: number;
  /** Số ký tự theo nguồn gốc khi bật Authorship marks; undefined khi tắt. */
  auth?: { typed: number; paste: number; drop: number; import: number; len: number } | undefined;
  onAuthExport?: () => void;
  onAuthClear?: () => void;
}

const KIND: Record<StyleIssue['kind'], string> = { wordy: 'wordy', passive: 'passive', long: 'long', repeat: 'repeat' };
const MAX_STYLE = 200;
/** Tính sau khi trình duyệt rảnh, để gõ không bị chậm trên tài liệu dài. */
function useStyle(src: string, on: boolean): { list: StyleIssue[]; stats: WritingStats } | null {
  const [r, setR] = useState<{ list: StyleIssue[]; stats: WritingStats } | null>(null);
  useEffect(() => {
    if (!on) return;
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    const run = () => setR({ list: styleCheck(src), stats: writingStats(src) });
    if (w.requestIdleCallback) { const h = w.requestIdleCallback(run, { timeout: 1500 }); return () => w.cancelIdleCallback?.(h); }
    const t = setTimeout(run, 200);
    return () => clearTimeout(t);
  }, [src, on]);
  return r;
}

const DOC_TABS: { id: InspectorTab; label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'props', label: 'Properties' },
  { id: 'checks', label: 'Checks' },
  { id: 'history', label: 'History' },
];
const SKILL_TABS: { id: InspectorTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'findings', label: 'Findings' },
  { id: 'outline', label: 'Outline' },
  { id: 'checks', label: 'Checks' },
];
const tokensOf = (n: number): string => `~${n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n}`;

export default function InspectorPanel({ mode = 'doc', report, focusLine = null, onFix, onEditProp, onOpenFinding, tab, onTab, renderOutline, fmRows = [], issues = [], onGoto, trailing = 0, onFixTrailing, renderHistory, src = '', goal = 0, auth, onAuthExport, onAuthClear }: InspectorPanelProps) {
  const TABS = mode === 'skill' ? SKILL_TABS : DOC_TABS;
  const active = TABS.some((t) => t.id === tab) ? tab : TABS[0]!.id;
  const ids = TABS.map((t) => t.id);
  const nFind = report?.findings.length ?? 0;
  const style = useStyle(src, active === 'checks');
  useEffect(() => {
    if (!focusLine || active !== 'checks') return;
    const b = document.querySelector<HTMLElement>(`.pv-insp-issue[data-line="${focusLine.line}"]`);
    if (b) { b.focus(); b.scrollIntoView({ block: 'nearest' }); }
  }, [focusLine, active]);
  // Mũi tên trái/phải, Home và End chuyển tab (mẫu tab của WAI-ARIA, kích hoạt ngay khi focus).
  const onKey = (ev: KeyboardEvent) => {
    const i = ids.indexOf(active);
    let n = -1;
    if (ev.key === 'ArrowRight') n = (i + 1) % ids.length;
    else if (ev.key === 'ArrowLeft') n = (i - 1 + ids.length) % ids.length;
    else if (ev.key === 'Home') n = 0;
    else if (ev.key === 'End') n = ids.length - 1;
    if (n < 0) return;
    ev.preventDefault();
    onTab(ids[n]!);
    requestAnimationFrame(() => document.getElementById(`pv-insp-tab-${ids[n]}`)?.focus());
  };
  return (
    <aside class="pv-insp" aria-label="Inspector" data-focus-hide>
      <div class="pv-insp-tabs" role="tablist" aria-label="Inspector sections" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`pv-insp-tab-${t.id}`} aria-selected={active === t.id} aria-controls="pv-insp-panel" tabIndex={active === t.id ? 0 : -1} onClick={() => onTab(t.id)}>
            {t.label}
            {t.id === 'findings' && nFind > 0 && <span class="pv-insp-n"><span aria-hidden="true">!</span> {nFind}</span>}
            {t.id === 'checks' && issues.length > 0 && <span class="pv-insp-n"><span aria-hidden="true">!</span> {issues.length}</span>}
          </button>
        ))}
      </div>
      <div class="pv-insp-body" role="tabpanel" tabIndex={0} id="pv-insp-panel" aria-labelledby={`pv-insp-tab-${active}`}>
        {active === 'overview' && (report === undefined
          ? <p class="pv-insp-empty">Scanning the copy…</p>
          : report === null
          ? <p class="pv-insp-empty">No SKILL.md in this copy.</p>
          : <div class="pv-insp-ov">
              <p class={'pv-insp-verdict' + (verdictFor(report).tone === 'attention' ? ' att' : '')}>{verdictFor(report).parts.map((x, i) => (x.em ? <b key={i}>{x.text}</b> : x.text))}</p>
              {report.findings.some((f) => f.id === 'spec.frontmatter') && onFix && <button type="button" class="pv-insp-fix pv-insp-fixgo" onClick={() => onFix('frontmatter')}>Add frontmatter to SKILL.md</button>}
              <h2>Frontmatter</h2>
              <dl class="pv-insp-kv"><dt>name</dt><dd>{report.name ?? <i>missing</i>}</dd><dt>description</dt><dd class="clip" title={report.description ?? ''}>{report.description ?? <i>missing</i>}</dd></dl>
              <h2>Tokens (estimate)</h2>
              <dl class="pv-insp-kv num"><dt>always loaded</dt><dd>{tokensOf(report.tokens.always)}</dd><dt>on trigger</dt><dd>{tokensOf(report.tokens.trigger)}</dd><dt>all files</dt><dd>{tokensOf(report.tokens.all)}</dd></dl>
              <h2>Findings · {nFind}</h2>
              {nFind === 0 ? <p class="pv-insp-empty">This scan found nothing to review.</p> : <button type="button" class="pv-insp-fix" onClick={() => onTab('findings')}>Show {nFind === 1 ? 'the finding' : `all ${nFind}`}</button>}
            </div>)}
        {active === 'findings' && (report === undefined
          ? <p class="pv-insp-empty">Scanning the copy…</p>
          : report === null
          ? <p class="pv-insp-empty">No SKILL.md in this copy.</p>
          : nFind === 0
            ? <p class="pv-insp-empty"><span class="pv-ok" aria-hidden="true">✓</span> This scan found nothing to review</p>
            : <ul class="pv-insp-list">{report.findings.map((f, i) => (
                <li key={f.id + i}><button type="button" class="pv-insp-issue pv-insp-find" onClick={() => onOpenFinding?.(f.file, f.line)}>
                  <span class={f.severity === 'review' ? 'pv-warn' : 'pv-dim'} aria-hidden="true">{f.severity === 'review' ? '!' : 'i'}</span>
                  <span class="pv-insp-ft"><b>{f.title}</b><span class="pv-insp-fd">{f.detail}</span>{f.file && <span class="pv-insp-ln">{f.file}{f.line ? `:${f.line}` : ''}</span>}</span>
                  <span class="pv-sr">{f.severity === 'review' ? 'review' : 'note'}</span>
                </button></li>
              ))}</ul>)}
        {active === 'outline' && renderOutline()}
        {active === 'props' && (fmRows.length === 0
          ? <p class="pv-insp-empty">No front matter.</p>
          : <table class="pv-insp-props" aria-label="Front matter"><tbody>{fmRows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{onEditProp && !v.startsWith('{') ? <form onSubmit={(ev) => { ev.preventDefault(); (ev.currentTarget.elements[0] as HTMLInputElement).blur(); }}><input class="pv-insp-in" defaultValue={v} aria-label={k} onBlur={(ev) => { const x = (ev.currentTarget as HTMLInputElement).value; if (x !== v) onEditProp(k, x); }} /></form> : <span title={v}>{v}</span>}</td></tr>)}</tbody></table>)}
        {active === 'history' && renderHistory?.()}
        {active === 'checks' && (
          <>
            {issues.length === 0
              ? <p class="pv-insp-empty"><span class="pv-ok" aria-hidden="true">✓</span> No issues</p>
              : <ul class="pv-insp-list">{issues.map((it, i) => (
                  <li key={i}><button type="button" class="pv-insp-issue" data-line={it.line} aria-label={`Line ${it.line}: ${it.message}`} onClick={() => onGoto?.(it.line)}><span class="pv-warn" aria-hidden="true">!</span> <span class="pv-insp-ln">L{it.line}</span> {it.message}</button></li>
                ))}</ul>}
            {trailing > 0 && <button type="button" class="pv-insp-fix" onClick={() => onFixTrailing?.()}>Fix {trailing} trailing</button>}
            {style && <StyleSection r={style} goal={goal} onGoto={onGoto} />}
            {auth && <AuthSection a={auth} onExport={onAuthExport} onClear={onAuthClear} />}
          </>
        )}
      </div>
    </aside>
  );
}

function StyleSection({ r, goal, onGoto }: { r: { list: StyleIssue[]; stats: WritingStats }; goal: number; onGoto?: ((line: number) => void) | undefined }) {
  const { stats: st, list } = r;
  const log = readLog();
  const today = log[dayKey(new Date())] ?? 0;
  const days = streak(log, new Date());
  return (
    <div class="pv-insp-style">
      <h2>Writing</h2>
      <dl class="pv-insp-kv num">
        <dt title="Prose only: code, tables, front matter and formulas are left out, so this is lower than the status bar">words (prose)</dt><dd>{st.words.toLocaleString('en-US')}</dd>
        <dt>sentences</dt><dd>{st.sentences.toLocaleString('en-US')}</dd>
        <dt>avg sentence</dt><dd>{st.avgSentence ? st.avgSentence.toFixed(1) : '0'} words</dd>
        <dt>reading time</dt><dd>~{st.minutes} min</dd>
        {goal > 0 && <><dt>goal (Zen)</dt><dd>{Math.min(100, Math.round((st.words / goal) * 100))}% of {goal}</dd></>}
        <dt>written today</dt><dd>{today.toLocaleString('en-US')} words</dd>
        <dt>streak</dt><dd>{days} day{days === 1 ? '' : 's'}</dd>
      </dl>
      <p class="pv-insp-note">Kept in this browser only. A day counts toward the streak at 50 words.</p>
      <h2>Style suggestions · {list.length}</h2>
      <p class="pv-insp-note">Suggestions, not errors: wordy phrases, passive voice, long sentences, repeated words. English rules.</p>
      {list.length === 0
        ? <p class="pv-insp-empty"><span class="pv-ok" aria-hidden="true">✓</span> Nothing to suggest</p>
        : <ul class="pv-insp-list">{list.slice(0, MAX_STYLE).map((it, i) => (
            <li key={i}><button type="button" class="pv-insp-issue pv-insp-sty" onClick={() => onGoto?.(it.line)}><span class="pv-dim" aria-hidden="true">i</span> <span class="pv-insp-ln">L{it.line}</span> {it.message}<span class="pv-sr"> ({KIND[it.kind]} suggestion)</span></button></li>
          ))}</ul>}
      {list.length > MAX_STYLE && <p class="pv-insp-note">Showing the first {MAX_STYLE} of {list.length}.</p>}
    </div>
  );
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0) + '%';
function AuthSection({ a, onExport, onClear }: { a: NonNullable<InspectorPanelProps['auth']>; onExport?: (() => void) | undefined; onClear?: (() => void) | undefined }) {
  return (
    <div class="pv-insp-style">
      <h2>Authorship (approximate)</h2>
      <dl class="pv-insp-kv num">
        <dt>typed here</dt><dd>{pct(a.typed, a.len)}</dd>
        <dt>pasted</dt><dd>{pct(a.paste, a.len)}</dd>
        <dt>dropped</dt><dd>{pct(a.drop, a.len)}</dd>
        <dt>already there</dt><dd>{pct(a.import, a.len)}</dd>
      </dl>
      <p class="pv-insp-note">A local, self-reported record: pasted text is underlined in the editor. Approximate, kept only in this browser, never in the .md file, and not proof against tampering. "Already there" is text that was opened, inserted from a template, or written before the marks were on.</p>
      <div class="pv-insp-acts"><button type="button" class="pv-insp-fix" onClick={() => onExport?.()}>Export record (.json)</button><button type="button" class="pv-insp-fix" onClick={() => onClear?.()}>Start over</button></div>
    </div>
  );
}
