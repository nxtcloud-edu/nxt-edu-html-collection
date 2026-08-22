const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checkWebBudget, currentAssets } = require('../scripts/check-web-budget');

test('웹 예산 검사는 index가 참조하는 현재 해시 자산만 측정한다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nxt-web-budget-'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'index.html'), '<script src="/app/assets/index-test.js"></script><link href="/app/assets/index-test.css">');
  await writeFile(path.join(root, 'assets/index-test.js'), 'const ok = true;');
  await writeFile(path.join(root, 'assets/index-test.css'), 'body{color:black}');
  const report = checkWebBudget({ publicDir: root });
  assert.deepEqual(report.results.map((item) => item.type), ['html', 'js', 'css']);
  assert.deepEqual(report.failures, []);
});

test('웹 예산 검사는 자산 누락과 초과를 실패로 보고한다', () => {
  assert.throws(() => currentAssets('<script src="/app/assets/index-only.js"></script>'), /각각 하나씩/);
  const report = checkWebBudget({ publicDir: path.join(__dirname, '../public/app'), budgets: { html: { raw: 1, gzip: 1 }, js: { raw: 1, gzip: 1 }, css: { raw: 1, gzip: 1 } } });
  assert.equal(report.failures.length, 6);
});
