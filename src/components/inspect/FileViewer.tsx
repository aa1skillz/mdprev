import { useEffect, useRef, useState } from 'preact/hooks';
import { fmtBytes } from '../../lib/skills/report';
import type { Finding, VFile } from '../../lib/skills/types';

interface Props {
  file: VFile;
  /** đường dẫn hiển thị (tương đối với thư mục skill) */
  rel: string;
  line: number | undefined;
  findings: Finding[];
  onJump(line: number): void;
}

const MAX_LINES = 3000;
type Rendered = { path: string; html: string; blocked: number };

/** Xem file chỉ đọc: Source có số dòng và nhảy tới dòng; Preview cho Markdown (nạp lười, chặn ảnh ngoài). */
export function FileViewer({ file, rel, line, findings, onJump }: Props) {
  const isMd = /\.(md|markdown)$/i.test(file.path);
  const [tab, setTab] = useState<'source' | 'preview'>('source');
  const [pv, setPv] = useState<Rendered | null>(null);
  const hit = useRef<HTMLDivElement>(null);

  useEffect(() => { setTab('source'); setPv(null); }, [file.path]);
  useEffect(() => { if (tab === 'source') hit.current?.scrollIntoView({ block: 'center' }); }, [file.path, line, tab]);
  useEffect(() => {
    if (tab !== 'preview' || file.text === undefined) return;
    let stale = false;
    const text = file.text;
    const path = file.path;
    void (async () => {
      const [rc, guard] = await Promise.all([import('../../lib/studio/render-client'), import('../../lib/studio/guard')]);
      try {
        const r = await rc.renderInWorker(text);
        if (!stale) setPv({ path, ...guard.blockExternalImages(r.html) });
      } catch {
        if (!stale) setPv({ path, html: '<p>Could not render this file.</p>', blocked: 0 });
      }
    })();
    return () => { stale = true; };
  }, [tab, file.path]);

  const text = file.text;
  const lines = text === undefined ? [] : text.split('\n');
  // Preview chỉ cho file Markdown, và chỉ hiện kết quả của chính file này (không để nội dung file trước nhấp nháy khi đổi file).
  const preview = isMd && tab === 'preview';
  const pvHere = pv !== null && pv.path === file.path ? pv : null;
  // Cửa sổ hiển thị: tối đa MAX_LINES dòng, dời tới quanh dòng cần nhảy tới nếu nó nằm ngoài đoạn đầu.
  const from = line !== undefined && line > MAX_LINES ? Math.max(0, Math.min(line - Math.floor(MAX_LINES / 2) - 1, lines.length - MAX_LINES)) : 0;
  const shown = lines.slice(from, from + MAX_LINES);
  return (
    <section class="ix-view" aria-label={`File ${rel}`}>
      <div class="ix-vh">
        <span class="ix-mono p">{rel}</span>
        <span class="ix-fine">{fmtBytes(file.size)}</span>
        <span class="ix-sp" />
        {isMd && text !== undefined && (
          <div class="ix-tabs" role="group" aria-label="View as">
            <button type="button" aria-pressed={tab === 'source'} onClick={() => setTab('source')}>Source</button>
            <button type="button" aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button>
          </div>
        )}
      </div>
      {findings.length > 0 && (
        <ul class="ix-fnotes" aria-label="Findings in this file">
          {findings.map((f) => (
            <li>
              <span class="ix-tag" data-sev={f.severity}>{f.severity === 'review' ? 'REVIEW' : 'NOTE'}</span> {f.title}
              {f.line !== undefined && <> · <button type="button" class="ix-link" onClick={() => onJump(f.line!)}>line {f.line}</button></>}
            </li>
          ))}
        </ul>
      )}
      {text === undefined ? (
        <p class="ix-nofile">This file was not read: it is binary, or larger than the limit ({fmtBytes(file.size)}). Only text files are opened.</p>
      ) : preview ? (
        <>
          {pvHere && pvHere.blocked > 0 && <p class="ix-fine ix-blocked">{pvHere.blocked} external {pvHere.blocked === 1 ? 'image is' : 'images are'} not loaded.</p>}
          {pvHere ? <article class="md-doc ix-doc" dangerouslySetInnerHTML={{ __html: pvHere.html }} /> : <p class="ix-fine" role="status">Rendering…</p>}
        </>
      ) : (
        <div class="ix-src" role="region" aria-label={`Source of ${rel}`} tabIndex={0}>
          {shown.map((t, i) => (
            <div class="ix-ln" {...(line === from + i + 1 ? { 'data-hit': '1', ref: hit } : {})}><i>{from + i + 1}</i><span>{t === '' ? ' ' : t}</span></div>
          ))}
          {lines.length > MAX_LINES && <p class="ix-fine" style="padding:10px 14px">Showing lines {from + 1} to {from + shown.length} of {lines.length}.</p>}
        </div>
      )}
    </section>
  );
}
