/** id heading kiểu GitHub: một nguồn cho bản dựng (pipeline) và cho lint liên kết `#anchor`, nên hai bên luôn khớp và khớp cả mục lục viết cho GitHub. */
export const slugify = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-'); // như github-slugger: giữ chữ có dấu, bỏ dấu câu, mỗi khoảng trắng thành một dấu gạch

/** Trả về bộ cấp id: cùng tên thì đánh số `-1`, `-2`… theo thứ tự xuất hiện. */
export function idMaker(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = slugify(text) || 'section';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

/** Chữ hiển thị của một dòng heading Markdown thô: bỏ code, link, ảnh, nhấn mạnh, thẻ HTML, dấu escape. */
export function plainHeading(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/(\*\*|__|~~)/g, '')
    .replace(/(^|[^\w\\])[*_]([^*_\n]+)[*_]/g, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')
    .trim();
}
