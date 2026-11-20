import { describe, expect, it } from 'vitest';
import { findMissingRefs } from '../../src/lib/skills/refs';
import { vfsOf } from './helpers';

const V = vfsOf({
  's/SKILL.md': 'x',
  's/scripts/thumbnail.py': 'x',
  's/reference/a.md': 'x',
});
const run = (body: string, start = 1, v = V) => findMissingRefs(v, 's', body, start);
const paths = (body: string, start = 1, v = V) => run(body, start, v).map((f) => f.title.replace('Mentioned but not found: ', ''));

describe('findMissingRefs: đường dẫn có thư mục', () => {
  it('file có thật thì không báo, kể cả có ./ ở đầu', () => {
    expect(run('See reference/a.md and ./reference/a.md and `scripts/thumbnail.py`.')).toEqual([]);
  });
  it('file thiếu được báo kèm đúng số dòng trong file gốc', () => {
    const f = run('intro\nsee reference/missing.md here', 5);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: 'ref.missing', severity: 'note', file: 'SKILL.md', line: 6 });
    expect(f[0]?.title).toContain('reference/missing.md');
  });
  it('nhắc nhiều lần chỉ một phát hiện, lấy dòng đầu', () => {
    const f = run('reference/no.md\nlater reference/no.md again');
    expect(f).toHaveLength(1);
    expect(f[0]?.line).toBe(1);
  });
  it('bỏ URL, đường dẫn cha (../), placeholder', () => {
    expect(paths('https://example.com/docs/guide.md and ../shared/x.md and scripts/<name>.py and reference/*.md')).toEqual([]);
  });
  it('chấp nhận khớp theo hậu tố đường dẫn', () => {
    const v = vfsOf({ 's/SKILL.md': 'x', 's/docs/reference/b.md': 'x' });
    expect(paths('reference/b.md', 1, v)).toEqual([]);
  });
});

describe('findMissingRefs: tên trần và liên kết', () => {
  it('tên trần sau lệnh chạy được tìm theo tên file ở bất kỳ đâu', () => {
    expect(paths('Run `python thumbnail.py` first.')).toEqual([]);
  });
  it('tên trần sau lệnh chạy mà không có file thì báo', () => {
    expect(paths('Run `python3 make_deck.py --fast` first.')).toEqual(['make_deck.py']);
  });
  it('tên trần ngoài lệnh chạy bị bỏ (p5.js, your_server.py)', () => {
    expect(paths('Uses p5.js; copy it to your_server.py and edit.')).toEqual([]);
  });
  it('tên minh hoạ sau lệnh chạy bị bỏ', () => {
    expect(paths('python your_script.py\npython server.py\nnode example-app.js')).toEqual([]);
  });
  it('đích liên kết tương đối bị thiếu thì báo; có thật, neo và URL thì không', () => {
    expect(paths('[forms](FORMS.md) [a](reference/a.md) [top](#top) [w](https://x.dev/a.md)')).toEqual(['FORMS.md']);
  });
});
