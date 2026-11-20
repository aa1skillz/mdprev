import { fmtTokens } from '../../lib/skills/report';
import type { CollectionReport, SkillReport } from '../../lib/skills/types';

interface Props {
  source: string;
  report: CollectionReport;
  selected: Set<string>;
  onToggle(dir: string): void;
  onAll(on: boolean): void;
  onOpen(dir: string): void;
}

const notesOf = (s: SkillReport): { label: string; review: boolean } => {
  const review = s.findings.filter((f) => f.severity === 'review').length;
  if (review) return { label: `${review} REVIEW`, review: true };
  return { label: s.findings.length ? `${s.findings.length} ${s.findings.length === 1 ? 'note' : 'notes'}` : 'none', review: false };
};
const short = (s: string, n = 90): string => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

/** Bộ nhiều skill: bảng chọn và tổng token mức always của những skill được chọn. */
export function CollectionView({ source, report, selected, onToggle, onAll, onOpen }: Props) {
  const chosen = report.skills.filter((s) => selected.has(s.dir));
  const sum = chosen.reduce((n, s) => n + s.tokens.always, 0);
  return (
    <section class="ix-coll" aria-labelledby="ix-coll-h">
      <div class="ix-lbl">{source} · {report.skills.length} skills found</div>
      <h1 id="ix-coll-h">A collection</h1>
      <p class="ix-verdict" data-tone="ok">Installing all of them puts <em>{fmtTokens(report.alwaysTotal)} tokens</em> in every session before you type a word.</p>
      <div class="ix-table" role="table" aria-label="Skills in this collection">
        <div class="ix-tr ix-th ix-lbl" role="row">
          <span role="columnheader"><span class="ix-sr">Include</span></span>
          <span role="columnheader">Skill</span><span role="columnheader" class="d">What it says it does</span>
          <span role="columnheader" class="r">Always</span><span role="columnheader" class="r">On trigger</span><span role="columnheader" class="r">Notes</span>
        </div>
        {report.skills.map((s) => {
          const n = notesOf(s);
          const name = s.name ?? (s.dir || 'skill');
          const tpl = s.findings.some((f) => f.id === 'spec.name.template');
          return (
            <div class="ix-tr" role="row">
              <span role="cell"><input type="checkbox" checked={selected.has(s.dir)} onChange={() => onToggle(s.dir)} aria-label={`Include ${name}`} /></span>
              <span role="cell"><button type="button" class="ix-name" onClick={() => onOpen(s.dir)}>{name}</button>{tpl && <span class="ix-tpl"> template</span>}</span>
              <span role="cell" class="d" title={s.description ?? ''}>{short(s.description ?? '')}</span>
              <span role="cell" class="r mono">{fmtTokens(s.tokens.always)}</span>
              <span role="cell" class="r mono">{fmtTokens(s.tokens.trigger)}</span>
              <span role="cell" class="r"><span class="ix-tag" data-sev={n.review ? 'review' : 'none'}>{n.label}</span></span>
            </div>
          );
        })}
      </div>
      <p class="ix-fine" style="margin-top:14px">Token counts are estimates from character count. “Always” is what an agent loads at startup for every skill; “on trigger” is the whole SKILL.md.</p>
      <div class="ix-sel" role="region" aria-label="Selection">
        <span class="ix-mono"><b>{chosen.length} selected</b> · {fmtTokens(sum)} tokens always loaded</span>
        <span class="ix-sp" />
        <button type="button" class="ix-btn" onClick={() => onAll(true)}>Select all</button>
        <button type="button" class="ix-btn" onClick={() => onAll(false)}>Select none</button>
      </div>
    </section>
  );
}
