const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { DeleteObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { addAdminAccount, addCustomCohort, deleteRegistryItem, findByIdentity, getAdminAccounts, getAdminCredential, getContent: getRegisteredContent, getCustomCohorts, getRegistryItem, hashPassword, incrementLike, listContents, newContentId, renameCustomCohort, saveAdminCredential, saveRegistryItem, updateAdminAccountPassword, updateContentFields, updateContentPassword, updateRegistryVersion, verifyPassword } = require('./registry');
const { createAdminAuth } = require('./admin-auth');
const { contentDisposition, createExportDownload, EXPORT_ID_PATTERN, localExportPath } = require('./cohort-export');
const { dispatchExportJob } = require('./export-dispatch');
const { createExportJob, failExportJob, getExportJob, listExportJobs, publicExportJob, requeueExportJob } = require('./export-jobs');
const { COHORT_ID_PATTERN, deriveLegacyCohortId, newCohortId } = require('./domain/cohort');
const { categoryFromContentType, contentTypeFromCategory, normalizeLegacyCategory, toDomainContent } = require('./domain/content');
const { CONTENT_KEY_PATTERN, allVersionKeysForContent, createVersionKey, isValidContentKey, preferredContentKey, storageSchemeForKey } = require('./domain/content-storage');
const { clientIp, createSlidingWindowLimiter } = require('./ratelimit');
const { createContentRepository } = require('./repositories/content-repository');

const PORT = Number(process.env.PORT || 3210);
const MAX_FILE_SIZE = 1024 * 1024;
const teamNames = (count) => Array.from({ length: count }, (_, index) => `${index + 1}팀`);
const COHORTS = [
  '2026-고대세종-ai',
  '2026-한이음-ai-중급',
  '2026-고대세종-기업인턴십',
  '2026-고대세종-아이디어톤',
  '2026-국민대-ai워크플로우',
  '2026-서남-해커톤',
];
const TEAM_COHORTS = {
  '2026-고대세종-기업인턴십': teamNames(8),
  '2026-고대세종-아이디어톤': teamNames(7),
  '2026-국민대-ai워크플로우': teamNames(5),
  '2026-서남-해커톤': teamNames(6),
};
const COHORT_DATES = {
  '2026-고대세종-ai': '6.24~25',
  '2026-한이음-ai-중급': '7.12',
  '2026-고대세종-기업인턴십': '7.1~31',
  '2026-고대세종-아이디어톤': '6.26',
  '2026-국민대-ai워크플로우': '6.24~30',
  '2026-서남-해커톤': '7.10',
};
const CATEGORIES = ['미니게임', '웹페이지'];
const LOCAL_DEPLOY_DIR = path.join(__dirname, '.local-deploy');
const LOCAL_FEEDBACK_LOG = path.join(__dirname, '.local-feedback.jsonl');
const CONTENT_ID_PATTERN = /^[0-9a-f]{8}$/;
const contentRepository = createContentRepository({
  list: listContents,
  getPrivate: getRegistryItem,
  getPublic: getRegisteredContent,
  findByIdentity,
  create: saveRegistryItem,
  updateVersion: updateRegistryVersion,
  updateFields: updateContentFields,
  updatePassword: updateContentPassword,
  delete: deleteRegistryItem,
  incrementLikes: incrementLike,
});

function normalizeCategory(category) {
  return normalizeLegacyCategory(category);
}

function normalizeContent(content) {
  return { ...content, category: normalizeCategory(content.category) };
}

function publicLegacyContent(content) {
  const key = preferredContentKey(content);
  const { latestObjectKey: _latestObjectKey, ...legacy } = content;
  return { ...legacy, latestKey: key, contentUrl: publicUrl(key) };
}

function versionStorageFields(existing, key) {
  const hasLegacyFallback = Boolean(existing.latestObjectKey
    && existing.latestObjectKey !== existing.latestKey
    && storageSchemeForKey(existing.latestKey) === 'legacy-games');
  return hasLegacyFallback ? { latestObjectKey: key } : { latestKey: key, latestObjectKey: key };
}

function buildCohortOverview({ cohort = null, contents, appBaseUrl }) {
  const normalized = contents.map(normalizeContent).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const storage = { legacyGames: 0, v2Contents: 0, unknown: 0 };
  const overviewContents = normalized.map((content) => {
    const latestKey = preferredContentKey(content);
    const storageScheme = storageSchemeForKey(latestKey);
    if (storageScheme === 'legacy-games') storage.legacyGames += 1;
    else if (storageScheme === 'v2-contents') storage.v2Contents += 1;
    else storage.unknown += 1;
    return {
      contentId: content.contentId,
      title: contentTitle(content),
      name: content.name,
      category: content.category,
      latestVersion: content.latestVersion,
      latestKey,
      fallbackKey: content.latestKey !== latestKey ? content.latestKey : null,
      storageScheme,
      updatedAt: content.updatedAt,
      viewerUrl: `${appBaseUrl.replace(/\/$/, '')}/view.html?id=${content.contentId}`,
    };
  });
  return {
    cohort,
    summary: {
      totalContents: normalized.length,
      gameCount: normalized.filter((content) => content.category === '미니게임').length,
      webpageCount: normalized.filter((content) => content.category === '웹페이지').length,
      totalVersions: normalized.reduce((total, content) => total + (Number(content.latestVersion) || 0), 0),
      latestUpdatedAt: normalized[0]?.updatedAt || null,
      exportReady: Boolean(cohort && normalized.length),
    },
    storage,
    contents: overviewContents,
  };
}

function contentTitle(content) {
  return content.title || content.name;
}

async function cohortOptions() {
  const base = COHORTS.map((name) => ({ cohortId: deriveLegacyCohortId(name), name, teams: TEAM_COHORTS[name] || null, date: COHORT_DATES[name] || null }));
  const names = new Set(COHORTS);
  const custom = (await getCustomCohorts()).filter((cohort) => cohort?.name && !names.has(cohort.name)).map((cohort) => ({ cohortId: COHORT_ID_PATTERN.test(cohort.cohortId || '') ? cohort.cohortId : deriveLegacyCohortId(cohort.name), name: cohort.name, teams: null, date: cohort.date || null, createdAt: cohort.createdAt || null, updatedAt: cohort.updatedAt || null }));
  return [...base, ...custom];
}

function validateUploadInput({ affiliation, category, name, title, password, file }, validAffiliations = COHORTS) {
  const errors = [];
  const trimmedAffiliation = typeof affiliation === 'string' ? affiliation.trim() : '';
  const trimmedCategory = typeof category === 'string' ? category.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!validAffiliations.includes(trimmedAffiliation)) errors.push('등록된 수업(코호트)을 선택하세요.');
  if (!CATEGORIES.includes(trimmedCategory)) errors.push('분류를 선택하세요.');
  const teams = TEAM_COHORTS[trimmedAffiliation];
  if (teams) {
    if (!teams.includes(trimmedName)) errors.push('팀을 선택하세요.');
  } else if (!trimmedName || trimmedName.length > 40) errors.push('이름은 1~40자로 입력하세요.');
  if (!trimmedTitle || trimmedTitle.length > 60) errors.push('제목을 입력하세요.');
  if (typeof password !== 'string' || password.length < 4 || password.length > 30) errors.push('비밀번호는 4~30자로 입력하세요.');
  if (!file) errors.push('HTML 파일을 선택하세요.');
  else {
    if (path.extname(file.originalname).toLowerCase() !== '.html') errors.push('HTML 파일만 업로드할 수 있습니다.');
    if (file.size > MAX_FILE_SIZE) errors.push('파일 크기는 1MB 이하여야 합니다.');
  }
  return { errors, affiliation: trimmedAffiliation, category: trimmedCategory, name: trimmedName, title: trimmedTitle };
}

function isValidContentId(value) { return typeof value === 'string' && CONTENT_ID_PATTERN.test(value); }
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
function toV2Cohort(cohort) {
  const teamOptions = Array.isArray(cohort.teams) ? cohort.teams : [];
  return {
    cohortId: cohort.cohortId,
    name: cohort.name,
    dateLabel: cohort.date || null,
    submissionMode: teamOptions.length ? 'team' : 'individual',
    teamOptions,
    status: 'active',
    createdAt: cohort.createdAt || null,
    updatedAt: cohort.updatedAt || null,
  };
}
function toPublicV2Content(record, cohort, req) {
  const domain = toDomainContent(record, { ownerKind: Array.isArray(cohort?.teams) ? 'team' : 'individual' });
  return {
    contentId: domain.contentId,
    cohort: cohort ? { cohortId: cohort.cohortId, name: cohort.name, dateLabel: cohort.date || null } : null,
    owner: domain.owner,
    title: domain.title,
    contentType: domain.contentType,
    latestVersion: domain.latestVersion,
    likes: domain.likes,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
    contentUrl: publicUrl(domain.latestObjectKey),
    viewerUrl: viewerUrl(req, domain.contentId),
  };
}
function sortV2Contents(contents, sort = 'latest') {
  return [...contents].sort((a, b) => sort === 'likes'
    ? (b.likes - a.likes) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    : String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
function validateV2CreateInput(body, file, cohorts) {
  const selectedCohort = cohorts.find((cohort) => cohort.cohortId === body?.cohortId);
  const category = categoryFromContentType(body?.contentType);
  const result = validateUploadInput({
    affiliation: selectedCohort?.name,
    category,
    name: body?.ownerName,
    title: body?.title,
    password: body?.password,
    file,
  }, cohorts.map((cohort) => cohort.name));
  if (!selectedCohort) result.errors.unshift('등록된 수업(코호트)을 선택하세요.');
  if (!category) result.errors.unshift('콘텐츠 유형을 선택하세요.');
  return { ...result, selectedCohort, contentType: body?.contentType };
}
function validateFeedbackInput({ nickname, message }) {
  const trimmedNickname = typeof nickname === 'string' ? nickname.trim() : '';
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const errors = [];
  if (!trimmedMessage || trimmedMessage.length > 500) errors.push('피드백은 1~500자로 입력하세요.');
  if (trimmedNickname.length > 20) errors.push('닉네임은 20자 이하로 입력하세요.');
  return { errors, nickname: trimmedNickname || '익명', message: trimmedMessage };
}
function validateAdminContentPatch(existing, body = {}, validAffiliations = COHORTS) {
  const allowed = ['title', 'name', 'affiliation', 'category'];
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  const errors = [];
  if (unknown.length) errors.push('수정할 수 없는 항목이 포함되어 있습니다.');
  const merged = {
    title: body.title === undefined ? existing.title : body.title,
    name: body.name === undefined ? existing.name : body.name,
    affiliation: body.affiliation === undefined ? existing.affiliation : body.affiliation,
    category: body.category === undefined ? existing.category : body.category,
  };
  const trimmed = {
    title: typeof merged.title === 'string' ? merged.title.trim() : '',
    name: typeof merged.name === 'string' ? merged.name.trim() : '',
    affiliation: typeof merged.affiliation === 'string' ? merged.affiliation.trim() : '',
    category: typeof merged.category === 'string' ? merged.category.trim() : '',
  };
  if (!allowed.some((key) => Object.prototype.hasOwnProperty.call(body, key))) errors.push('수정할 항목을 입력하세요.');
  if (!validAffiliations.includes(trimmed.affiliation)) errors.push('등록된 수업(코호트)을 선택하세요.');
  if (!CATEGORIES.includes(trimmed.category)) errors.push('분류를 선택하세요.');
  const teams = TEAM_COHORTS[trimmed.affiliation];
  if (teams) {
    if (!teams.includes(trimmed.name)) errors.push('팀을 선택하세요.');
  } else if (!trimmed.name || trimmed.name.length > 40) errors.push('이름은 1~40자로 입력하세요.');
  if (!trimmed.title || trimmed.title.length > 60) errors.push('제목을 입력하세요.');
  const fields = {};
  allowed.forEach((key) => { if (Object.prototype.hasOwnProperty.call(body, key)) fields[key] = trimmed[key]; });
  return { errors, fields };
}
function validateNewPassword(newPassword) {
  return typeof newPassword === 'string' && newPassword.length >= 4 && newPassword.length <= 30;
}
function auditAdminAction(admin_action, contentId) {
  console.log(JSON.stringify({ admin_action, contentId, at: new Date().toISOString() }));
}
async function exportJobResponse(job) {
  const result = publicExportJob(job);
  if (result?.status === 'completed' && Date.parse(result.archiveExpiresAt) > Date.now()) result.downloadUrl = await createExportDownload(result);
  return result;
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
async function deleteStoredObject(key) {
  if (!process.env.S3_BUCKET) {
    await fs.rm(path.join(LOCAL_DEPLOY_DIR, key), { force: true });
    return;
  }
  const client = new S3Client({ region: process.env.S3_REGION || 'ap-northeast-2' });
  await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
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
async function writeLocalFeedback(entries) {
  if (!entries.length) {
    await fs.rm(LOCAL_FEEDBACK_LOG, { force: true });
    return;
  }
  await fs.writeFile(LOCAL_FEEDBACK_LOG, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
}
async function deleteFeedbackEntry(contentId, createdAt) {
  if (!process.env.FEEDBACK_TABLE) {
    let entries = [];
    try { entries = (await fs.readFile(LOCAL_FEEDBACK_LOG, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    const nextEntries = entries.filter((entry) => !(entry.contentKey === contentId && entry.createdAt === createdAt));
    if (nextEntries.length === entries.length) return false;
    await writeLocalFeedback(nextEntries);
    return true;
  }
  await feedbackClient().send(new DeleteCommand({ TableName: process.env.FEEDBACK_TABLE, Key: { contentKey: contentId, createdAt } }));
  return true;
}
async function deleteFeedbackForContent(contentId) {
  if (!process.env.FEEDBACK_TABLE) {
    let entries = [];
    try { entries = (await fs.readFile(LOCAL_FEEDBACK_LOG, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
    catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
    const nextEntries = entries.filter((entry) => entry.contentKey !== contentId);
    await writeLocalFeedback(nextEntries);
    return entries.length - nextEntries.length;
  }
  const items = await listFeedback(contentId);
  await Promise.all(items.map((entry) => feedbackClient().send(new DeleteCommand({ TableName: process.env.FEEDBACK_TABLE, Key: { contentKey: contentId, createdAt: entry.createdAt } }))));
  return items.length;
}

function createApp() {
  const app = express();
  const adminAuth = createAdminAuth({ getAdminCredential, saveAdminCredential, getAdminAccounts, addAdminAccount, updateAdminAccountPassword, hashPassword, auditAdminAction });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });
  const likeByContent = createSlidingWindowLimiter({ limit: 3, windowMs: 60_000 });
  const likeByIp = createSlidingWindowLimiter({ limit: 30, windowMs: 60_000 });
  const feedbackByIp = createSlidingWindowLimiter({ limit: 5, windowMs: 60_000 });
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.post('/api/admin/login', adminAuth.login);
  app.get('/api/admin/session', adminAuth.requireAdmin, (_req, res) => res.json({ ok: true }));
  app.post('/api/admin/logout', adminAuth.requireAdmin, adminAuth.logout);
  app.post('/api/admin/change-password', adminAuth.requireAdmin, adminAuth.changePassword);
  app.post('/api/admin/admins', adminAuth.requireAdmin, adminAuth.addAdmin);
  app.post('/api/admin/reset-password', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId)) return res.sendStatus(404);
    if (!validateNewPassword(req.body?.newPassword)) return res.status(400).json({ error: '비밀번호는 4~30자로 입력하세요.' });
    const credentials = { ...hashPassword(req.body.newPassword), updatedAt: new Date().toISOString() };
    try {
      const ok = await contentRepository.updatePassword(req.body.contentId, credentials);
      if (!ok) return res.sendStatus(404);
      auditAdminAction('reset-password', req.body.contentId);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.patch('/api/admin/content/:contentId', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const existing = await contentRepository.getPrivate(req.params.contentId);
      if (!existing) return res.sendStatus(404);
      const cohortNames = (await cohortOptions()).map((cohort) => cohort.name);
      const result = validateAdminContentPatch(existing, req.body || {}, cohortNames);
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
      const fields = { ...result.fields, updatedAt: new Date().toISOString() };
      const ok = await contentRepository.updateFields(req.params.contentId, fields);
      if (!ok) return res.sendStatus(404);
      const content = await contentRepository.getPublic(req.params.contentId);
      auditAdminAction('update-content', req.params.contentId);
      return res.json({ content: publicLegacyContent(normalizeContent(content)) });
    } catch (error) { return next(error); }
  });
  app.delete('/api/admin/content/:contentId', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const existing = await contentRepository.getPrivate(req.params.contentId);
      if (!existing) return res.sendStatus(404);
      await Promise.all(allVersionKeysForContent(existing).map(deleteStoredObject));
      await deleteFeedbackForContent(req.params.contentId);
      await contentRepository.delete(req.params.contentId);
      auditAdminAction('delete-content', req.params.contentId);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.delete('/api/admin/feedback', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId) || typeof req.body?.createdAt !== 'string') return res.sendStatus(404);
    try {
      const ok = await deleteFeedbackEntry(req.body.contentId, req.body.createdAt);
      if (!ok) return res.sendStatus(404);
      auditAdminAction('delete-feedback', req.body.contentId);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.get('/api/cohorts', async (_req, res, next) => {
    try { return res.json({ cohorts: await cohortOptions() }); }
    catch (error) { return next(error); }
  });
  app.get('/api/admin/cohort-overview', adminAuth.requireAdmin, async (req, res, next) => {
    const requestedCohort = typeof req.query.cohort === 'string' ? req.query.cohort.trim() : '';
    try {
      const cohorts = await cohortOptions();
      const cohort = requestedCohort ? cohorts.find((item) => item.name === requestedCohort) : null;
      if (requestedCohort && !cohort) return res.sendStatus(404);
      const contents = (await contentRepository.list()).filter((content) => !cohort || content.affiliation === cohort.name);
      return res.json({ overview: buildCohortOverview({ cohort, contents, appBaseUrl: requestBaseUrl(req) }) });
    } catch (error) { return next(error); }
  });
  app.post('/api/admin/cohorts', adminAuth.requireAdmin, async (req, res, next) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const date = typeof req.body?.date === 'string' ? req.body.date.trim() : null;
    if (!name || name.length > 60) return res.status(400).json({ error: '코호트 이름은 1~60자로 입력하세요.' });
    if (date !== null && date.length > 20) return res.status(400).json({ error: '일자는 20자 이하로 입력하세요.' });
    try {
      if ((await cohortOptions()).some((cohort) => cohort.name === name)) return res.status(409).json({ error: '이미 있는 코호트예요.' });
      await addCustomCohort({ cohortId: newCohortId(), name, date: date || null });
      auditAdminAction('add-cohort', null);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.patch('/api/admin/cohorts', adminAuth.requireAdmin, async (req, res, next) => {
    const oldName = typeof req.body?.oldName === 'string' ? req.body.oldName.trim() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 60) return res.status(400).json({ error: '코호트 이름은 1~60자로 입력하세요.' });
    try {
      const cohorts = await cohortOptions();
      if (!cohorts.some((cohort) => cohort.name === oldName)) return res.sendStatus(404);
      if (COHORTS.includes(oldName)) return res.status(400).json({ error: '기본 코호트는 이름을 변경할 수 없습니다.' });
      if (name !== oldName && cohorts.some((cohort) => cohort.name === name)) return res.status(409).json({ error: '이미 있는 코호트예요.' });
      const renamed = await renameCustomCohort(oldName, name);
      if (!renamed) return res.sendStatus(404);
      const matches = (await contentRepository.list()).filter((content) => content.affiliation === oldName);
      await Promise.all(matches.map((content) => contentRepository.updateFields(content.contentId, { affiliation: name })));
      auditAdminAction('rename-cohort', null);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.get('/api/admin/exports', adminAuth.requireAdmin, async (req, res, next) => {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
    try {
      const jobs = await listExportJobs(limit);
      return res.json({ exports: await Promise.all(jobs.map(exportJobResponse)) });
    } catch (error) { return next(error); }
  });
  app.post('/api/admin/exports', adminAuth.requireAdmin, async (req, res, next) => {
    const cohort = typeof req.body?.cohort === 'string' ? req.body.cohort.trim() : '';
    try {
      if (!(await cohortOptions()).some((item) => item.name === cohort)) return res.sendStatus(404);
      const contents = (await contentRepository.list()).filter((content) => content.affiliation === cohort);
      if (!contents.length) return res.status(409).json({ error: '다운로드할 콘텐츠가 없습니다.' });
      const exportId = crypto.randomBytes(16).toString('hex');
      const job = await createExportJob({
        exportId,
        cohort,
        contentIds: contents.map((content) => content.contentId),
        requestedAt: new Date().toISOString(),
        requestedBy: req.adminId,
        appBaseUrl: requestBaseUrl(req),
      });
      try { await dispatchExportJob(exportId); }
      catch (error) {
        await failExportJob(exportId, { failedAt: new Date().toISOString(), errorCode: 'DISPATCH_FAILED' });
        throw error;
      }
      auditAdminAction('export-cohort', exportId);
      return res.status(202).json({ export: publicExportJob(job) });
    } catch (error) { return next(error); }
  });
  app.get('/api/admin/exports/:exportId', adminAuth.requireAdmin, async (req, res, next) => {
    if (!EXPORT_ID_PATTERN.test(req.params.exportId)) return res.sendStatus(404);
    try {
      const job = await getExportJob(req.params.exportId);
      if (!job) return res.sendStatus(404);
      return res.json({ export: await exportJobResponse(job) });
    } catch (error) { return next(error); }
  });
  app.post('/api/admin/exports/:exportId/retry', adminAuth.requireAdmin, async (req, res, next) => {
    if (!EXPORT_ID_PATTERN.test(req.params.exportId)) return res.sendStatus(404);
    try {
      if (!await getExportJob(req.params.exportId)) return res.sendStatus(404);
      const requestedAt = new Date().toISOString();
      if (!await requeueExportJob(req.params.exportId, requestedAt)) return res.status(409).json({ error: '실패한 작업만 재시도할 수 있습니다.' });
      try { await dispatchExportJob(req.params.exportId); }
      catch (error) {
        await failExportJob(req.params.exportId, { failedAt: new Date().toISOString(), errorCode: 'DISPATCH_FAILED' });
        throw error;
      }
      auditAdminAction('retry-export', req.params.exportId);
      return res.status(202).json({ export: publicExportJob(await getExportJob(req.params.exportId)) });
    } catch (error) { return next(error); }
  });
  app.get('/api/admin/exports/:exportId/download', adminAuth.requireAdmin, async (req, res, next) => {
    if (process.env.S3_BUCKET) return res.sendStatus(404);
    const filePath = localExportPath(req.params.exportId);
    if (!filePath) return res.sendStatus(404);
    try {
      const job = await getExportJob(req.params.exportId);
      if (!job) return res.sendStatus(404);
      if (job.status !== 'completed') return res.status(409).json({ error: '아직 완료되지 않은 내보내기입니다.' });
      await fs.access(filePath);
      res.set('Content-Disposition', contentDisposition(job.fileName));
      return res.sendFile(filePath, { dotfiles: 'allow' });
    } catch (error) {
      if (error.code === 'ENOENT') return res.sendStatus(404);
      return next(error);
    }
  });
  app.get('/api/categories', (_req, res) => res.json({ categories: CATEGORIES }));
  app.get('/api/v2/cohorts', async (_req, res, next) => {
    try { return res.json({ cohorts: (await cohortOptions()).map(toV2Cohort) }); }
    catch (error) { return next(error); }
  });
  app.get('/api/v2/contents', async (req, res, next) => {
    const requestedType = typeof req.query.type === 'string' ? req.query.type : '';
    const requestedCohortId = typeof req.query.cohortId === 'string' ? req.query.cohortId : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'latest';
    if (requestedType && !categoryFromContentType(requestedType)) return res.status(400).json({ error: '지원하지 않는 콘텐츠 유형입니다.' });
    if (!['latest', 'likes'].includes(sort)) return res.status(400).json({ error: '지원하지 않는 정렬 방식입니다.' });
    try {
      const cohorts = await cohortOptions();
      const cohortById = new Map(cohorts.map((cohort) => [cohort.cohortId, cohort]));
      if (requestedCohortId && !cohortById.has(requestedCohortId)) return res.status(400).json({ error: '등록된 코호트를 찾을 수 없습니다.' });
      const contents = (await contentRepository.list())
        .filter((content) => !requestedCohortId || content.cohortId === requestedCohortId)
        .filter((content) => !requestedType || contentTypeFromCategory(content.category) === requestedType)
        .map((content) => toPublicV2Content(content, cohortById.get(content.cohortId), req));
      return res.json({ contents: sortV2Contents(contents, sort) });
    } catch (error) { return next(error); }
  });
  app.get('/api/v2/contents/:contentId', async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const [content, cohorts] = await Promise.all([contentRepository.getPublic(req.params.contentId), cohortOptions()]);
      if (!content) return res.sendStatus(404);
      const cohort = cohorts.find((item) => item.cohortId === content.cohortId);
      return res.json({ content: toPublicV2Content(content, cohort, req) });
    } catch (error) { return next(error); }
  });
  app.get('/api/v2/contents/:contentId/versions', async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const content = await contentRepository.getPublic(req.params.contentId);
      if (!content) return res.sendStatus(404);
      const versions = Array.from({ length: content.latestVersion }, (_, index) => {
        const version = index + 1;
        return {
          version,
          isLatest: version === content.latestVersion,
          uploadedAt: version === content.latestVersion ? content.updatedAt : (version === 1 ? content.createdAt2 : null),
        };
      });
      return res.json({ versions });
    } catch (error) { return next(error); }
  });
  app.post('/api/v2/contents', upload.single('file'), async (req, res, next) => {
    try {
      const cohorts = await cohortOptions();
      const result = validateV2CreateInput(req.body, req.file, cohorts);
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: [...new Set(result.errors)] });
      const contentId = newContentId();
      const version = 1;
      const key = createVersionKey(contentId, version);
      const uploadedAt = new Date().toISOString();
      const item = {
        contentKey: `content#${contentId}`, createdAt: 'meta', contentId,
        cohortId: result.selectedCohort.cohortId, name: result.name, title: result.title,
        affiliation: result.affiliation, category: result.category,
        ...hashPassword(req.body.password), latestVersion: version, latestKey: key, latestObjectKey: key, likes: 0,
        createdAt2: uploadedAt, updatedAt: uploadedAt,
      };
      await storeObject(key, req.file.buffer, { contentid: contentId, title: encodeURIComponent(result.title), version: String(version) });
      await contentRepository.create(item);
      return res.status(201).json({ content: toPublicV2Content(item, result.selectedCohort, req) });
    } catch (error) { return next(error); }
  });
  app.post('/api/v2/contents/:contentId/versions', upload.single('file'), async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const [existing, cohorts] = await Promise.all([contentRepository.getPrivate(req.params.contentId), cohortOptions()]);
      if (!existing) return res.sendStatus(404);
      const result = validateUploadInput({
        affiliation: existing.affiliation,
        category: normalizeCategory(existing.category),
        name: existing.name,
        title: contentTitle(existing),
        password: req.body.password,
        file: req.file,
      }, cohorts.map((cohort) => cohort.name));
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
      if (!verifyPassword(req.body.password, existing.passwordHash, existing.salt)) return res.status(403).json({ error: '소유 비밀번호가 맞지 않아요.' });
      const version = existing.latestVersion + 1;
      const key = createVersionKey(existing.contentId, version, { existingKey: preferredContentKey(existing) });
      const uploadedAt = new Date().toISOString();
      const storageFields = versionStorageFields(existing, key);
      await storeObject(key, req.file.buffer, { contentid: existing.contentId, title: encodeURIComponent(result.title), version: String(version) });
      await contentRepository.updateVersion(existing.contentId, { title: result.title, latestVersion: version, ...storageFields, updatedAt: uploadedAt });
      const updated = { ...existing, title: result.title, latestVersion: version, ...storageFields, updatedAt: uploadedAt };
      const cohort = cohorts.find((item) => item.cohortId === existing.cohortId);
      return res.status(201).json({ content: toPublicV2Content(updated, cohort, req) });
    } catch (error) { return next(error); }
  });
  app.get('/api/games', async (req, res, next) => {
    try {
      const sort = req.query.sort === 'likes' ? 'likes' : 'latest';
      const games = filterGames((await contentRepository.list()).map(normalizeContent), { cohort: req.query.cohort, category: req.query.category });
      return res.json({ games: sortGames(games, sort).map(publicLegacyContent) });
    } catch (error) { return next(error); }
  });
  app.get('/api/content', async (req, res, next) => {
    if (!isValidContentId(req.query.id)) return res.sendStatus(404);
    try {
      const registered = await contentRepository.getPublic(req.query.id);
      const content = registered ? normalizeContent(registered) : null;
      return content ? res.json({ content: publicLegacyContent(content) }) : res.sendStatus(404);
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
    try {
      const cohorts = await cohortOptions();
      const cohortNames = cohorts.map((cohort) => cohort.name);
      const result = validateUploadInput({ ...req.body, file: req.file }, cohortNames);
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
      const selectedCohort = cohorts.find((cohort) => cohort.name === result.affiliation);
      const existing = await contentRepository.findByIdentity(result, normalizeCategory);
      if (existing && !verifyPassword(req.body.password, existing.passwordHash, existing.salt)) {
        return res.status(403).json({ error: '이미 등록된 이름입니다. 비밀번호가 맞지 않아요.' });
      }
      const contentId = existing?.contentId || newContentId();
      const version = existing ? existing.latestVersion + 1 : 1;
      const key = createVersionKey(contentId, version, { existingKey: existing ? preferredContentKey(existing) : undefined });
      const uploadedAt = new Date().toISOString();
      const storageFields = existing ? versionStorageFields(existing, key) : { latestKey: key, latestObjectKey: key };
      const credentials = existing ? { passwordHash: existing.passwordHash, salt: existing.salt } : hashPassword(req.body.password);
      const item = {
        contentKey: `content#${contentId}`, createdAt: 'meta', contentId,
        cohortId: selectedCohort.cohortId, name: result.name, title: result.title, affiliation: result.affiliation, category: result.category,
        ...credentials, latestVersion: version, ...storageFields, likes: existing?.likes || 0,
        createdAt2: existing?.createdAt2 || uploadedAt, updatedAt: uploadedAt,
      };
      await storeObject(key, req.file.buffer, { contentid: contentId, title: encodeURIComponent(result.title), version: String(version) });
      if (existing) await contentRepository.updateVersion(contentId, { title: result.title, latestVersion: version, ...storageFields, updatedAt: uploadedAt });
      else await contentRepository.create(item);
      return res.status(201).json({ url: viewerUrl(req, contentId), directUrl: publicUrl(key), contentId, title: result.title, version, uploadedAt });
    } catch (error) { return next(error); }
  });
  app.post('/api/like', async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId)) return res.sendStatus(404);
    const ip = clientIp(req);
    if (!likeByIp.consume(ip) || !likeByContent.consume(`${ip}:${req.body.contentId}`)) {
      return res.status(429).json({ error: '잠시 후 다시 시도해 주세요.' });
    }
    try {
      const likes = await contentRepository.incrementLikes(req.body.contentId);
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
module.exports = { CATEGORIES, COHORTS, CONTENT_ID_PATTERN, CONTENT_KEY_PATTERN, MAX_FILE_SIZE, TEAM_COHORTS, buildCohortOverview, buildPublicUrl, cohortOptions, contentTitle, createApp, createVersionKey, filterGames, isValidContentId, isValidContentKey, normalizeCategory, parseFeedbackLog, publicLegacyContent, publicUrl, requestBaseUrl, sortGames, storageSchemeForKey, validateAdminContentPatch, validateFeedbackInput, validateNewPassword, validateUploadInput, versionStorageFields, viewerUrl };
