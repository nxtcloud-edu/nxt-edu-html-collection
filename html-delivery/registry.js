const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const LOCAL_REGISTRY = path.join(__dirname, '.local-registry.json');
const TABLE_NAME = process.env.FEEDBACK_TABLE;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, passwordHash: crypto.scryptSync(password, salt, 32).toString('hex') };
}

function verifyPassword(password, passwordHash, salt) {
  const actual = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(passwordHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function newContentId() {
  return crypto.randomBytes(4).toString('hex');
}

function publicContent(item) {
  if (!item) return null;
  const { passwordHash: _passwordHash, salt: _salt, contentKey: _contentKey, createdAt: _createdAt, ...content } = item;
  return content;
}

async function readLocalRegistry() {
  try { return JSON.parse(await fs.readFile(LOCAL_REGISTRY, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

async function writeLocalRegistry(registry) {
  await fs.writeFile(LOCAL_REGISTRY, `${JSON.stringify(registry, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function documentClient() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.S3_REGION || 'ap-northeast-2' }));
}

async function listRegistryItems() {
  if (!TABLE_NAME) return Object.values(await readLocalRegistry());
  const response = await documentClient().send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(contentKey, :prefix) AND createdAt = :meta',
    ExpressionAttributeValues: { ':prefix': 'content#', ':meta': 'meta' },
  }));
  return response.Items || [];
}

async function listContents() {
  return (await listRegistryItems()).map(publicContent);
}

async function findByIdentity({ affiliation, name, category }, normalizeCategory = (value) => value) {
  return (await listRegistryItems()).find((item) => item.affiliation === affiliation
    && item.name === name
    && normalizeCategory(item.category) === normalizeCategory(category)) || null;
}

async function getRegistryItem(contentId) {
  if (!TABLE_NAME) return (await readLocalRegistry())[contentId] || null;
  const response = await documentClient().send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { contentKey: `content#${contentId}`, createdAt: 'meta' },
  }));
  return response.Item || null;
}

async function getContent(contentId) {
  return publicContent(await getRegistryItem(contentId));
}

async function saveRegistryItem(item) {
  if (!TABLE_NAME) {
    const registry = await readLocalRegistry();
    registry[item.contentId] = item;
    await writeLocalRegistry(registry);
    return;
  }
  await documentClient().send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

function mergeVersionFields(item, { latestVersion, latestKey, updatedAt }) {
  return { ...item, latestVersion, latestKey, updatedAt };
}

async function updateRegistryVersion(contentId, fields) {
  if (!TABLE_NAME) {
    const registry = await readLocalRegistry();
    if (!registry[contentId]) return false;
    registry[contentId] = mergeVersionFields(registry[contentId], fields);
    await writeLocalRegistry(registry);
    return true;
  }
  await documentClient().send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { contentKey: `content#${contentId}`, createdAt: 'meta' },
    UpdateExpression: 'SET latestVersion = :version, latestKey = :key, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':version': fields.latestVersion,
      ':key': fields.latestKey,
      ':updatedAt': fields.updatedAt,
    },
    ConditionExpression: 'attribute_exists(contentKey)',
  }));
  return true;
}

async function incrementLike(contentId) {
  if (!TABLE_NAME) {
    const registry = await readLocalRegistry();
    const item = registry[contentId];
    if (!item) return null;
    item.likes += 1;
    await writeLocalRegistry(registry);
    return item.likes;
  }
  try {
    const response = await documentClient().send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { contentKey: `content#${contentId}`, createdAt: 'meta' },
      UpdateExpression: 'ADD likes :one',
      ExpressionAttributeValues: { ':one': 1 },
      ConditionExpression: 'attribute_exists(contentKey)',
      ReturnValues: 'UPDATED_NEW',
    }));
    return response.Attributes.likes;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return null;
    throw error;
  }
}

module.exports = { LOCAL_REGISTRY, findByIdentity, getContent, getRegistryItem, hashPassword, incrementLike, listContents, mergeVersionFields, newContentId, publicContent, saveRegistryItem, updateRegistryVersion, verifyPassword };
