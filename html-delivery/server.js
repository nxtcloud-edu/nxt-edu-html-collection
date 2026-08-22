const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { createObjectStorage } = require('./adapters/object-storage');
const { addAdminAccount, addCustomCohort, deleteRegistryItem, findByIdentity, getAdminAccounts, getAdminCredential, getContent: getRegisteredContent, getCustomCohorts, getRegistryItem, hashPassword, incrementLike, listContents, newContentId, renameCustomCohort, saveAdminCredential, saveRegistryItem, updateAdminAccountPassword, updateContentFields, updateContentPassword, updateCustomCohortById, updateRegistryVersion, verifyPassword } = require('./registry');
const { createAdminAuth } = require('./admin-auth');
const { contentDisposition, createExportDownload, EXPORT_ID_PATTERN, localExportPath } = require('./cohort-export');
const { dispatchExportJob } = require('./export-dispatch');
const { createExportJob, failExportJob, getExportJob, listExportJobs, publicExportJob, requeueExportJob } = require('./export-jobs');
const { COHORT_ID_PATTERN, deriveLegacyCohortId, newCohortId } = require('./domain/cohort');
const { categoryFromContentType, contentTypeFromCategory, normalizeLegacyCategory, toDomainContent } = require('./domain/content');
const { CONTENT_KEY_PATTERN, allVersionKeysForContent, createVersionKey, isValidContentKey, preferredContentKey, storageSchemeForKey } = require('./domain/content-storage');
const { clientIp, createSlidingWindowLimiter } = require('./ratelimit');
const { createContentRepository } = require('./repositories/content-repository');
const { createAuditRepository } = require('./repositories/audit-repository');
const { createFeedbackRepository, parseFeedbackLog } = require('./repositories/feedback-repository');
const { createVersionRepository } = require('./repositories/version-repository');
const { createPublicRouter } = require('./routes/public-routes');
const { createAdminRouter } = require('./routes/admin-routes');
const { createContentService } = require('./services/content-service');
const { createCohortService } = require('./services/cohort-service');

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
const objectStorage = createObjectStorage({ localDirectory: LOCAL_DEPLOY_DIR, localPort: PORT });
const feedbackRepository = createFeedbackRepository({ localFile: LOCAL_FEEDBACK_LOG });
const versionRepository = createVersionRepository();
const auditRepository = createAuditRepository();
const contentService = createContentService({
  contentRepository,
  versionRepository,
  feedbackRepository,
  objectStorage,
  createContentId: newContentId,
  createVersionKey,
  preferredContentKey,
  versionStorageFields,
  hashPassword,
  verifyPassword,
  allVersionKeysForContent,
});
const cohortService = createCohortService({
  baseCohorts: COHORTS,
  cohortDates: COHORT_DATES,
  teamCohorts: TEAM_COHORTS,
  getCustomCohorts,
  addCustomCohort,
  renameCustomCohort,
  updateCustomCohortById,
  deriveLegacyCohortId,
  newCohortId,
  isCohortId: (value) => COHORT_ID_PATTERN.test(value),
  contentService,
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
  return cohortService.list();
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
  return objectStorage.publicUrl(key);
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
    submissionMode: cohort.submissionMode || (teamOptions.length ? 'team' : 'individual'),
    teamOptions,
    status: cohort.status || 'active',
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
async function auditAdminAction(admin_action, targetId, context = {}) {
  const occurredAt = new Date().toISOString();
  const event = {
    actorId: context.actorId || 'system',
    action: admin_action,
    targetType: context.targetType || (targetId ? 'content' : 'system'),
    targetId: context.targetId ?? targetId ?? null,
    details: context.details || {},
    occurredAt,
  };
  console.log(JSON.stringify({ admin_action, contentId: targetId || null, actorId: event.actorId, at: occurredAt }));
  try { return await auditRepository.record(event); }
  catch (error) {
    console.error('감사 로그 저장 실패:', error.message);
    return null;
  }
}
async function exportJobResponse(job) {
  const result = publicExportJob(job);
  if (result?.status === 'completed' && Date.parse(result.archiveExpiresAt) > Date.now()) result.downloadUrl = await createExportDownload(result);
  return result;
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
  app.use(createAdminRouter({
    adminAuth,
    cohortService,
    contentService,
    auditRepository,
    feedbackRepository,
    exportJobs: {
      create: createExportJob,
      dispatch: dispatchExportJob,
      fail: failExportJob,
      get: getExportJob,
      idPattern: EXPORT_ID_PATTERN,
      list: listExportJobs,
      public: publicExportJob,
      requeue: requeueExportJob,
    },
    exportFiles: {
      contentDisposition,
      localPath: localExportPath,
      response: exportJobResponse,
    },
    helpers: {
      auditAdminAction,
      buildCohortOverview,
      hashPassword,
      isCohortId: (value) => typeof value === 'string' && COHORT_ID_PATTERN.test(value),
      isValidContentId,
      normalizeContent,
      publicLegacyContent,
      publicUrl,
      requestBaseUrl,
      validateAdminContentPatch,
      validateNewPassword,
    },
  }));
  app.use(createPublicRouter({
    categories: CATEGORIES,
    cohortOptions,
    contentService,
    feedbackRepository,
    upload,
    publicDeployDirectory: LOCAL_DEPLOY_DIR,
    rateLimits: { feedbackByIp, likeByContent, likeByIp },
    helpers: {
      categoryFromContentType,
      clientIp,
      contentTitle,
      contentTypeFromCategory,
      filterGames,
      isValidContentId,
      isValidContentKey,
      normalizeCategory,
      publicLegacyContent,
      publicUrl,
      sortGames,
      sortV2Contents,
      toPublicV2Content,
      toV2Cohort,
      validateFeedbackInput,
      validateUploadInput,
      validateV2CreateInput,
      viewerUrl,
    },
  }));
  app.use((error, _req, res, _next) => {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '파일 크기는 1MB 이하여야 합니다.' });
    console.error('요청 처리 실패:', error);
    return res.status(500).json({ error: '서버 처리 중 오류가 발생했습니다.' });
  });
  return app;
}

if (require.main === module) createApp().listen(PORT, () => console.log(`html-delivery 서버 실행: http://localhost:${PORT}`));
module.exports = { CATEGORIES, COHORTS, CONTENT_ID_PATTERN, CONTENT_KEY_PATTERN, MAX_FILE_SIZE, TEAM_COHORTS, buildCohortOverview, buildPublicUrl, cohortOptions, contentTitle, createApp, createVersionKey, filterGames, isValidContentId, isValidContentKey, normalizeCategory, parseFeedbackLog, publicLegacyContent, publicUrl, requestBaseUrl, sortGames, storageSchemeForKey, validateAdminContentPatch, validateFeedbackInput, validateNewPassword, validateUploadInput, versionStorageFields, viewerUrl };
