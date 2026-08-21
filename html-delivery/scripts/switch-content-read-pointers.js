#!/usr/bin/env node
const fs = require('node:fs/promises');
const { listContents, setContentLatestObjectKey } = require('../registry');
const { buildObjectCopyPlan } = require('../migrations/content-object-copy');
const { applyContentReadSwitchPlan, buildContentReadSwitchPlan } = require('../migrations/content-read-switch');
const { s3Store } = require('./copy-legacy-content-objects');

const APPLY_CONFIRMATION = 'SWITCH_CONTENT_READ_POINTERS';

function parseArgs(argv) {
  const options = { apply: false, confirm: '', report: '', summaryOnly: false, concurrency: 6 };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--summary-only') options.summaryOnly = true;
    else if (arg.startsWith('--confirm=')) options.confirm = arg.slice('--confirm='.length);
    else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length);
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.slice('--concurrency='.length));
    else throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16) throw new Error('concurrency는 1~16 정수여야 합니다.');
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) throw new Error(`apply에는 --confirm=${APPLY_CONFIRMATION}가 필요합니다.`);
  return options;
}

function outputFor(plan, options, applyResult) {
  const blocked = plan.contents.filter((content) => ['blocked', 'conflict'].includes(content.status));
  if (!applyResult) return options.summaryOnly ? { summary: plan.summary } : { summary: plan.summary, issues: blocked };
  const apply = options.summaryOnly ? { attemptedContents: applyResult.attemptedContents, succeededContents: applyResult.succeededContents, failedContents: applyResult.failedContents } : applyResult;
  return options.summaryOnly ? { summary: plan.summary, apply } : { summary: plan.summary, issues: blocked, apply };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'ap-northeast-2';
  if (!bucket) throw new Error('S3_BUCKET이 필요합니다.');
  if (!process.env.FEEDBACK_TABLE) throw new Error('FEEDBACK_TABLE이 필요합니다.');
  const store = s3Store({ bucket, region });
  const [contents, sourceObjects, destinationObjects] = await Promise.all([listContents(), store.list('games/'), store.list('contents/')]);
  const copyPlan = await buildObjectCopyPlan({ contents, sourceObjects, destinationObjects, fingerprint: store.fingerprint, concurrency: options.concurrency });
  let plan = buildContentReadSwitchPlan({ contents, copyPlan });
  let applyResult;
  if (options.apply) {
    applyResult = await applyContentReadSwitchPlan({
      plan,
      concurrency: options.concurrency,
      updatePointer: ({ contentId, expectedLatestKey, latestObjectKey }) => setContentLatestObjectKey({ contentId, expectedLatestKey, latestObjectKey }),
    });
    plan = buildContentReadSwitchPlan({ contents: await listContents(), copyPlan });
  }
  const output = outputFor(plan, options, applyResult);
  if (options.report) await fs.writeFile(options.report, `${JSON.stringify(output, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (applyResult?.failedContents) process.exitCode = 2;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { APPLY_CONFIRMATION, outputFor, parseArgs };
