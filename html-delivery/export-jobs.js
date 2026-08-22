const fs = require('node:fs/promises');
const path = require('node:path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const LOCAL_EXPORT_JOBS = path.join(__dirname, '.local-export-jobs.json');
const EXPORT_JOB_TTL_SECONDS = 30 * 24 * 60 * 60;

function keyFor(exportId) {
  return { contentKey: `export#${exportId}`, createdAt: 'meta' };
}

function client() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.S3_REGION || 'ap-northeast-2' }));
}

async function readLocal() {
  try { return JSON.parse(await fs.readFile(LOCAL_EXPORT_JOBS, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

async function writeLocal(jobs) {
  await fs.writeFile(LOCAL_EXPORT_JOBS, `${JSON.stringify(jobs, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function publicExportJob(item) {
  if (!item) return null;
  const { contentKey: _contentKey, createdAt: _createdAt, contentIds: _contentIds, appBaseUrl: _appBaseUrl, ...job } = item;
  return job;
}

async function createExportJob(job) {
  const item = {
    ...keyFor(job.exportId),
    ...job,
    status: 'queued',
    attempt: 0,
    expiresAt: Math.floor(Date.now() / 1000) + EXPORT_JOB_TTL_SECONDS,
  };
  if (!process.env.FEEDBACK_TABLE) {
    const jobs = await readLocal();
    if (jobs[job.exportId]) throw new Error('export job already exists');
    jobs[job.exportId] = item;
    await writeLocal(jobs);
    return item;
  }
  await client().send(new PutCommand({
    TableName: process.env.FEEDBACK_TABLE,
    Item: item,
    ConditionExpression: 'attribute_not_exists(contentKey)',
  }));
  return item;
}

async function getExportJob(exportId) {
  if (!process.env.FEEDBACK_TABLE) return (await readLocal())[exportId] || null;
  const response = await client().send(new GetCommand({ TableName: process.env.FEEDBACK_TABLE, Key: keyFor(exportId) }));
  return response.Item || null;
}

async function listExportJobs(limit = 20) {
  let items;
  if (!process.env.FEEDBACK_TABLE) items = Object.values(await readLocal());
  else {
    items = [];
    let ExclusiveStartKey;
    do {
      const response = await client().send(new ScanCommand({
        TableName: process.env.FEEDBACK_TABLE,
        FilterExpression: 'begins_with(contentKey, :prefix) AND createdAt = :meta',
        ExpressionAttributeValues: { ':prefix': 'export#', ':meta': 'meta' },
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }));
      items.push(...(response.Items || []));
      ExclusiveStartKey = response.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }
  return items.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt))).slice(0, limit);
}

async function localTransition(exportId, allowed, update) {
  const jobs = await readLocal();
  const item = jobs[exportId];
  if (!item || !allowed.includes(item.status)) return false;
  jobs[exportId] = update(item);
  await writeLocal(jobs);
  return true;
}

async function claimExportJob(exportId, startedAt) {
  if (!process.env.FEEDBACK_TABLE) return localTransition(exportId, ['queued'], (item) => ({ ...item, status: 'running', startedAt, attempt: (item.attempt || 0) + 1 }));
  try {
    await client().send(new UpdateCommand({
      TableName: process.env.FEEDBACK_TABLE,
      Key: keyFor(exportId),
      UpdateExpression: 'SET #status = :running, startedAt = :startedAt ADD attempt :one',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':queued': 'queued', ':running': 'running', ':startedAt': startedAt, ':one': 1 },
      ConditionExpression: '#status = :queued',
    }));
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

async function completeExportJob(exportId, fields) {
  if (!process.env.FEEDBACK_TABLE) return localTransition(exportId, ['running'], (item) => ({ ...item, ...fields, status: 'completed' }));
  await client().send(new UpdateCommand({
    TableName: process.env.FEEDBACK_TABLE,
    Key: keyFor(exportId),
    UpdateExpression: 'SET #status = :completed, completedAt = :completedAt, archiveExpiresAt = :archiveExpiresAt, fileName = :fileName, #count = :count, storageKey = :storageKey REMOVE errorCode, failedAt',
    ExpressionAttributeNames: { '#status': 'status', '#count': 'count' },
    ExpressionAttributeValues: { ':running': 'running', ':completed': 'completed', ':completedAt': fields.completedAt, ':archiveExpiresAt': fields.archiveExpiresAt, ':fileName': fields.fileName, ':count': fields.count, ':storageKey': fields.storageKey },
    ConditionExpression: '#status = :running',
  }));
  return true;
}

async function failExportJob(exportId, fields) {
  if (!process.env.FEEDBACK_TABLE) return localTransition(exportId, ['queued', 'running'], (item) => ({ ...item, ...fields, status: 'failed' }));
  await client().send(new UpdateCommand({
    TableName: process.env.FEEDBACK_TABLE,
    Key: keyFor(exportId),
    UpdateExpression: 'SET #status = :failed, failedAt = :failedAt, errorCode = :errorCode',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':queued': 'queued', ':running': 'running', ':failed': 'failed', ':failedAt': fields.failedAt, ':errorCode': fields.errorCode },
    ConditionExpression: '#status = :queued OR #status = :running',
  }));
  return true;
}

async function requeueExportJob(exportId, requestedAt) {
  if (!process.env.FEEDBACK_TABLE) return localTransition(exportId, ['failed'], (item) => {
    const { failedAt: _failedAt, errorCode: _errorCode, startedAt: _startedAt, completedAt: _completedAt, archiveExpiresAt: _archiveExpiresAt, fileName: _fileName, count: _count, storageKey: _storageKey, ...rest } = item;
    return { ...rest, status: 'queued', requestedAt };
  });
  try {
    await client().send(new UpdateCommand({
      TableName: process.env.FEEDBACK_TABLE,
      Key: keyFor(exportId),
      UpdateExpression: 'SET #status = :queued, requestedAt = :requestedAt REMOVE failedAt, errorCode, startedAt, completedAt, archiveExpiresAt, fileName, #count, storageKey',
      ExpressionAttributeNames: { '#status': 'status', '#count': 'count' },
      ExpressionAttributeValues: { ':failed': 'failed', ':queued': 'queued', ':requestedAt': requestedAt },
      ConditionExpression: '#status = :failed',
    }));
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

module.exports = {
  EXPORT_JOB_TTL_SECONDS,
  LOCAL_EXPORT_JOBS,
  claimExportJob,
  completeExportJob,
  createExportJob,
  failExportJob,
  getExportJob,
  listExportJobs,
  publicExportJob,
  requeueExportJob,
};
