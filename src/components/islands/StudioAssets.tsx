import { useEffect, useRef, useState } from 'preact/hooks';
import { assetUrl, deleteAssets, listAssets, refsIn, type AssetInfo } from '../../lib/studio/assets';
import { listSnapshots } from '../../lib/studio/history';
import { KEYS, readString } from '../../lib/storage';

interface Props {
  src: string;
  /** Chèn `![alt](asset:id)` vào chỗ con trỏ. */
  onInsert: (id: string, name: string) => void;
  onClose: () => void;
  say: (msg: string) => void;
}
type Use = 'doc' | 'kept' | 'vault' | 'unused';

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const USE_LABEL: Record<Use, string> = { doc: 'in document', kept: 'in history', vault: 'in a vault', unused: 'unused' };

/**
 * Ngăn Images: ảnh đã dán vào studio (IndexedDB). "Unused" nghĩa là không có trong tài liệu, trong Restore previous
 * hay trong bản chụp History nào: xoá ảnh còn được bản cũ nhắc tới thì khôi phục bản đó sẽ mất ảnh.
 */
export function StudioAssets({ src, onInsert, onClose, say }: Props) {
  const [items, setItems] = useState<AssetInfo[] | null | undefined>(undefined);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [inVault, setInVault] = useState<Set<string>>(new Set()); // ảnh của vault đang mở hay đã lưu: không phải "unused"
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const box = useRef<HTMLDivElement>(null);

  const reload = async () => {
    const [list, snaps] = await Promise.all([listAssets(), listSnapshots()]);
    const k = new Set<string>();
    for (const s of snaps ?? []) refsIn(s.text).forEach((id) => k.add(id));
    refsIn(readString(KEYS.mdPrev) ?? '').forEach((id) => k.add(id));
    setKept(k);
    setInVault(await import('../../lib/workspace/store').then((m) => m.imageIdsInUse()).catch(() => new Set<string>()));
    setItems(list);
    const t: Record<string, string> = {};
    await Promise.all((list ?? []).map(async (a) => { const u = await assetUrl(a.id); if (u) t[a.id] = u; }));
    setThumbs(t);
  };
  useEffect(() => { void reload(); box.current?.focus(); }, []);

  const inDoc = refsIn(src);
  const useOf = (id: string): Use => (inDoc.has(id) ? 'doc' : kept.has(id) ? 'kept' : inVault.has(id) ? 'vault' : 'unused');
  const unused = (items ?? []).filter((a) => useOf(a.id) === 'unused');
  const total = (items ?? []).reduce((n, a) => n + a.size, 0);

  const remove = async (ids: string[], what: string) => {
    if (!ids.length) return;
    const used = ids.filter((id) => useOf(id) !== 'unused').length;
    const msg = used ? `Delete ${what}? ${used} of them still appear in the document or history and will show as missing.` : `Delete ${what}? This cannot be undone.`;
    if (!confirm(msg)) return;
    const ok = await deleteAssets(ids);
    say(ok ? `DELETED ${ids.length} ${ids.length === 1 ? 'IMAGE' : 'IMAGES'}` : 'COULD NOT DELETE');
    await reload();
  };

  return (
    <div class="hs as" role="dialog" aria-label="Images" tabIndex={-1} ref={box} onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); onClose(); } }}>
      <div class="hs-h">
        <span>Images{items ? ` · ${items.length} · ${kb(total)}` : ''}</span>
        <button type="button" class="pv-linkbtn" onClick={onClose}>CLOSE</button>
      </div>
      <p class="hs-msg">Pasted images live in this browser only. Export HTML or copy rich text to take them with the document.</p>
      <div class="hs-b">
        {items === undefined ? <p class="hs-msg">Loading…</p>
          : items === null ? <p class="hs-msg">This browser has no IndexedDB, so images cannot be stored.</p>
            : !items.length ? <p class="hs-msg">No images yet. Paste or drop an image into the editor.</p>
              : (
                <ul class="as-list">
                  {items.map((a) => {
                    const u = useOf(a.id);
                    return (
                      <li key={a.id} class="as-row">
                        {thumbs[a.id] ? <img class="as-th" src={thumbs[a.id]} alt="" /> : <span class="as-th" />}
                        <span class="as-meta">
                          <b title={a.name}>{a.name || a.id}</b>
                          <span>{kb(a.size)} · <span class={'as-use as-' + u}>{USE_LABEL[u]}</span></span>
                        </span>
                        <span class="as-acts">
                          <button type="button" class="pv-linkbtn" onClick={() => onInsert(a.id, a.name)}>INSERT</button>
                          <button type="button" class="pv-linkbtn" onClick={() => { void remove([a.id], 'this image'); }}>DELETE</button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
      </div>
      <div class="hs-f">
        <button type="button" class="pv-linkbtn" disabled={!unused.length} onClick={() => { void remove(unused.map((a) => a.id), `${unused.length} unused ${unused.length === 1 ? 'image' : 'images'}`); }}>
          REMOVE {unused.length} UNUSED{unused.length ? ` · ${kb(unused.reduce((n, a) => n + a.size, 0))}` : ''}
        </button>
      </div>
    </div>
  );
}
