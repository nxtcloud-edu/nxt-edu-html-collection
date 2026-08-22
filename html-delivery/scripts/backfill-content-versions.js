#!/usr/bin/env node
const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { applyContentVersionBackfill, planContentVersionBackfill } = require('../migrations/content-version-backfill');
const { createVersionRepository } = require('../repositories/version-repository');
const { listRegistryItems } = require('../registry');

const CONFIRM = 'BACKFILL_CONTENT_VERSIONS';

function parseArgs(argv) {
  const args = { apply: false, confirm: '', concurrency: 4, summaryOnly: false };
  argv.forEach((arg) => {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--summary-only') args.summaryOnly = true;
    else if (arg.startsWith('--confirm=')) args.confirm = arg.slice('--confirm='.length);
    else if (arg.startsWith('--concurrency=')) args.concurrency = Number.parseInt(arg.slice('--concurrency='.length), 10);
    else throw new Error(`지원하지 않는 옵션입니다: ${arg}`);
  });
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 8) throw new Error('concurrency는 1~8이어야 합니다.');
  if (args.apply && args.confirm !== CONFIRM) throw new Error(`apply에는 --confirm=${CONFIRM}가 필요합니다.`);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !process.env.FEEDBACK_TABLE) throw new Error('S3_BUCKET과 FEEDBACK_TABLE이 필요합니다.');
  const region = process.env.S3_REGION || 'ap-northeast-2';
  const s3 = new S3Client({ region });
  const repository = createVersionRepository();
  const plan = await planContentVersionBackfill({
    contents: await listRegistryItems(),
    listVersions: repository.list,
    inspectObject: async (objectKey) => {
      const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
      return { body: Buffer.from(await response.Body.transformToByteArray()) };
    },
  });
  const output = { mode: args.apply ? 'apply' : 'dry-run', summary: plan.summary };
  if (args.apply) output.apply = await applyContentVersionBackfill(plan, { saveVersion: repository.save, concurrency: args.concurrency });
  if (!args.summaryOnly) output.plan = plan;
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { CONFIRM, parseArgs };
