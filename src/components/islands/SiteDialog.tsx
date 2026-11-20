/** Xuất vault thành site tĩnh (mục 2). Nạp lười cùng bộ dựng site: kiểm link hỏng ngay khi mở, rồi mới dựng zip. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { buildSiteZip, checkVault, type SiteImage, type SiteNote } from '../../lib/vault/site';
import { assetBlob } from '../../lib/studio/assets';

export interface SiteDialogProps {
  name: string;
  notes: SiteNote[];
  /** Ảnh của vault (byte ở kho ảnh của studio). */
  images: { path: string; id: string }[];
  /** Nhảy tới dòng có link hỏng (đóng hộp thoại). */
  onGoto: (path: string, line: number) => void;
  onClose: (msg?: string) => void;
}

const KIND = { note: 'missing note', heading: 'missing heading or block', file: 'missing file' } as const;
const MAX_LIST = 50;

export default function SiteDialog(p: SiteDialogProps) {
  const check = useMemo(() => checkVault(p.notes, p.images.map((i) => i.path)), [p.notes, p.images]);
  const [title, setTitle] = useState(p.name);
  const [base, setBase] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);

  const go = async () => {
    if (busy) return;
    const b = base.trim();
    if (b && !/^https?:\/\/[^\s/]+/i.test(b)) { setErr('The site address must start with https:// (or leave it empty).'); return; }
    setBusy(true); setErr('');
    try {
      const imgs: SiteImage[] = [];
      let lost = 0;
      for (const i of p.images) { const bl = await assetBlob(i.id); if (bl) imgs.push({ path: i.path, bytes: new Uint8Array(await bl.arrayBuffer()) }); else lost++; }
      const r = await buildSiteZip(p.notes, { title: title.trim() || p.name, baseUrl: b || undefined, now: new Date() }, imgs);
      const n = (p.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'site') + '-site.zip';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.zip as BlobPart], { type: 'application/zip' })); a.download = n;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      p.onClose(`DOWNLOADED ${n} · ${r.pages} ${r.pages === 1 ? 'PAGE' : 'PAGES'}${r.images ? ` · ${r.images} ${r.images === 1 ? 'IMAGE' : 'IMAGES'}` : ''}${lost ? ` · ${lost} MISSING ${lost === 1 ? 'IMAGE' : 'IMAGES'}` : ''}${r.broken.length ? ` · ${r.broken.length} BROKEN ${r.broken.length === 1 ? 'LINK' : 'LINKS'}` : ''}`);
    } catch { setBusy(false); setErr('Could not build the site in this browser.'); }
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); p.onClose(); }
    else if (ev.key === 'Enter' && !ev.isComposing && (ev.target as HTMLElement).tagName === 'INPUT') { ev.preventDefault(); void go(); }
  };
  const nb = check.broken.length;
  const stats = [`${check.notes} ${check.notes === 1 ? 'note' : 'notes'}`, ...(p.images.length ? [`${p.images.length} ${p.images.length === 1 ? 'image' : 'images'}`] : []), `${check.links} ${check.links === 1 ? 'link' : 'links'}`];
  return (
    <div class="pv-guard pv-urldlg pv-sharedlg pv-sitedlg" role="dialog" aria-label="Export static site" data-focus-hide onKeyDown={key}>
      <div class="pv-dlgh">
        <span class="pv-urllab">Export static site</span>
        <span class="pv-dlgsub">{stats.join(' · ')} · <span class={nb ? 'pv-bad' : 'pv-good'}>{nb ? `${nb} broken` : 'no broken links'}</span></span>
      </div>
      {nb > 0 && (
        <ul class="pv-sitebroken" aria-label="Broken links">
          {check.broken.slice(0, MAX_LIST).map((b, i) => (
            <li key={i}><button type="button" onClick={() => p.onGoto(b.from, b.line)} title="Go to this line">{b.from}:{b.line}</button> <code>{b.target}</code> <span>{KIND[b.kind]}</span></li>
          ))}
          {nb > MAX_LIST && <li>…and {nb - MAX_LIST} more</li>}
        </ul>
      )}
      <div class="pv-field">
        <label for="pv-site-title">Site title</label>
        <input ref={inp} id="pv-site-title" class="pv-urlin" value={title} disabled={busy} onInput={(ev) => setTitle((ev.target as HTMLInputElement).value)} />
      </div>
      <div class="pv-field">
        <label for="pv-site-base">Site address <em>optional</em></label>
        <input id="pv-site-base" class="pv-urlin" type="url" placeholder="https://example.com/notes" value={base} disabled={busy} spellcheck={false}
          aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'pv-site-err' : 'pv-site-hint'} onInput={(ev) => { setBase((ev.target as HTMLInputElement).value); setErr(''); }} />
        <span id="pv-site-hint" class="pv-hint">Adds a sitemap and share previews.</span>
        {err && <span id="pv-site-err" class="pv-urlerr" role="alert">{err}</span>}
      </div>
      <p class="pv-sharenote">One page per note, with backlinks, link previews and the vault's images. It also opens from disk; upload the unzipped folder to any static host.</p>
      <span class="pv-guard-act">
        <button type="button" onClick={() => p.onClose()}>Cancel</button>
        <button type="button" class="pv-guard-go" onClick={() => void go()} disabled={busy}>{busy ? 'Building…' : nb ? 'Export anyway' : 'Export zip'}</button>
      </span>
    </div>
  );
}
