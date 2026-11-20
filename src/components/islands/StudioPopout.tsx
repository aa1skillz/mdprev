import { Icon } from './icons';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ensureKatexCss } from '../../lib/studio/katex-css';
import { copyText } from '../../lib/clipboard';
import { POPOUT_CHANNEL, type PopMsg } from '../../lib/studio/popout';
import { collectLineEls, scrollTopForLine } from '../../lib/studio/sync';
import { themeForStorageEvent } from '../../lib/prefs';

/** Cửa sổ chỉ có bản xem, nhận nội dung từ studio qua BroadcastChannel (cùng nguồn gốc, không qua server). */
export default function StudioPopout() {
  const [html, setHtml] = useState('');
  const [fm, setFm] = useState<{ rows: [string, string][] } | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [docStyle, setDocStyle] = useState('default');
  const [flash, setFlash] = useState('');
  const out = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLElement>(null);
  const line = useRef(1);
  const bc = useRef<BroadcastChannel | null>(null);

  /** Theme tài liệu từ studio (đã lọc ở đó): chỉ nhận biến màu có tên đã biết, giá trị qua setProperty. */
  const applyTheme = (dt: Extract<PopMsg, { t: 'html' }>['dt']) => {
    const r = document.documentElement, d = doc.current;
    for (const k of [...r.style]) if (k.startsWith('--')) r.style.removeProperty(k);
    for (const [k, v] of dt?.vars ?? []) if (/^--[a-z0-9-]+$/.test(k)) r.style.setProperty(k, v);
    r.toggleAttribute('data-dt', !!dt?.vars.length);
    if (d) { d.style.fontFamily = dt?.doc.fontFamily ?? ''; d.style.fontSize = dt?.doc.fontSize ?? ''; d.style.maxWidth = dt?.doc.maxWidth ?? ''; }
  };
  const follow = () => {
    const o = out.current, d = doc.current; if (!o || !d) return;
    o.scrollTop = scrollTopForLine(o, collectLineEls(d), line.current);
  };
  useEffect(() => {
    const ch = new BroadcastChannel(POPOUT_CHANNEL);
    bc.current = ch;
    ch.onmessage = (e: MessageEvent<PopMsg>) => {
      const m = e.data;
      if (!m || typeof m !== 'object') return; // chỉ nhận đúng dạng thông điệp của studio
      if (m.t === 'html') { setHtml(m.html); setFm(m.fm); setDocStyle(m.doc ?? 'default'); setWaiting(false); document.title = `${m.title} · Preview`; applyTheme(m.dt); }
      else if (m.t === 'scroll') { line.current = m.line; follow(); }
    };
    ch.postMessage({ t: 'hello' } satisfies PopMsg);
    const theme = (e: StorageEvent) => { const t = themeForStorageEvent(e.key, e.newValue, matchMedia('(prefers-color-scheme: dark)').matches); if (t) document.documentElement.dataset['theme'] = t; };
    window.addEventListener('storage', theme);
    return () => { ch.close(); window.removeEventListener('storage', theme); };
  }, []);
  useEffect(() => { follow(); }, [html]);
  useEffect(() => { if (html.includes('class="katex')) void ensureKatexCss(); }, [html]);

  const onClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest('.cb-copy');
    if (!btn) return;
    copyText(btn.closest('.cb')?.querySelector('pre')?.textContent ?? '').then((k) => { if (k) { setFlash('COPIED'); btn.setAttribute('data-done', ''); setTimeout(() => { setFlash(''); btn.removeAttribute('data-done'); }, 1500); } });
  };

  return (
    <div class="pop" lang="en">
      <div class="pop-bar" role="status">
        <span><b>Preview</b> <span class="pv-dim">· linked to the editor</span></span>
        <span class="pop-r">{flash && <span class="pv-flash">{flash}</span>}<button type="button" class="pv-linkbtn" aria-label="Print" title="Print this preview" onClick={() => window.print()}><Icon n="print" /></button></span>
      </div>
      <div class="pop-out" ref={out} onClick={onClick} tabIndex={0}>
        <div class="pv-page">
          {waiting && <p class="pop-wait">Waiting for the editor. Open the editor in the main window and choose <b>pop out</b>.</p>}
          {fm && fm.rows.length > 0 && (
            <table class="pv-props" aria-label="Front matter"><tbody>{fm.rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td><div title={v}>{v}</div></td></tr>)}</tbody></table>
          )}
          <article class="md-doc" ref={doc} data-doc={docStyle === 'default' ? undefined : docStyle} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
