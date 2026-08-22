const fs = require('node:fs/promises');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

function parseFeedbackLog(contents, contentId) {
  return contents.split('\n').filter(Boolean).flatMap((line) => {
    try {
      const item = JSON.parse(line);
      return item.contentKey === contentId ? [item] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function createFeedbackRepository({
  tableName = process.env.FEEDBACK_TABLE,
  region = process.env.S3_REGION || 'ap-northeast-2',
  localFile,
  createClient = () => DynamoDBDocumentClient.from(new DynamoDBClient({ region })),
} = {}) {
  if (!localFile) throw new TypeError('feedback repository localFile is required');
  let client;
  const database = () => {
    if (!client) client = createClient();
    return client;
  };

  async function readLocalEntries() {
    try {
      return (await fs.readFile(localFile, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function writeLocalEntries(entries) {
    if (!entries.length) {
      await fs.rm(localFile, { force: true });
      return;
    }
    await fs.writeFile(localFile, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
  }

  async function save(entry) {
    if (!tableName) return fs.appendFile(localFile, `${JSON.stringify(entry)}\n`, 'utf8');
    await database().send(new PutCommand({ TableName: tableName, Item: entry }));
  }

  async function list(contentId) {
    if (!tableName) {
      try {
        return parseFeedbackLog(await fs.readFile(localFile, 'utf8'), contentId);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    }
    const response = await database().send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'contentKey = :id',
      ExpressionAttributeValues: { ':id': contentId },
      ScanIndexForward: true,
    }));
    return response.Items || [];
  }

  async function deleteEntry(contentId, createdAt) {
    if (!tableName) {
      const entries = await readLocalEntries();
      const nextEntries = entries.filter((entry) => !(entry.contentKey === contentId && entry.createdAt === createdAt));
      if (nextEntries.length === entries.length) return false;
      await writeLocalEntries(nextEntries);
      return true;
    }
    await database().send(new DeleteCommand({ TableName: tableName, Key: { contentKey: contentId, createdAt } }));
    return true;
  }

  async function deleteForContent(contentId) {
    if (!tableName) {
      const entries = await readLocalEntries();
      const nextEntries = entries.filter((entry) => entry.contentKey !== contentId);
      await writeLocalEntries(nextEntries);
      return entries.length - nextEntries.length;
    }
    const entries = await list(contentId);
    await Promise.all(entries.map((entry) => database().send(new DeleteCommand({
      TableName: tableName,
      Key: { contentKey: contentId, createdAt: entry.createdAt },
    }))));
    return entries.length;
  }

  return Object.freeze({ deleteEntry, deleteForContent, list, save });
}

module.exports = { createFeedbackRepository, parseFeedbackLog };
