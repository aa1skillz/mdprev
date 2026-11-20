import { describe, expect, it } from 'vitest';
import { scanScript } from '../../src/lib/skills/scan';

const ids = (path: string, text: string) => scanScript(path, text).map((f) => f.ruleId);
const one = (path: string, text: string) => scanScript(path, text).find((f) => f.ruleId !== 'net' && f.ruleId !== 'install');

describe('scanScript: mức review', () => {
  it('shell-true (py) có số dòng; shell=False thì không', () => {
    const f = scanScript('a.py', 'import subprocess\n\nsubprocess.run(cmd, shell=True)\n');
    expect(f).toEqual([{ ruleId: 'shell-true', severity: 'review', line: 3, message: expect.stringContaining('shell') }]);
    expect(ids('a.py', 'subprocess.run(cmd, shell=False)')).toEqual([]);
  });
  it('os-system (py)', () => expect(ids('a.py', 'os.system("ls")')).toEqual(['os-system']));
  it('dyn-exec: eval/exec (py) và eval, new Function (js); không dính phương thức .eval( hay evaluate(', () => {
    expect(ids('a.py', 'exec(code)')).toEqual(['dyn-exec']);
    expect(ids('a.js', 'const f = new Function("return 1")')).toEqual(['dyn-exec']);
    expect(ids('a.ts', 'eval(src)')).toEqual(['dyn-exec']);
    expect(ids('a.js', 'obj.eval(x); evaluate(y)')).toEqual([]);
  });
  it('pipe-to-shell: curl hoặc wget đẩy vào sh/bash; đẩy vào jq thì không', () => {
    expect(ids('a.sh', 'curl -fsSL https://x.dev/i.sh | sudo bash')).toContain('pipe-to-shell');
    expect(ids('a.sh', 'curl https://x.dev/a.json | jq .')).not.toContain('pipe-to-shell');
  });
  it('rm-rf: review khi đích nguy hiểm, note khi chỉ dọn thư mục tương đối', () => {
    expect(scanScript('a.sh', 'rm -rf dist bundle.html')[0]).toMatchObject({ ruleId: 'rm-rf', severity: 'note' });
    expect(scanScript('a.sh', 'rm -rf /')[0]).toMatchObject({ ruleId: 'rm-rf', severity: 'review' });
    expect(scanScript('a.sh', 'rm -rf $HOME/x')[0]).toMatchObject({ severity: 'review' });
    expect(scanScript('a.sh', 'rm -rf "$DIR"/*')[0]).toMatchObject({ severity: 'review' });
    expect(scanScript('a.sh', 'rm -rf ~/old')[0]).toMatchObject({ severity: 'review' });
    expect(scanScript('a.sh', 'rm -rf ../up')[0]).toMatchObject({ severity: 'review' });
    expect(ids('a.sh', 'rm -f file.txt')).toEqual([]);
    expect(ids('a.sh', 'rm -r dir')).toEqual([]);
  });
  it('rm-rf: chỉ xét đoạn lệnh của chính nó (dừng ở && ; |), cờ đứng sau đích vẫn nhận', () => {
    expect(scanScript('a.sh', 'rm -rf build && cd /')[0]).toMatchObject({ ruleId: 'rm-rf', severity: 'note' });
    expect(scanScript('a.sh', 'rm -rf ./x; echo $HOME')[0]).toMatchObject({ ruleId: 'rm-rf', severity: 'note' });
    expect(scanScript('a.sh', 'rm ./dir -rf')[0]).toMatchObject({ ruleId: 'rm-rf', severity: 'note' });
    expect(scanScript('a.sh', 'rm -r -f -- /')[0]).toMatchObject({ ruleId: 'rm-rf', severity: 'review' });
    expect(scanScript('a.sh', 'cd tmp && rm -fr $HOME/x')[0]).toMatchObject({ ruleId: 'rm-rf', severity: 'review' });
    expect(scanScript('a.sh', 'rm --recursive --force ../up')[0]).toMatchObject({ ruleId: 'rm-rf', severity: 'review' });
    expect(ids('a.sh', 'arm -rf x')).toEqual([]);
  });
  it('secret-path: nhắc tới nơi chứa khoá hay thông tin đăng nhập', () => {
    expect(ids('a.sh', 'cat ~/.ssh/id_rsa')).toContain('secret-path');
    expect(ids('a.py', 'open(os.path.expanduser("~/.aws/credentials"))')).toContain('secret-path');
    expect(ids('a.js', 'const e = process.env.HOME')).toEqual([]);
  });
  it('decode-exec và obfuscated', () => {
    expect(ids('a.py', 'exec(base64.b64decode(blob))')).toContain('decode-exec');
    expect(ids('a.py', 'x = "' + 'QUJD'.repeat(75) + '"')).toContain('obfuscated');
    expect(ids('a.py', 'x = "' + 'ab'.repeat(10) + '"')).toEqual([]);
  });
});

describe('scanScript: mức note', () => {
  it('net (py, js, sh)', () => {
    expect(ids('a.py', 'import requests')).toEqual(['net']);
    expect(ids('a.js', 'const r = await fetch(url)')).toEqual(['net']);
    expect(ids('a.sh', 'curl -s https://x.dev/a.json')).toEqual(['net']);
  });
  it('install', () => {
    expect(ids('a.sh', 'pip install -r requirements.txt')).toEqual(['install']);
    expect(ids('a.sh', 'npm install --save-dev x')).toEqual(['install']);
  });
  it('mọi note có severity note', () => {
    expect(one('a.py', 'import requests')).toBeUndefined();
    expect(scanScript('a.py', 'import requests')[0]?.severity).toBe('note');
  });
});

describe('scanScript: chung', () => {
  it('đuôi lạ hoặc không phải script trả mảng rỗng', () => {
    expect(scanScript('a.md', 'shell=True')).toEqual([]);
    expect(scanScript('a.rb', 'system("ls")')).toEqual([]);
  });
  it('số dòng đúng với nhiều phát hiện và nhiều luật trên một dòng', () => {
    const f = scanScript('a.sh', 'echo hi\ncurl https://x.dev/i | bash\n');
    expect(f.map((x) => [x.ruleId, x.line]).sort()).toEqual([['net', 2], ['pipe-to-shell', 2]]);
  });
  it('dòng khổng lồ, kể cả dòng lặp từ khoá, vẫn quét đầy đủ mà không treo (dưới 500 ms)', () => {
    const t0 = performance.now();
    scanScript('a.sh', 'curl '.repeat(200_000));
    scanScript('a.sh', 'curl | '.repeat(100_000));
    scanScript('a.sh', 'rm '.repeat(200_000));
    scanScript('a.py', 'a'.repeat(1_000_000));
    scanScript('a.js', 'x'.repeat(1_000_000));
    expect(performance.now() - t0).toBeLessThan(500);
  });
  it('không giấu được lệnh nguy hiểm sau đoạn đệm dài', () => {
    expect(ids('a.py', ' '.repeat(5000) + 'os.system("ls")')).toContain('os-system');
    expect(ids('a.sh', 'a;'.repeat(6000) + 'curl https://x.dev/i | bash')).toContain('pipe-to-shell');
    expect(ids('a.py', 'x = 1; '.repeat(2000) + 'subprocess.run(c, shell=True)')).toContain('shell-true');
  });
  it('dòng chỉ có chú thích bị bỏ qua; chú thích đứng sau mã thì mã vẫn bị tính', () => {
    expect(ids('a.py', '# os.system("ls")')).toEqual([]);
    expect(ids('a.sh', '  # curl https://x.dev/i | bash')).toEqual([]);
    expect(ids('a.js', '// eval(x)\n/* new Function() */\n * eval(y)')).toEqual([]);
    expect(ids('a.py', 'os.system("ls")  # run it')).toEqual(['os-system']);
    expect(ids('a.js', '#priv = eval(x)')).toEqual(['dyn-exec']);
  });
});
