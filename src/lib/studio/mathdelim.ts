/**
 * Dấu phân cách công thức kiểu LaTeX: `\(…\)` (dòng) và `\[…\]` (khối) -> `$…$` và `$$…$$` để remark-math nhận ra.
 * ChatGPT/Claude và nhiều tài liệu khoa học xuất đúng kiểu này; CommonMark thì coi `\(` là dấu ngoặc đã thoát nên công thức hiện nguyên mã.
 *
 * An toàn:
 * - không đụng vào khối code (hàng rào ``` / ~~~, khối thụt 4 dấu cách) và code dòng (`...`);
 * - `\\(` (gạch chéo ngược thật rồi tới ngoặc) giữ nguyên;
 * - `\(…\)` phải đóng trên cùng dòng; `\[…\]` chỉ nhận khi `\[` mở đầu dòng và `\]` kết thúc dòng (`\[TODO\]` giữa câu vẫn là chữ);
 * - tiền tệ `$5 và $10` không bị ghép thành công thức (xem nhánh `$` trong `inline`);
 * - số dòng giữ nguyên (data-line của bản xem khớp ô soạn); khoảng trắng sát dấu phân cách được cắt (`$ x $` thì pipeline không nhận ra công thức).
 */
export function normalizeMathDelims(src: string): string {
  if (!src.includes('\\(') && !src.includes('\\[') && !/\$\d/.test(src)) return src;
  const lines = src.split('\n');
  let fence: { ch: string; n: number } | null = null;
  let prevBlank = true, inList = false;

  /** `\(…\)` trong một dòng, bỏ qua code dòng và gạch chéo ngược đã thoát. */
  const inline = (s: string): string => {
    let out = '';
    for (let i = 0; i < s.length;) {
      const c = s[i]!;
      if (c === '`') { // code dòng: chạy ngược tới dấu ` cùng độ dài
        let n = 0; while (s[i + n] === '`') n++;
        const close = s.indexOf('`'.repeat(n), i + n);
        if (close === -1) { out += s.slice(i, i + n); i += n; } else { out += s.slice(i, close + n); i = close + n; }
      } else if (c === '\\') {
        if (s[i + 1] === '\\') { out += '\\\\'; i += 2; }
        else if (s[i + 1] === '(') {
          const end = findClose(s, i + 2);
          const body = end === -1 ? '' : s.slice(i + 2, end).trim();
          if (end !== -1 && body) { out += '$' + body + '$'; i = end + 2; } else { out += '\\('; i += 2; }
        } else if (s[i + 1] === '$') { out += '\\$'; i += 2; } // `\$` đã thoát: giữ, không coi là mở công thức
        else { out += c; i++; }
      } else if (c === '$' && s[i + 1] !== '$' && /\d/.test(s[i + 1] ?? '')) {
        // tiền tệ `$5 và $10`: remark-math sẽ ghép hai dấu $ thành một công thức. Cặp mở bằng chữ số mà thân kết thúc bằng khoảng trắng, hoặc
        // dấu đóng đứng trước một chữ số (`$5-$10`), là giá tiền: thoát cả hai. `$5$`, `$2x+1$` vẫn là công thức.
        let j = i + 1;
        while (j < s.length && !(s[j] === '$' && s[j - 1] !== '\\')) j++;
        const body = s.slice(i + 1, j);
        if (j < s.length && s[j + 1] !== '$' && (/\s$/.test(body) || /\d/.test(s[j + 1] ?? ''))) { out += '\\$' + body + '\\$'; i = j + 1; } else { out += c; i++; }
      } else { out += c; i++; }
    }
    return out;
  };
  /** Vị trí của `\)` đầu tiên không bị thoát, hoặc -1. */
  const findClose = (s: string, from: number): number => {
    for (let j = from; j < s.length; j++) {
      if (s[j] === '\\') { if (s[j + 1] === ')') return j; j++; }
    }
    return -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fm = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (fm && fm[1]![0] === fence.ch && fm[1]!.length >= fence.n && /^[ \t]*$/.test(line.slice(fm[0].length))) fence = null; prevBlank = false; continue; }
    if (fm) { fence = { ch: fm[1]![0]!, n: fm[1]!.length }; prevBlank = false; continue; }
    const blank = /^\s*$/.test(line);
    if (blank) { prevBlank = true; continue; }
    const isList = /^\s*(?:[-*+]|\d{1,9}[.)])\s/.test(line);
    if (isList) inList = true; else if (!/^\s/.test(line)) inList = false;
    if (/^( {4,}|\t)/.test(line) && prevBlank && !inList) { prevBlank = false; continue; } // khối code thụt lề
    prevBlank = false;

    // khối `\[ … \]`: `\[` mở đầu dòng
    const open = /^(\s*(?:>\s*)*)\\\[(.*)$/.exec(line);
    if (open) {
      const lead = open[1]!, rest = open[2]!;
      const one = /^(.*?)\\\]\s*$/.exec(rest); // mở và đóng trên cùng dòng
      if (one) { const body = one[1]!.trim(); if (body) { lines[i] = lead + '$$' + body + '$$'; continue; } }
      else if (rest.trim() === '') {
        // `\[` một mình: tìm dòng đóng chỉ gồm `\]`, không vượt qua dòng trống. Dòng đóng có nội dung kèm `\]` thì bỏ qua cả khối: khối toán
        // của remark-math chỉ đóng bằng dòng `$$` riêng, thiếu nó thì khối nuốt hết phần còn lại của tài liệu.
        let found = -1;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j]!;
          if (/^\s*$/.test(l)) break;
          if (/\\\]\s*$/.test(l)) { if (/^\s*(?:>\s*)*\\\]\s*$/.test(l)) found = j; break; }
        }
        if (found !== -1) { lines[i] = lead + '$$'; lines[found] = lines[found]!.replace(/\\\]\s*$/, '$$$$'); i = found; continue; }
      }
    }
    lines[i] = inline(line);
  }
  return lines.join('\n');
}
