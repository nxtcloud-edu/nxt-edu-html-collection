#!/usr/bin/env node
const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const { GetObjectCommand, ListObjectsV2Command, S3Client } = require('@aws-sdk/client-s3');
const { mergeUsage, parseCloudFrontLog, usageEvidence, validateObservationWindow } = require('../migrations/cloudfront-usage');

function parseArgs(argv) {
  const options = { from: '', to: '', loggingStart: '', report: '' };
  for (const arg of argv) {
    if (arg.startsWith('--from=')) options.from = arg.slice('--from='.length);
    else if (arg.startsWith('--to=')) options.to = arg.slice('--to='.length);
    else if (arg.startsWith('--logging-start=')) options.loggingStart = arg.slice('--logging-start='.length);
    else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length);
    else throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  }
  if (!options.from || !options.to || !options.loggingStart) throw new Error('--from, --to, --logging-start가 필요합니다.');
  return options;
}

async function listLogKeys(client, bucket, prefix) {
  const keys = [];
  let ContinuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    keys.push(...(response.Contents || []).map((object) => object.Key));
    ContinuationToken = response.NextContinuationToken;
  } while (ContinuationToken);
  return keys;
}

async function readLog(client, bucket, key) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = Buffer.from(await response.Body.transformToByteArray());
  return key.endsWith('.gz') ? zlib.gunzipSync(body).toString('utf8') : body.toString('utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bucket = process.env.CONTENT_LOG_BUCKET;
  const prefix = process.env.CONTENT_LOG_PREFIX || 'cloudfront/content/';
  const region = process.env.S3_REGION || 'ap-northeast-2';
  if (!bucket) throw new Error('CONTENT_LOG_BUCKET이 필요합니다.');
  const window = validateObservationWindow({ from: options.from, to: options.to, loggingStart: options.loggingStart });
  const client = new S3Client({ region });
  const keys = await listLogKeys(client, bucket, prefix);
  const parsed = [];
  for (const key of keys) parsed.push(parseCloudFrontLog(await readLog(client, bucket, key), window));
  const output = usageEvidence({ from: window.fromMs, to: window.toMs, filesScanned: keys.length, usage: mergeUsage(parsed) });
  if (options.report) await fs.writeFile(options.report, `${JSON.stringify(output, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { listLogKeys, parseArgs, readLog };
