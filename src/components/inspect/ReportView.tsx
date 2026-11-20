import { useState } from 'preact/hooks';
import { excerptOf, fmtBytes, fmtTokens, reportToMarkdown, verdictFor } from '../../lib/skills/report';
import type { SkillReport, Vfs } from '../../lib/skills/types';
import { copyText } from '../../lib/clipboard';

interface Props {
  source: string;
  skill: SkillReport;
  vfs: Vfs;
  onOpen(path: string, line?: number): void;
}

const NOTE_WORD: Record<string, string> = { net: 'network', install: 'installs packages', 'rm-rf': 'deletes folders' };
const rel = (dir: string, p: string): string => (dir === '' ? p : p.startsWith(dir + '/') ? p.slice(dir.length + 1) : p);

const installName = (s: SkillReport): string => s.name ?? (s.dir === '' ? 'skill-name' : s.dir.slice(s.dir.lastIndexOf('/') + 1));
/** Nơi đặt thư mục skill cho Claude Code (theo tài liệu chính thức code.claude.com/docs/en/skills): cá nhân và theo dự án. */
const installPaths = (s: SkillReport): [string, string][] => [['Claude Code · all projects', `~/.claude/skills/${installName(s)}/`], ['Claude Code · this project', `.claude/skills/${installName(s)}/`]];

/** Báo cáo của một skill (hướng R): câu kết luận, ba con số, phát hiện có trích dòng, token đi đâu, script. */
export function ReportView({ source, skill, vfs, onOpen }: Props) {
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  const [pathCopied, setPathCopied] = useState('');
  const copyPath = async (path: string, label: string) => { if (await copyText(path)) { setPathCopied(label); setTimeout(() => setPathCopied(''), 2000); } };
  const v = verdictFor(skill);
  const isLicence = (p: string): boolean => /(^|\/)(LICEN[CS]E|NOTICE|COPYING)[^/]*$/i.test(p);
  const withTokens = skill.files.filter((f) => f.tokens > 0 && !isLicence(f.path));
  const licenceHidden = skill.files.some((f) => f.tokens > 0 && isLicence(f.path));
  const maxTok = Math.max(1, ...withTokens.map((f) => f.tokens));
  const top = [...withTokens].sort((a, b) => b.tokens - a.tokens).slice(0, 6);
  const skillMd = skill.dir === '' ? 'SKILL.md' : `${skill.dir}/SKILL.md`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(reportToMarkdown(source, skill)); setCopied('ok'); } catch { setCopied('fail'); }
    setTimeout(() => setCopied(''), 2500);
  };

  return (
    <article class="ix-report" aria-labelledby="ix-rep-h">
      <div class="ix-lbl">Inspection · {skill.dir === '' ? 'root' : skill.dir}</div>
      <h1 id="ix-rep-h">{skill.name ?? (skill.dir || 'SKILL.md')}</h1>
      <p class="ix-verdict" data-tone={v.tone}>{v.parts.map((p) => (p.em ? <em>{p.text}</em> : p.text))}</p>

      <div class="ix-figs">
        <div><b>{fmtTokens(skill.tokens.always)}</b><span>tokens, always loaded</span></div>
        <div><b>{fmtTokens(skill.tokens.trigger)}</b><span>when the skill triggers</span></div>
        <div><b>{skill.files.length}</b><span>files · {fmtTokens(skill.tokens.all)} tokens if all are read</span></div>
      </div>

      <h2 class="ix-lbl ix-h2">Findings · {skill.findings.length}</h2>
      {skill.findings.length === 0 ? <p class="ix-none">Nothing to flag.</p> : (
        <ol class="ix-finds">
          {skill.findings.map((f, i) => {
            const ex = f.file ? excerptOf(vfs.get(f.file)?.text, f.line) : [];
            const file = f.file;
            return (
              <li class="ix-find">
                <span class="n" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{f.title} <span class="ix-tag" data-sev={f.severity}>{f.severity === 'review' ? 'REVIEW' : 'NOTE'}</span></h3>
                  <p>{f.detail}</p>
                  {ex.length > 0 && <pre class="ix-ex" aria-label={`Line ${ex[0]!.line} of ${file}`}>{ex.map((l) => <><i>{l.line}</i>{l.text}{'\n'}</>)}</pre>}
                  {file && <button type="button" class="ix-link" onClick={() => onOpen(file, f.line)}>{f.line ? `Open ${rel(skill.dir, file)} at line ${f.line}` : `Open ${rel(skill.dir, file)}`}</button>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {top.length > 0 && (
        <>
          <h2 class="ix-lbl ix-h2">Where the tokens go</h2>
          <div class="ix-rows">
            {top.map((f) => (
              <button type="button" class="ix-row" onClick={() => onOpen(f.path)}>
                <span class="p">{rel(skill.dir, f.path)}</span>
                <span class="b" aria-hidden="true"><i style={`width:${Math.max(2, Math.round((f.tokens / maxTok) * 100))}%`} /></span>
                <span class="t">{fmtTokens(f.tokens)}</span>
              </button>
            ))}
          </div>
          <p class="ix-fine">{withTokens.length > top.length ? `and ${withTokens.length - top.length} smaller files. ` : ''}{licenceHidden ? 'Licence files are not listed. ' : ''}Estimates from character count.</p>
        </>
      )}

      {skill.scripts.length > 0 && (
        <>
          <h2 class="ix-lbl ix-h2">Scripts · {skill.scripts.length}</h2>
          <div class="ix-rows">
            {skill.scripts.map((s) => {
              const review = s.findings.filter((x) => x.severity === 'review').length;
              const notes = [...new Set(s.findings.filter((x) => x.severity === 'note').map((x) => NOTE_WORD[x.ruleId] ?? x.ruleId))];
              return (
                <button type="button" class="ix-row ix-script" onClick={() => onOpen(s.path, s.findings[0]?.line)}>
                  <span class="p">{rel(skill.dir, s.path)}</span>
                  <span class="w">{notes.join(', ')}</span>
                  <span class="ix-tag" data-sev={review ? 'review' : 'none'}>{review ? 'REVIEW' : 'NOTHING TO REVIEW'}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <h2 class="ix-lbl ix-h2">Install</h2>
      <div class="ix-rows ix-install">
        {installPaths(skill).map(([label, path]) => (
          <div class="ix-inst" key={label}>
            <span class="ix-inst-l">{label}</span>
            <code>{path}</code>
            <button type="button" class="ix-btn" onClick={() => void copyPath(path, label)} aria-label={`Copy path for ${label}`}>{pathCopied === label ? 'Copied' : 'Copy'}</button>
          </div>
        ))}
      </div>
      <p class="ix-fine">On claude.ai, zip the folder so that <code>{installName(skill)}/SKILL.md</code> sits at the top level, then upload it under Customize › Skills. Paths are from the <a href="https://code.claude.com/docs/en/skills">Claude Code docs</a>; check them against your version.</p>

      <div class="ix-acts">
        <button type="button" class="ix-btn solid" onClick={() => onOpen(skillMd)}>Open SKILL.md</button>
        <button type="button" class="ix-btn" onClick={() => void copy()}>{copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Could not copy' : 'Copy as Markdown'}</button>
        <span class="ix-sr" role="status">{copied === 'ok' ? 'Report copied' : ''}</span>
      </div>
      <p class="ix-fine ix-foot">Static scan of known patterns, not a safety guarantee: a clean report does not make a script safe, and a flag does not make it harmful. Token counts are estimates. Nothing was run. {fmtBytes(skill.files.reduce((n, f) => n + f.size, 0))} in this skill.</p>
    </article>
  );
}
