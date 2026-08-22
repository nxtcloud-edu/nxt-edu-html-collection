const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const LOCAL_AUDIT_LOG = path.join(__dirname, '..', '.local-audit.jsonl');
const AUDIT_PARTITION = 'audit';

function encodeCursor(key) {
  return key ? Buffer.from(JSON.stringify(key)).toString('base64url') : null;
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return value?.contentKey === AUDIT_PARTITION && typeof value?.createdAt === 'string' ? value : null;
  } catch { return null; }
}

function publicAudit(item) {
  return {
    auditId: item.auditId,
    occurredAt: item.occurredAt,
    actorId: item.actorId,
    action: item.action,
    targetType: item.targetType,
    targetId: item.targetId ?? null,
    details: item.details || {},
  };
}

function createAuditRepository({
  tableName = process.env.FEEDBACK_TABLE,
  region = process.env.S3_REGION || 'ap-northeast-2',
  localFile = LOCAL_AUDIT_LOG,
  client,
  createId = () => crypto.randomBytes(8).toString('hex'),
} = {}) {
  const dynamo = client || (tableName ? DynamoDBDocumentClient.from(new DynamoDBClient({ region })) : null);

  async function record({ actorId, action, targetType, targetId = null, details = {}, occurredAt = new Date().toISOString() }) {
    const auditId = createId();
    const item = {
      contentKey: AUDIT_PARTITION,
      createdAt: `${occurredAt}#${auditId}`,
      auditId,
      occurredAt,
      actorId: actorId || 'system',
      action,
      targetType,
      targetId,
      details,
    };
    if (!tableName) {
      await fs.appendFile(localFile, `${JSON.stringify(item)}\n`, { encoding: 'utf8', mode: 0o600 });
      return publicAudit(item);
    }
    await dynamo.send(new PutCommand({ TableName: tableName, Item: item }));
    return publicAudit(item);
  }

  async function list({ limit = 50, cursor = null, action = '', actorId = '', targetType = '', targetId = '' } = {}) {
    if (!tableName) {
      let text = '';
      try { text = await fs.readFile(localFile, 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const all = text.split('\n').filter(Boolean).map((line) => JSON.parse(line)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const offset = cursor ? Number.parseInt(Buffer.from(cursor, 'base64url').toString('utf8'), 10) : 0;
      if (!Number.isInteger(offset) || offset < 0) return { status: 'invalid-cursor' };
      const filtered = all.filter((item) => (!action || item.action === action)
        && (!actorId || item.actorId === actorId)
        && (!targetType || item.targetType === targetType)
        && (!targetId || item.targetId === targetId));
      const items = filtered.slice(offset, offset + limit).map(publicAudit);
      const nextOffset = offset + items.length;
      return { status: 'ok', items, nextCursor: nextOffset < filtered.length ? Buffer.from(String(nextOffset)).toString('base64url') : null };
    }
    const startKey = decodeCursor(cursor);
    if (cursor && !startKey) return { status: 'invalid-cursor' };
    const filters = [];
    const names = {};
    const values = { ':partition': AUDIT_PARTITION };
    for (const [field, value] of Object.entries({ action, actorId, targetType, targetId })) {
      if (!value) continue;
      names[`#${field}`] = field;
      values[`:${field}`] = value;
      filters.push(`#${field} = :${field}`);
    }
    const response = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'contentKey = :partition',
      ExpressionAttributeValues: values,
      ...(filters.length ? { FilterExpression: filters.join(' AND '), ExpressionAttributeNames: names } : {}),
      ScanIndexForward: false,
      Limit: limit,
      ...(startKey ? { ExclusiveStartKey: startKey } : {}),
    }));
    return {
      status: 'ok',
      items: (response.Items || []).map(publicAudit),
      nextCursor: encodeCursor(response.LastEvaluatedKey),
    };
  }

  return Object.freeze({ list, record });
}

module.exports = { AUDIT_PARTITION, LOCAL_AUDIT_LOG, createAuditRepository, decodeCursor, encodeCursor, publicAudit };
