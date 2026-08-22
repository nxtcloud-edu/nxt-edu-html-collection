#!/usr/bin/env node
const fs = require('node:fs/promises');
const { listContents, retireContentLegacyFallback } = require('../registry');
const { buildObjectCopyPlan } = require('../migrations/content-object-copy');
const { applyFallbackRetirementPlan, buildFallbackRetirementPlan } = require('../migrations/fallback-retirement');
const { s3Store } = require('./copy-legacy-content-objects');

const APPLY_CONFIRMATION = 'RETIRE_LEGACY_FALLBACKS';

function parseArgs(argv) {
  const options = { apply: false, confirm: '', report: '', summaryOnly: false, usageReport: '', concurrency: 6 };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--summary-only') options.summaryOnly = true;
    else if (arg.startsWith('--confirm=')) options.confirm = arg.slice('--confirm='.length);
    else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length);
    else if (arg.startsWith('--usage-report=')) options.usageReport = arg.slice('--usage-report='.length);
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.slice('--concurrency='.length));
    else throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16) throw new Error('concurrency는 1~16 정수여야 합니다.');
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) throw new Error(`apply에는 --confirm=${APPLY_CONFIRMATION}가 필요합니다.`);
  if (options.apply && !options.usageReport) throw new Error('apply에는 --usage-report가 필요합니다.');
  return options;
}

function outputFor(plan, options, applyResult) {
  const issues = plan.contents.filter((content) => !['ready', 'retired'].includes(content.status));
  const apply = applyResult && (options.summaryOnly
    ? { attemptedContents: applyResult.attemptedContents, succeededContents: applyResult.succeededContents, failedContents: applyResult.failedContents }
    : applyResult);
  return options.summaryOnly
    ? { summary: plan.summary, usageEvidence: plan.usageEvidence, ...(apply ? { apply } : {}) }
    : { summary: plan.summary, usageEvidence: plan.usageEvidence, issues, ...(apply ? { apply } : {}) };
}

async function buildPlan({ contents, store, usageEvidence, concurrency }) {
  const [legacyObjects, v2Objects] = await Promise.all([store.list('games/'), store.list('contents/')]);
  const copyPlan = await buildObjectCopyPlan({ contents, sourceObjects: legacyObjects, destinationObjects: v2Objects, fingerprint: store.fingerprint, concurrency });
  return buildFallbackRetirementPlan({ contents, copyPlan, usageEvidence });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'ap-northeast-2';
  if (!bucket) throw new Error('S3_BUCKET이 필요합니다.');
  if (!process.env.FEEDBACK_TABLE) throw new Error('FEEDBACK_TABLE이 필요합니다.');
  const usageEvidence = options.usageReport ? JSON.parse(await fs.readFile(options.usageReport, 'utf8')) : null;
  const store = s3Store({ bucket, region });
  let plan = await buildPlan({ contents: await listContents(), store, usageEvidence, concurrency: options.concurrency });
  let applyResult;
  if (options.apply) {
    applyResult = await applyFallbackRetirementPlan({
      plan,
      concurrency: options.concurrency,
      retireFallback: ({ contentId, expectedLegacyKey, expectedV2Key }) => retireContentLegacyFallback({ contentId, expectedLegacyKey, expectedV2Key }),
    });
    plan = await buildPlan({ contents: await listContents(), store, usageEvidence, concurrency: options.concurrency });
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

module.exports = { APPLY_CONFIRMATION, buildPlan, outputFor, parseArgs };
