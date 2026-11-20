/** Theme tài liệu, style đã lưu, CSS tuỳ ý (chỉ cục bộ) và template của người dùng. Nạp lười cùng theme.ts. */
import { useState } from 'preact/hooks';
import { FONTS, GALLERY, listSaved, listTemplates, sanitizeTheme, setUserCss, userCss, writeSaved, writeTemplates, type ColorKey, type DocTheme, type SavedTheme, type UserTemplate } from '../../lib/studio/theme';

export interface ThemeDialogProps {
  current: DocTheme;
  /** Áp theme (đã lọc) cho bản xem và lưu làm theme đang dùng. */
  onTheme: (t: DocTheme) => void;
  /** Văn bản hiện tại (để lưu làm template) và nạp template. */
  src: string;
  onTemplate: (body: string, name: string) => void;
  onClose: (msg?: string) => void;
}

const EDIT: [ColorKey, string][] = [['paper', 'Page'], ['body', 'Text'], ['ink', 'Headings'], ['accent', 'Links'], ['line', 'Rules'], ['code-bg', 'Code']];
const SIZES = ['', '15px', '16px', '17px', '18px', '19px', '20px'];
const WIDTHS = ['', '640px', '720px', '800px', '960px'];
const same = (a: DocTheme, b: DocTheme) => JSON.stringify(sanitizeTheme(a)) === JSON.stringify(sanitizeTheme(b));

/** Màu bất kỳ (oklch, rgb…) → #rrggbb cho ô chọn màu, qua một điểm ảnh canvas. */
function hexOf(c: string): string {
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0, 0, 1, 1);
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
    return '#' + [r, gg, b].map((n) => (n ?? 0).toString(16).padStart(2, '0')).join('');
  } catch { return '#000000'; }
}
const live = (k: string) => getComputedStyle(document.querySelector('.pv-out') ?? document.documentElement).getPropertyValue('--' + k).trim();

export default function ThemeDialog(p: ThemeDialogProps) {
  const [t, setT] = useState<DocTheme>(p.current);
  const [saved, setSaved] = useState<SavedTheme[]>(listSaved);
  const [tpls, setTpls] = useState<UserTemplate[]>(listTemplates);
  const [name, setName] = useState('');
  const [tname, setTname] = useState('');
  const [css, setCss] = useState(userCss);
  const apply = (n: DocTheme) => { const s = sanitizeTheme(n); setT(s); p.onTheme(s); };
  const set = (k: keyof DocTheme, v: string) => { const n = { ...t }; if (v) n[k] = v; else delete n[k]; apply(n); };
  const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); p.onClose(); } };

  return (
    <div class="pv-thdlg" role="dialog" aria-label="Document theme" data-focus-hide onKeyDown={key}>
      <div class="pv-thh"><h2>Document theme</h2><button type="button" class="pv-thx" onClick={() => p.onClose()}>Done</button></div>
      <div class="pv-thsec" role="group" aria-label="Themes">
        {GALLERY.map((g) => {
          const th = g.theme;
          return (
            <button key={g.id} type="button" class="pv-thsw" aria-pressed={same(t, th)} onClick={() => apply(th)}
              style={th.paper ? `background:${th.paper};color:${th.ink ?? 'inherit'}` : undefined}>
              <b style={th.font ? `font-family:${FONTS[th.font]?.css ?? 'inherit'}` : undefined}>Aa</b><i style={th.accent ? `background:${th.accent}` : undefined} />{g.label}
            </button>
          );
        })}
        {saved.map((s, i) => (
          <span key={'s' + i} class="pv-thsaved">
            <button type="button" class="pv-thsw" aria-pressed={same(t, s.theme)} onClick={() => apply(s.theme)} style={s.theme.paper ? `background:${s.theme.paper};color:${s.theme.ink ?? 'inherit'}` : undefined}><b>Aa</b><i style={s.theme.accent ? `background:${s.theme.accent}` : undefined} />{s.name}</button>
            <button type="button" class="pv-thdel" aria-label={`Delete ${s.name}`} onClick={() => { const l = saved.filter((_, j) => j !== i); setSaved(l); writeSaved(l); }}>×</button>
          </span>
        ))}
      </div>
      <h3>Customize</h3>
      <div class="pv-thgrid">
        {EDIT.map(([k, label]) => (
          <label key={k}>{label}<input type="color" value={hexOf(t[k] ?? live(k))} onInput={(ev) => set(k, (ev.target as HTMLInputElement).value)} /></label>
        ))}
        <label>Font<select value={t.font ?? ''} onChange={(ev) => set('font', (ev.target as HTMLSelectElement).value)}><option value="">Default</option>{Object.entries(FONTS).map(([k, f]) => <option value={k}>{f.label}</option>)}</select></label>
        <label>Size<select value={t.size ?? ''} onChange={(ev) => set('size', (ev.target as HTMLSelectElement).value)}>{SIZES.map((s) => <option value={s}>{s || 'Default'}</option>)}</select></label>
        <label>Width<select value={t.measure ?? ''} onChange={(ev) => set('measure', (ev.target as HTMLSelectElement).value)}>{WIDTHS.map((s) => <option value={s}>{s || 'Default'}</option>)}</select></label>
      </div>
      <div class="pv-throw">
        <input type="text" aria-label="Style name" placeholder="Name this style" value={name} onInput={(ev) => setName((ev.target as HTMLInputElement).value)} />
        <button type="button" disabled={!name.trim() || !Object.keys(t).length} onClick={() => { const l = [...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), theme: t }]; setSaved(l); writeSaved(l); setName(''); }}>Save style</button>
      </div>
      <p class="pv-thnote">Theme colors, font and size travel with share links (checked on the other side). Custom CSS below never does.</p>
      <details class="pv-thmore">
        <summary>Custom CSS (this browser only)</summary>
        <textarea aria-label="Custom CSS" spellcheck={false} rows={5} value={css} placeholder=".md-doc h1 { letter-spacing: -0.02em; }" onInput={(ev) => setCss((ev.target as HTMLTextAreaElement).value)} />
        <div class="pv-throw"><button type="button" onClick={() => { setUserCss(css); p.onClose(css.trim() ? 'CUSTOM CSS APPLIED · STAYS IN THIS BROWSER' : 'CUSTOM CSS REMOVED'); }}>Apply CSS</button></div>
      </details>
      <details class="pv-thmore">
        <summary>My templates</summary>
        <div class="pv-throw">
          <input type="text" aria-label="Template name" placeholder="Template name" value={tname} onInput={(ev) => setTname((ev.target as HTMLInputElement).value)} />
          <button type="button" disabled={!tname.trim()} onClick={() => { const l = [...tpls.filter((x) => x.name !== tname.trim()), { name: tname.trim(), body: p.src }]; setTpls(l); writeTemplates(l); setTname(''); }}>Save this document</button>
        </div>
        {tpls.length > 0 && <ul class="pv-thtpl">{tpls.map((x, i) => (
          <li key={i}><button type="button" onClick={() => p.onTemplate(x.body, x.name)}>New from “{x.name}”</button><button type="button" class="pv-thdel" aria-label={`Delete template ${x.name}`} onClick={() => { const l = tpls.filter((_, j) => j !== i); setTpls(l); writeTemplates(l); }}>×</button></li>
        ))}</ul>}
      </details>
    </div>
  );
}
