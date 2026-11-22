/**
 * Tên miền trần (`example.com`, `docs.example.net/path`) trong văn bản thường tự thành liên kết `https://…` ở bản xem.
 * Chỉ tên miền có đuôi trong danh sách đã biết, để `notes.md`, `v1.2`, `e.g.` không bị link nhầm. Không đụng vào
 * nguồn, code, link sẵn có, HTML. Địa chỉ có scheme, `www.` và email đã do GFM lo.
 */
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Text, PhrasingContent } from 'mdast';

const TLD = 'com|net|org|io|dev|app|co|uk|vn|edu|gov|info|me|ai|xyz|space|site|tech|cloud|online|store|blog|page|biz|us|de|fr|jp|kr|cn|au|ca|nl|ru|eu|tv|fm|to|ws|top|club|live';
const RE = new RegExp(String.raw`(?<![\w@./:%+-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:${TLD}))(?![\w@-])(?::\d{1,5})?(?:[/?#][^\s<>]*)?`, 'gi');
const TRAIL = /[.,;:!?'")\]}]+$/;
const HOST = new RegExp(String.raw`^(?:[a-z0-9-]+\.)+(?:${TLD})(?![\w-])`, 'i');
const SKIP_TYPES = new Set(['link', 'linkReference', 'definition', 'code', 'inlineCode', 'html', 'image', 'imageReference']);

/** Tách các tên miền trong một đoạn chữ thành nút text và link; `null` nếu không có gì để đổi. */
export function linkifyText(value: string): PhrasingContent[] | null {
  const out: PhrasingContent[] = [];
  let last = 0;
  RE.lastIndex = 0;
  for (let m = RE.exec(value); m; m = RE.exec(value)) {
    let hit = m[0];
    const trail = TRAIL.exec(hit);
    // dấu câu cuối câu không thuộc về địa chỉ; dấu ")" chỉ bỏ khi không có "(" đi cùng
    if (trail) {
      let cut = trail[0];
      if (cut.includes(')') && hit.includes('(')) cut = cut.replace(/\)/g, '');
      hit = hit.slice(0, hit.length - cut.length);
    }
    if (!HOST.test(hit)) continue; // sau khi cắt dấu câu vẫn phải còn tên miền hợp lệ
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({ type: 'link', url: `https://${hit}`, children: [{ type: 'text', value: hit }] });
    last = m.index + hit.length;
    RE.lastIndex = last;
  }
  if (!out.length) return null;
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

export function remarkBareDomain() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (SKIP_TYPES.has(node.type)) return SKIP;
      if (node.type !== 'text' || !parent || index === undefined) return;
      const parts = linkifyText((node as Text).value);
      if (!parts) return;
      (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}
