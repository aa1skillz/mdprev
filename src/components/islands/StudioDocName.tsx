import { sourceLabel } from '../../lib/studio/source';

/** Tên tài liệu + trạng thái lưu trong thanh `.pv-bar` (tách khỏi MarkdownStudio; chỉ nhận props, không có state riêng). */
export interface DocNameProps {
  crumb: { name: string; path: string } | null; // bản sao workspace: "workspace / đường dẫn"
  shown: string;
  fileName: string;
  dirty: boolean;
  saved: { ok: boolean; t: string | null };
  base: string | null;
  canBack: boolean;
  canFwd: boolean;
  onEditStart: (current: string) => void;
  onEdit: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onHistory: (d: -1 | 1) => void;
  hideName?: boolean; // đã có thanh tab: chỉ còn chấm chưa lưu, link nguồn, mũi tên lịch sử
}

export function DocName(p: DocNameProps) {
  return (
    <>
      {!p.hideName && (<>
        {p.crumb && <span class="pv-crumb" title={p.crumb.path ? `${p.crumb.name} / ${p.crumb.path}` : p.crumb.name}>{p.crumb.name}<i aria-hidden="true"> / </i></span>}
        <span class="pv-namewrap">
          <span class="pv-namemirror" aria-hidden="true">{p.shown + ' '}</span>
          <input class="pv-name" size={1} value={p.shown} title={p.shown} aria-label="File name" spellcheck={false}
            onFocus={() => p.onEditStart(p.fileName)} onInput={(ev) => p.onEdit((ev.target as HTMLInputElement).value)} onBlur={p.onCommit}
            onKeyDown={(ev) => { if (ev.isComposing) return; if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); else if (ev.key === 'Escape') { p.onCancel(); (ev.target as HTMLInputElement).blur(); } }} />
        </span>
      </>)}
      {p.dirty && <span class="pv-dirty" title="Unsaved changes" role="img" aria-label="Unsaved changes">●</span>}
      {p.base && <a class="pv-from" href={p.base} target="_blank" rel="noopener noreferrer" title={p.base}>{sourceLabel(p.base)}</a>}
      {(p.canBack || p.canFwd) && (
        <span class="pv-histnav" role="group" aria-label="Linked documents">
          <button type="button" class="pv-linkbtn" aria-label="Back" title="Previous document" disabled={!p.canBack} onClick={() => p.onHistory(-1)}>←</button>
          <button type="button" class="pv-linkbtn" aria-label="Forward" title="Next document" disabled={!p.canFwd} onClick={() => p.onHistory(1)}>→</button>
        </span>
      )}
    </>
  );
}
