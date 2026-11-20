/** So sánh theo dòng giữa bản đã mở/đã lưu và bản hiện tại, để vẽ dấu thay đổi ở lề số dòng. Số dòng 1-based theo bản hiện tại. */
export interface LineDiff { added: number[]; modified: number[]; deleted: number[] }

export function diffLines(a: string[], b: string[]): LineDiff {
  const res: LineDiff = { added: [], modified: [], deleted: [] };
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let ae = a.length, be = b.length;
  while (ae > p && be > p && a[ae - 1] === b[be - 1]) { ae--; be--; }
  const A = a.slice(p, ae), B = b.slice(p, be);
  const mark = (kind: 'added' | 'modified', from: number, n: number) => { for (let i = 0; i < n; i++) res[kind].push(p + from + i + 1); };
  if (!A.length && !B.length) return res;
  if (!A.length) { mark('added', 0, B.length); return res; }
  if (!B.length) { res.deleted.push(Math.min(p + 1, b.length || 1)); return res; }
  const ops = myers(A, B);
  if (!ops) { mark('modified', 0, B.length); return res; }
  let ai = 0, bj = 0, hd = 0, ha = 0, hb = 0; // hd: số dòng bị xoá trong hunk, ha: số dòng thêm, hb: chỉ số đầu hunk bên B
  const flush = () => {
    if (hd || ha) {
      mark('modified', hb, Math.min(hd, ha));
      if (ha > hd) mark('added', hb + hd, ha - hd);
      if (hd > ha) res.deleted.push(Math.min(p + hb + ha + 1, b.length || 1));
    }
    hd = ha = 0;
  };
  for (const op of ops) {
    if (op === 0) { flush(); ai++; bj++; hb = bj; }
    else { if (!hd && !ha) hb = bj; if (op < 0) { hd++; ai++; } else { ha++; bj++; } }
  }
  flush();
  return res;
}

/** Myers O(ND): dãy thao tác 0 = giữ, -1 = xoá dòng của A, 1 = thêm dòng của B. Null nếu quá nhiều khác biệt (> 1500) thì thôi không so chi tiết. */
export function myers(a: string[], b: string[]): number[] | null {
  const n = a.length, m = b.length, max = Math.min(n + m, 1500);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[off + k - 1] ?? 0) < (v[off + k + 1] ?? 0)) ? (v[off + k + 1] ?? 0) : (v[off + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    trace.push(v.slice(off - d, off + d + 1));
  }
  if (found < 0) return null;
  const ops: number[] = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d - 1]!;
    const get = (k: number) => prev[k + (d - 1)] ?? 0;
    const k = x - y;
    const down = k === -d || (k !== d && get(k - 1) < get(k + 1));
    const pk = down ? k + 1 : k - 1;
    const px = get(pk), py = px - pk;
    // đoạn khớp (đường chéo) sau bước chính
    const sx = down ? px : px + 1, sy = down ? py + 1 : py;
    while (x > sx && y > sy) { ops.push(0); x--; y--; }
    ops.push(down ? 1 : -1);
    x = px; y = py;
  }
  while (x > 0 && y > 0) { ops.push(0); x--; y--; }
  return ops.reverse();
}
