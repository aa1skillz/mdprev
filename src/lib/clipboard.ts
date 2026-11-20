import { emit } from './bus';
/** Chép vào clipboard; bị chặn thì hiện hộp chép thủ công (lớp dự phòng cho khung nhúng). */
export async function copyText(text: string): Promise<boolean> {
  const legacy = (): boolean => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* bỏ qua */ }
    ta.remove();
    if (!ok) emit('copy-fallback', text);
    return ok;
  };
  try { await navigator.clipboard.writeText(text); return true; } catch { return legacy(); }
}
