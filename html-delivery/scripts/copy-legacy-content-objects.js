#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { listContents } = require('../registry');
const { applyObjectCopyPlan, buildObjectCopyPlan, sameFingerprint } = require('../migrations/content-object-copy');

const APPLY_CONFIRMATION = 'COPY_LEGACY_CONTENTS';

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

function s3Store({ bucket, region }) {
  const client = new S3Client({ region });
  async function list(prefix) {
    const objects = [];
    let ContinuationToken;
    do {
      const response = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
      objects.push(...(response.Contents || []).map((item) => ({ key: item.Key, sizeBytes: item.Size })));
      ContinuationToken = response.NextContinuationToken;
    } while (ContinuationToken);
    return objects;
  }
  async function read(key) {
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = Buffer.from(await response.Body.transformToByteArray());
      return {
        body,
        sizeBytes: body.length,
        sha256: crypto.createHash('sha256').update(body).digest('hex'),
        contentType: response.ContentType || 'text/html; charset=utf-8',
        cacheControl: response.CacheControl,
        contentDisposition: response.ContentDisposition,
        contentEncoding: response.ContentEncoding,
        contentLanguage: response.ContentLanguage,
        metadata: response.Metadata || {},
      };
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }
  async function fingerprint(key) {
    const object = await read(key);
    return object ? { sizeBytes: object.sizeBytes, sha256: object.sha256 } : null;
  }
  async function copyVersion(version) {
    const source = await read(version.sourceKey);
    if (!source || !sameFingerprint(source, version.source)) throw new Error(`복사 직전 원본이 변경됐습니다: ${version.sourceKey}`);
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: version.destinationKey,
        Body: source.body,
        IfNoneMatch: '*',
        ContentType: source.contentType,
        ...(source.cacheControl ? { CacheControl: source.cacheControl } : {}),
        ...(source.contentDisposition ? { ContentDisposition: source.contentDisposition } : {}),
        ...(source.contentEncoding ? { ContentEncoding: source.contentEncoding } : {}),
        ...(source.contentLanguage ? { ContentLanguage: source.contentLanguage } : {}),
        Metadata: { ...source.metadata, migratedfrom: version.sourceKey },
      }));
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 412 && error.name !== 'PreconditionFailed') throw error;
    }
    const destination = await fingerprint(version.destinationKey);
    if (!sameFingerprint(version.source, destination)) throw new Error(`복사본 검증에 실패했습니다: ${version.destinationKey}`);
  }
  return { copyVersion, fingerprint, list };
}

function outputFor(plan, options, applyResult) {
  const issues = {
    orphanSourceKeys: plan.orphanSourceKeys,
    blocked: plan.contents.filter((content) => content.status === 'blocked' || content.status === 'conflict').map((content) => ({
      contentId: content.contentId,
      status: content.status,
      reasons: content.reasons,
      missingSourceKeys: content.missingSourceKeys || [],
      extraSourceKeys: content.extraSourceKeys || [],
    })),
  };
  return options.summaryOnly ? { summary: plan.summary, ...(applyResult ? { apply: applyResult } : {}) } : { summary: plan.summary, issues, ...(applyResult ? { apply: applyResult } : {}) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'ap-northeast-2';
  if (!bucket) throw new Error('S3_BUCKET이 필요합니다.');
  if (!process.env.FEEDBACK_TABLE) throw new Error('FEEDBACK_TABLE이 필요합니다.');
  const store = s3Store({ bucket, region });
  const [contents, sourceObjects, destinationObjects] = await Promise.all([listContents(), store.list('games/'), store.list('contents/')]);
  const plan = await buildObjectCopyPlan({ contents, sourceObjects, destinationObjects, fingerprint: store.fingerprint, concurrency: options.concurrency });
  let applyResult;
  let finalPlan = plan;
  if (options.apply) {
    applyResult = await applyObjectCopyPlan({ plan, copyVersion: store.copyVersion, concurrency: Math.min(options.concurrency, 6) });
    const refreshedDestinations = await store.list('contents/');
    finalPlan = await buildObjectCopyPlan({ contents, sourceObjects, destinationObjects: refreshedDestinations, fingerprint: store.fingerprint, concurrency: options.concurrency });
  }
  const output = outputFor(finalPlan, options, applyResult);
  if (options.report) await fs.writeFile(options.report, `${JSON.stringify(output, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (applyResult?.failedContents) process.exitCode = 2;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { APPLY_CONFIRMATION, outputFor, parseArgs, s3Store };
