import { describe, expect, it } from 'vitest';
import { detailsKeys } from '../src/lib/studio/details-key';

/** Mô phỏng vòng đời của MarkdownStudio: nhớ khoá của khối đang mở, dựng lại, rồi áp lại theo khoá. */
const reopen = (before: string[], openIdx: number[], after: string[]): number[] => {
  const keep = new Set(openIdx.map((i) => detailsKeys(before)[i]));
  return detailsKeys(after).flatMap((k, i) => (keep.has(k) ? [i] : []));
};

describe('detailsKeys', () => {
  it('summary khác nhau cho khoá khác nhau', () => {
    const k = detailsKeys(['A', 'B', 'C']);
    expect(new Set(k).size).toBe(3);
  });
  it('summary trùng chữ vẫn phân biệt theo thứ tự', () => {
    const k = detailsKeys(['Chi tiết', 'Chi tiết', 'Chi tiết']);
    expect(new Set(k).size).toBe(3);
  });
  it('summary rỗng vẫn có khoá riêng', () => {
    expect(new Set(detailsKeys(['', ''])).size).toBe(2);
  });
  it('chèn <details> phía trên: khối đang mở vẫn là khối đó', () => {
    // mở "B" (chỉ số 1); chèn "X" lên đầu → B giờ ở chỉ số 2
    expect(reopen(['A', 'B', 'C'], [1], ['X', 'A', 'B', 'C'])).toEqual([2]);
  });
  it('xoá <details> phía trên: khối đang mở vẫn là khối đó', () => {
    expect(reopen(['A', 'B', 'C'], [2], ['B', 'C'])).toEqual([1]);
  });
  it('chèn phía trên một summary trùng: khối mở giữ đúng bản trùng theo thứ tự trong nhóm', () => {
    // mở "D" thứ hai (chỉ số 1); chèn "X" lên đầu → vẫn là "D" thứ hai (chỉ số 2)
    expect(reopen(['D', 'D'], [1], ['X', 'D', 'D'])).toEqual([2]);
  });
  it('xoá khối đang mở: không mở nhầm khối khác', () => {
    expect(reopen(['A', 'B', 'C'], [1], ['A', 'C'])).toEqual([]);
  });
});
