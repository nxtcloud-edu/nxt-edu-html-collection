const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

const DEFAULT_BUDGETS = {
  html: { raw: 2_048, gzip: 1_024 },
  css: { raw: 40_000, gzip: 8_000 },
  js: { raw: 260_000, gzip: 80_000 },
};

function currentAssets(indexHtml) {
  const references = [...indexHtml.matchAll(/(?:src|href)="(\/app\/assets\/index-[^"]+\.(?:js|css))"/g)].map((match) => match[1]);
  if (references.length !== 2 || !references.some((item) => item.endsWith('.js')) || !references.some((item) => item.endsWith('.css'))) throw new Error('현재 JS/CSS 해시 자산을 index.html에서 각각 하나씩 찾을 수 없습니다.');
  return references;
}

function measure(filePath) {
  const bytes = fs.readFileSync(filePath);
  return { raw: bytes.length, gzip: gzipSync(bytes).length };
}

function checkWebBudget({ publicDir = path.join(__dirname, '../public/app'), budgets = DEFAULT_BUDGETS } = {}) {
  const indexPath = path.join(publicDir, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const files = [{ type: 'html', path: indexPath }, ...currentAssets(indexHtml).map((reference) => ({ type: path.extname(reference).slice(1), path: path.join(publicDir, reference.replace('/app/', '')) }))];
  const results = files.map((file) => ({ ...file, ...measure(file.path), budget: budgets[file.type] }));
  const failures = results.flatMap((result) => ['raw', 'gzip'].filter((metric) => result[metric] > result.budget[metric]).map((metric) => `${result.type} ${metric} ${result[metric]} > ${result.budget[metric]}`));
  return { results, failures };
}

if (require.main === module) {
  const report = checkWebBudget();
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exitCode = 1;
}

module.exports = { DEFAULT_BUDGETS, checkWebBudget, currentAssets, measure };
