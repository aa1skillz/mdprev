/** Link chia sẻ có mật khẩu (`#e=`): thẻ tạo link và thẻ mở link. Nạp lười cùng share-crypt. Mật khẩu chỉ nằm trong state của thẻ này. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { canEncrypt, decryptShare, encryptShare, peekShare } from '../../lib/studio/share-crypt';
import type { SharedDoc } from '../../lib/studio/share';

export interface ShareDialogProps {
  /** new: tạo link từ tài liệu hiện tại; open: mở payload `#e=` vừa nhận. */
  mode: 'new' | 'open';
  doc?: SharedDoc;
  payload?: string;
  /** Chép link, trả về true nếu chép được. */
  copy?: (url: string) => Promise<boolean>;
  onOpen?: (doc: SharedDoc) => void;
  onClose: (msg?: string) => void;
}

const EXPIRY: [string, number][] = [['No expiry', 0], ['1 day', 1], ['7 days', 7], ['30 days', 30]];
const BAD = 'Could not open: the password is wrong or the link is damaged.';
const fmt = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function ShareDialog(p: ShareDialogProps) {
  const [pw, setPw] = useState('');
  const [days, setDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  const ok = canEncrypt();
  const peek = p.mode === 'open' && p.payload ? peekShare(p.payload) : null;
  const expired = !!peek?.expiresAt && peek.expiresAt <= Date.now();
  useEffect(() => { inp.current?.focus(); }, []);

  const submit = async () => {
    if (busy || !ok) return;
    if (!pw) { setErr('Enter a password.'); return; }
    if (p.mode === 'new' && [...pw].length < 8) { setErr('Use at least 8 characters: the link can be guessed offline.'); return; }
    setBusy(true); setErr('');
    if (p.mode === 'new' && p.doc) {
      let payload: string;
      try { payload = await encryptShare(p.doc, pw, days ? { expiresAt: Date.now() + days * 86_400_000 } : {}); } catch { setBusy(false); setErr('Could not encrypt in this browser.'); return; }
      const url = `${location.origin}${location.pathname}#e=${payload}`;
      setPw('');
      if (url.length > 16000) { setBusy(false); p.onClose(`TOO LARGE FOR A LINK (${Math.round(p.doc.md.length / 1024)} KB), USE EXPORT`); return; }
      const copied = await (p.copy?.(url) ?? Promise.resolve(false));
      p.onClose(copied ? 'COPIED PROTECTED LINK · SEND THE PASSWORD SEPARATELY' : 'COULD NOT COPY THE LINK');
      return;
    }
    if (p.mode === 'open' && p.payload) {
      const d = await decryptShare(p.payload, pw);
      setBusy(false);
      if (!d) { setErr(BAD); inp.current?.select(); return; }
      setPw('');
      p.onOpen?.(d);
    }
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); p.onClose(p.mode === 'open' ? 'SHARED DOCUMENT NOT OPENED' : undefined); }
    else if (ev.key === 'Enter' && !ev.isComposing && (ev.target as HTMLElement).tagName === 'INPUT') { ev.preventDefault(); void submit(); }
  };
  const cancel = <button type="button" onClick={() => p.onClose(p.mode === 'open' ? 'SHARED DOCUMENT NOT OPENED' : undefined)}>{expired || !ok ? 'Close' : 'Cancel'}</button>;

  if (!ok) return (
    <div class="pv-guard pv-urldlg pv-sharedlg" role="alertdialog" aria-label="Password-protected link" data-focus-hide onKeyDown={key}>
      <span class="pv-dlgsub">Password-protected links need a secure page (HTTPS) and a recent browser.</span>
      <span class="pv-guard-act">{cancel}</span>
    </div>
  );
  if (expired) return (
    <div class="pv-guard pv-urldlg pv-sharedlg" role="alertdialog" aria-label="Shared link expired" data-focus-hide onKeyDown={key}>
      <span class="pv-dlgsub">This shared link expired on {fmt(peek!.expiresAt!)}. Ask the sender for a new one.</span>
      <span class="pv-guard-act">{cancel}</span>
    </div>
  );
  const isNew = p.mode === 'new';
  return (
    <div class="pv-guard pv-urldlg pv-sharedlg" role="dialog" aria-label={isNew ? 'Share with a password' : 'Open protected document'} data-focus-hide onKeyDown={key}>
      <div class="pv-dlgh">
        <span class="pv-urllab">{isNew ? 'Share with a password' : 'Open protected document'}</span>
        <span class="pv-dlgsub">{isNew ? 'Creates a link whose text is encrypted in this browser.' : 'Enter the password to open it. It replaces the text on screen; yours stays in Restore previous.'}</span>
      </div>
      <div class="pv-field">
        <label for="pv-share-pw">Password</label>
        <div class="pv-pwrow">
          <input ref={inp} id="pv-share-pw" class="pv-urlin" type={(show ? 'text' : 'password') as 'password'} autoComplete={isNew ? 'new-password' : 'off'} spellcheck={false} value={pw} disabled={busy}
            aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'pv-share-err' : isNew ? 'pv-share-hint' : undefined} onInput={(ev) => { setPw((ev.target as HTMLInputElement).value); setErr(''); }} />
          <button type="button" class="pv-pwtog" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        {isNew && !err && <span id="pv-share-hint" class="pv-hint">At least 8 characters. Send it by a different channel than the link.</span>}
        {err && <span id="pv-share-err" class="pv-urlerr" role="alert">{err}</span>}
      </div>
      {isNew && (
        <div class="pv-field">
          <label for="pv-share-exp">Link expires</label>
          <select id="pv-share-exp" class="pv-sel" value={days} onChange={(ev) => setDays(Number((ev.target as HTMLSelectElement).value))}>{EXPIRY.map(([l, d]) => <option value={d}>{l}</option>)}</select>
        </div>
      )}
      {isNew && <p class="pv-sharenote">Expiry is soft: this page refuses to open the link afterwards, but anyone who already opened or copied the text keeps it.</p>}
      {!isNew && peek?.expiresAt && <p class="pv-sharenote">This link expires {fmt(peek.expiresAt)}.</p>}
      <span class="pv-guard-act">{cancel}<button type="button" class="pv-guard-go" onClick={() => void submit()} disabled={busy}>{busy ? (isNew ? 'Encrypting…' : 'Opening…') : isNew ? 'Copy link' : 'Open'}</button></span>
    </div>
  );
}
