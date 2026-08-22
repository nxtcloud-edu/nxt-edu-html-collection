#!/usr/bin/env node
const fs = require('node:fs/promises');
const { listContents } = require('../registry');
const { buildLegacyCleanupPlan } = require('../migrations/legacy-cleanup');
const { s3Store } = require('./copy-legacy-content-objects');

function parseArgs(argv) {
  const options = { report: '', summaryOnly: false, usageReport: '', concurrency: 6 };
  for (const arg of argv) {
    if (arg === '--summary-only') options.summaryOnly = true;
    else if (arg === '--apply' || arg.startsWith('--confirm=')) throw new Error('이 도구는 읽기 전용입니다. 삭제는 별도 승인 작업으로 수행해야 합니다.');
    else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length);
    else if (arg.startsWith('--usage-report=')) options.usageReport = arg.slice('--usage-report='.length);
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.slice('--concurrency='.length));
    else throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16) throw new Error('concurrency는 1~16 정수여야 합니다.');
  return options;
}

function outputFor(plan, options) {
  if (options.summaryOnly) return { summary: plan.summary, usageEvidence: plan.usageEvidence };
  return {
    summary: plan.summary,
    usageEvidence: plan.usageEvidence,
    issues: {
      activeReferences: plan.objects.filter((object) => object.state === 'active-reference'),
      awaitingUsageEvidence: plan.objects.filter((object) => object.state === 'awaiting-usage-evidence'),
      observedUsage: plan.objects.filter((object) => object.state === 'observed-usage'),
      orphanObjects: plan.objects.filter((object) => object.state === 'orphan-unmapped'),
      mirrorBlocked: plan.objects.filter((object) => object.state === 'mirror-blocked'),
    },
    deletionCandidates: plan.objects.filter((object) => object.state === 'eligible'),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'ap-northeast-2';
  if (!bucket) throw new Error('S3_BUCKET이 필요합니다.');
  if (!process.env.FEEDBACK_TABLE) throw new Error('FEEDBACK_TABLE이 필요합니다.');
  const usageEvidence = options.usageReport ? JSON.parse(await fs.readFile(options.usageReport, 'utf8')) : null;
  const store = s3Store({ bucket, region });
  const [contents, legacyObjects, v2Objects] = await Promise.all([
    listContents(),
    store.list('games/'),
    store.list('contents/'),
  ]);
  const plan = await buildLegacyCleanupPlan({ contents, legacyObjects, v2Objects, fingerprint: store.fingerprint, usageEvidence, concurrency: options.concurrency });
  const output = outputFor(plan, options);
  if (options.report) await fs.writeFile(options.report, `${JSON.stringify(output, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { outputFor, parseArgs };
