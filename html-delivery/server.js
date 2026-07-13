const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { findByIdentity, getContent: getRegisteredContent, hashPassword, incrementLike, listContents, newContentId, saveRegistryItem, updateRegistryVersion, verifyPassword } = require('./registry');
const { clientIp, createSlidingWindowLimiter } = require('./ratelimit');

const PORT = Number(process.env.PORT || 3210);
const MAX_FILE_SIZE = 1024 * 1024;
const COHORTS = ['2026-고대세종-ai', '2026-한이음-ai-중급', '2026-고대세종-기업인턴십'];
const TEAM_COHORTS = {
  '2026-고대세종-기업인턴십': ['1팀', '2팀', '3팀', '4팀', '5팀', '6팀', '7팀', '8팀'],
};
const CATEGORIES = ['미니게임', '웹페이지'];
const LOCAL_DEPLOY_DIR = path.join(__dirname, '.local-deploy');
const LOCAL_FEEDBACK_LOG = path.join(__dirname, '.local-feedback.jsonl');
const CONTENT_ID_PATTERN = /^[0-9a-f]{8}$/;
const CONTENT_KEY_PATTERN = /^games\/[0-9a-f]{8}-v[1-9][0-9]*\.html$/;

function normalizeCategory(category) {
  return category === '랜딩페이지' ? '웹페이지' : category;
}

function normalizeContent(content) {
  return { ...content, category: normalizeCategory(content.category) };
}

function cohortOptions() {
  return COHORTS.map((name) => ({ name, teams: TEAM_COHORTS[name] || null }));
}

function validateUploadInput({ affiliation, category, name, password, file }) {
  const errors = [];
  const trimmedAffiliation = typeof affiliation === 'string' ? affiliation.trim() : '';
  const trimmedCategory = typeof category === 'string' ? category.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!COHORTS.includes(trimmedAffiliation)) errors.push('등록된 수업(코호트)을 선택하세요.');
  if (!CATEGORIES.includes(trimmedCategory)) errors.push('분류를 선택하세요.');
  const teams = TEAM_COHORTS[trimmedAffiliation];
  if (teams) {
    if (!teams.includes(trimmedName)) errors.push('팀을 선택하세요.');
  } else if (!trimmedName || trimmedName.length > 40) errors.push('이름은 1~40자로 입력하세요.');
  if (typeof password !== 'string' || password.length < 4 || password.length > 30) errors.push('비밀번호는 4~30자로 입력하세요.');
  if (!file) errors.push('HTML 파일을 선택하세요.');
  else {
    if (path.extname(file.originalname).toLowerCase() !== '.html') errors.push('HTML 파일만 업로드할 수 있습니다.');
    if (file.size > MAX_FILE_SIZE) errors.push('파일 크기는 1MB 이하여야 합니다.');
  }
  return { errors, affiliation: trimmedAffiliation, category: trimmedCategory, name: trimmedName };
}

function isValidContentId(value) { return typeof value === 'string' && CONTENT_ID_PATTERN.test(value); }
function isValidContentKey(value) { return typeof value === 'string' && CONTENT_KEY_PATTERN.test(value); }
function createVersionKey(contentId, version) { return `games/${contentId}-v${version}.html`; }
function buildPublicUrl(key, { bucket, region = 'ap-northeast-2', baseUrl, port = PORT } = {}) {
  if (!bucket) return `http://localhost:${port}/deployed/${key}`;
  const base = (baseUrl || `https://${bucket}.s3.${region}.amazonaws.com`).replace(/\/$/, '');
  return `${base}/${key}`;
}
function publicUrl(key) {
  // DRY_RUN에서만 개발 편의를 위해 앱과 같은 오리진의 로컬 파일을 제공한다.
  return buildPublicUrl(key, { bucket: process.env.S3_BUCKET, region: process.env.S3_REGION, baseUrl: process.env.BASE_URL });
}
function requestBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
}
function viewerUrl(req, contentId) { return `${requestBaseUrl(req)}/view.html?id=${contentId}`; }
function filterGames(games, { cohort, category } = {}) {
  return games.filter((game) => (!cohort || game.affiliation === cohort) && (!category || game.category === category));
}
function sortGames(games, sort = 'latest') {
  return [...games].sort((a, b) => sort === 'likes'
    ? (b.likes - a.likes) || b.updatedAt.localeCompare(a.updatedAt)
    : b.updatedAt.localeCompare(a.updatedAt));
}
function validateFeedbackInput({ nickname, message }) {
  const trimmedNickname = typeof nickname === 'string' ? nickname.trim() : '';
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const errors = [];
  if (!trimmedMessage || trimmedMessage.length > 500) errors.push('피드백은 1~500자로 입력하세요.');
  if (trimmedNickname.length > 20) errors.push('닉네임은 20자 이하로 입력하세요.');
  return { errors, nickname: trimmedNickname || '익명', message: trimmedMessage };
}
function parseFeedbackLog(contents, contentId) {
  return contents.split('\n').filter(Boolean).flatMap((line) => {
    try { const item = JSON.parse(line); return item.contentKey === contentId ? [item] : []; }
    catch { return []; }
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function storeObject(key, buffer, metadata) {
  if (!process.env.S3_BUCKET) {
    const destination = path.join(LOCAL_DEPLOY_DIR, key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);
    return;
  }
  const client = new S3Client({ region: process.env.S3_REGION || 'ap-northeast-2' });
  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: 'text/html; charset=utf-8', Metadata: metadata }));
}
function feedbackClient() { return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.S3_REGION || 'ap-northeast-2' })); }
async function saveFeedback(entry) {
  if (!process.env.FEEDBACK_TABLE) return fs.appendFile(LOCAL_FEEDBACK_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
  await feedbackClient().send(new PutCommand({ TableName: process.env.FEEDBACK_TABLE, Item: entry }));
}
async function listFeedback(contentId) {
  if (!process.env.FEEDBACK_TABLE) {
    try { return parseFeedbackLog(await fs.readFile(LOCAL_FEEDBACK_LOG, 'utf8'), contentId); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  const response = await feedbackClient().send(new QueryCommand({ TableName: process.env.FEEDBACK_TABLE, KeyConditionExpression: 'contentKey = :id', ExpressionAttributeValues: { ':id': contentId }, ScanIndexForward: true }));
  return response.Items || [];
}

function createApp() {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });
  const likeByContent = createSlidingWindowLimiter({ limit: 3, windowMs: 60_000 });
  const likeByIp = createSlidingWindowLimiter({ limit: 30, windowMs: 60_000 });
  const feedbackByIp = createSlidingWindowLimiter({ limit: 5, windowMs: 60_000 });
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/cohorts', (_req, res) => res.json({ cohorts: cohortOptions() }));
  app.get('/api/categories', (_req, res) => res.json({ categories: CATEGORIES }));
  app.get('/api/games', async (req, res, next) => {
    try {
      const sort = req.query.sort === 'likes' ? 'likes' : 'latest';
      const games = filterGames((await listContents()).map(normalizeContent), { cohort: req.query.cohort, category: req.query.category });
      return res.json({ games: sortGames(games, sort).map((game) => ({ ...game, contentUrl: publicUrl(game.latestKey) })) });
    } catch (error) { return next(error); }
  });
  app.get('/api/content', async (req, res, next) => {
    if (!isValidContentId(req.query.id)) return res.sendStatus(404);
    try {
      const registered = await getRegisteredContent(req.query.id);
      const content = registered ? normalizeContent(registered) : null;
      return content ? res.json({ content: { ...content, contentUrl: publicUrl(content.latestKey) } }) : res.sendStatus(404);
    }
    catch (error) { return next(error); }
  });
  app.get('/api/feedback', async (req, res, next) => {
    if (!isValidContentId(req.query.id)) return res.sendStatus(404);
    try { return res.json({ feedback: await listFeedback(req.query.id) }); }
    catch (error) { return next(error); }
  });
  app.post('/api/feedback', async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId)) return res.sendStatus(404);
    const result = validateFeedbackInput(req.body || {});
    if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
    if (!feedbackByIp.consume(clientIp(req))) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요.' });
    const entry = { contentKey: req.body.contentId, createdAt: new Date().toISOString(), nickname: result.nickname, message: result.message };
    try { await saveFeedback(entry); return res.status(201).json({ feedback: entry }); }
    catch (error) { return next(error); }
  });
  app.get('/deployed/*splat', async (req, res, next) => {
    try {
      const key = Array.isArray(req.params.splat) ? req.params.splat.join('/') : req.params.splat;
      if (!isValidContentKey(key)) return res.sendStatus(404);
      return res.sendFile(path.join(LOCAL_DEPLOY_DIR, key));
    } catch (error) { return next(error); }
  });
  app.post('/api/upload', upload.single('file'), async (req, res, next) => {
    const result = validateUploadInput({ ...req.body, file: req.file });
    if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
    try {
      const existing = await findByIdentity(result, normalizeCategory);
      if (existing && !verifyPassword(req.body.password, existing.passwordHash, existing.salt)) {
        return res.status(403).json({ error: '이미 등록된 이름입니다. 비밀번호가 맞지 않아요.' });
      }
      const contentId = existing?.contentId || newContentId();
      const version = existing ? existing.latestVersion + 1 : 1;
      const key = createVersionKey(contentId, version);
      const uploadedAt = new Date().toISOString();
      const credentials = existing ? { passwordHash: existing.passwordHash, salt: existing.salt } : hashPassword(req.body.password);
      const item = {
        contentKey: `content#${contentId}`, createdAt: 'meta', contentId,
        name: result.name, affiliation: result.affiliation, category: result.category,
        ...credentials, latestVersion: version, latestKey: key, likes: existing?.likes || 0,
        createdAt2: existing?.createdAt2 || uploadedAt, updatedAt: uploadedAt,
      };
      await storeObject(key, req.file.buffer, { contentid: contentId, version: String(version) });
      if (existing) await updateRegistryVersion(contentId, { latestVersion: version, latestKey: key, updatedAt: uploadedAt });
      else await saveRegistryItem(item);
      return res.status(201).json({ url: viewerUrl(req, contentId), directUrl: publicUrl(key), contentId, version, uploadedAt });
    } catch (error) { return next(error); }
  });
  app.post('/api/like', async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId)) return res.sendStatus(404);
    const ip = clientIp(req);
    if (!likeByIp.consume(ip) || !likeByContent.consume(`${ip}:${req.body.contentId}`)) {
      return res.status(429).json({ error: '잠시 후 다시 시도해 주세요.' });
    }
    try {
      const likes = await incrementLike(req.body.contentId);
      return likes === null ? res.sendStatus(404) : res.json({ likes });
    } catch (error) { return next(error); }
  });
  app.use((error, _req, res, _next) => {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '파일 크기는 1MB 이하여야 합니다.' });
    console.error('요청 처리 실패:', error);
    return res.status(500).json({ error: '서버 처리 중 오류가 발생했습니다.' });
  });
  return app;
}

if (require.main === module) createApp().listen(PORT, () => console.log(`html-delivery 서버 실행: http://localhost:${PORT}`));
module.exports = { CATEGORIES, COHORTS, CONTENT_ID_PATTERN, CONTENT_KEY_PATTERN, MAX_FILE_SIZE, TEAM_COHORTS, buildPublicUrl, cohortOptions, createApp, createVersionKey, filterGames, isValidContentId, isValidContentKey, normalizeCategory, parseFeedbackLog, publicUrl, requestBaseUrl, sortGames, validateFeedbackInput, validateUploadInput, viewerUrl };
