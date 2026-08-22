const fs = require('node:fs/promises');
const path = require('node:path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const LOCAL_VERSIONS = path.join(__dirname, '..', '.local-versions.json');
const VERSION_SORT_PREFIX = 'v#';

function versionSortKey(version) {
  return `${VERSION_SORT_PREFIX}${String(version).padStart(8, '0')}`;
}

function publicVersion(item, latestVersion) {
  return {
    version: item.version,
    isLatest: item.version === latestVersion,
    originalFileName: item.originalFileName ?? null,
    sizeBytes: item.sizeBytes ?? null,
    uploadedAt: item.uploadedAt ?? null,
  };
}

function adminVersion(item, latestVersion) {
  return {
    ...publicVersion(item, latestVersion),
    objectKey: item.objectKey,
    sha256: item.sha256 ?? null,
  };
}

async function readLocal(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeLocal(file, records) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, file);
}

function createVersionRepository({
  tableName = process.env.FEEDBACK_TABLE,
  region = process.env.S3_REGION || 'ap-northeast-2',
  localFile = LOCAL_VERSIONS,
  client,
} = {}) {
  const dynamo = client || (tableName ? DynamoDBDocumentClient.from(new DynamoDBClient({ region })) : null);

  async function save(record) {
    const item = {
      contentKey: `version#${record.contentId}`,
      createdAt: versionSortKey(record.version),
      ...record,
    };
    if (!tableName) {
      const records = await readLocal(localFile);
      if (records.some((entry) => entry.contentId === item.contentId && entry.version === item.version)) return false;
      await writeLocal(localFile, [...records, item]);
      return true;
    }
    try {
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(contentKey) AND attribute_not_exists(createdAt)',
      }));
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async function list(contentId) {
    if (!tableName) return (await readLocal(localFile))
      .filter((item) => item.contentId === contentId)
      .sort((a, b) => a.version - b.version);
    const response = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'contentKey = :contentKey AND begins_with(createdAt, :prefix)',
      ExpressionAttributeValues: { ':contentKey': `version#${contentId}`, ':prefix': VERSION_SORT_PREFIX },
      ScanIndexForward: true,
    }));
    return (response.Items || []).sort((a, b) => a.version - b.version);
  }

  async function deleteForContent(contentId) {
    const records = await list(contentId);
    if (!tableName) {
      const all = await readLocal(localFile);
      await writeLocal(localFile, all.filter((item) => item.contentId !== contentId));
      return records.length;
    }
    await Promise.all(records.map((item) => dynamo.send(new DeleteCommand({
      TableName: tableName,
      Key: { contentKey: `version#${contentId}`, createdAt: item.createdAt },
    }))));
    return records.length;
  }

  return Object.freeze({ adminVersion, deleteForContent, list, publicVersion, save });
}

module.exports = { LOCAL_VERSIONS, VERSION_SORT_PREFIX, adminVersion, createVersionRepository, publicVersion, versionSortKey };
