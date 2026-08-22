const express = require('express');
const path = require('node:path');
const { paginatePublicContents } = require('../domain/public-query');

function createPublicRouter({
  categories,
  cohortOptions,
  contentService,
  feedbackRepository,
  upload,
  publicDeployDirectory,
  rateLimits,
  helpers,
} = {}) {
  const router = express.Router();
  const {
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
  } = helpers;

  router.get('/api/categories', (_req, res) => res.json({ categories }));
  router.get('/api/v2/cohorts', async (_req, res, next) => {
    try {
      const [cohorts, contents] = await Promise.all([cohortOptions(), contentService.list()]);
      const counts = new Map();
      contents.forEach((content) => {
        const current = counts.get(content.cohortId) || { contentCount: 0, gameCount: 0, webpageCount: 0 };
        current.contentCount += 1;
        if (contentTypeFromCategory(content.category) === 'game') current.gameCount += 1;
        else current.webpageCount += 1;
        counts.set(content.cohortId, current);
      });
      return res.json({ cohorts: cohorts.map((cohort) => ({
        ...toV2Cohort(cohort),
        ...(counts.get(cohort.cohortId) || { contentCount: 0, gameCount: 0, webpageCount: 0 }),
      })) });
    }
    catch (error) { return next(error); }
  });
  router.get('/api/v2/contents', async (req, res, next) => {
    const requestedType = typeof req.query.type === 'string' ? req.query.type : '';
    const requestedCohortId = typeof req.query.cohortId === 'string' ? req.query.cohortId : '';
    const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 60) : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'latest';
    const requestedPageSize = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : null;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    if (requestedType && !categoryFromContentType(requestedType)) return res.status(400).json({ error: '지원하지 않는 콘텐츠 유형입니다.' });
    if (!['latest', 'likes'].includes(sort)) return res.status(400).json({ error: '지원하지 않는 정렬 방식입니다.' });
    if (requestedPageSize !== null && (!Number.isInteger(requestedPageSize) || requestedPageSize < 1 || requestedPageSize > 48)) return res.status(400).json({ error: '페이지 크기는 1~48이어야 합니다.' });
    try {
      const cohorts = await cohortOptions();
      const cohortById = new Map(cohorts.map((cohort) => [cohort.cohortId, cohort]));
      if (requestedCohortId && !cohortById.has(requestedCohortId)) return res.status(400).json({ error: '등록된 코호트를 찾을 수 없습니다.' });
      const normalizedQuery = query.toLocaleLowerCase('ko-KR');
      const contents = (await contentService.list())
        .filter((content) => !requestedCohortId || content.cohortId === requestedCohortId)
        .filter((content) => !requestedType || contentTypeFromCategory(content.category) === requestedType)
        .filter((content) => !normalizedQuery || [contentTitle(content), content.name, content.affiliation]
          .some((value) => String(value || '').toLocaleLowerCase('ko-KR').includes(normalizedQuery)))
        .map((content) => toPublicV2Content(content, cohortById.get(content.cohortId), req));
      const sorted = sortV2Contents(contents, sort);
      if (requestedPageSize === null && !cursor && !query) return res.json({ contents: sorted });
      const page = paginatePublicContents(sorted, { sort, cohortId: requestedCohortId, type: requestedType, query }, { pageSize: requestedPageSize || 10, cursor });
      if (page.status !== 'ok') return res.status(400).json({ error: '페이지 커서가 유효하지 않습니다.' });
      return res.json({ contents: page.items, total: page.total, nextCursor: page.nextCursor });
    } catch (error) { return next(error); }
  });
  router.get('/api/v2/contents/:contentId', async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const [content, cohorts] = await Promise.all([contentService.getPublic(req.params.contentId), cohortOptions()]);
      if (!content) return res.sendStatus(404);
      const cohort = cohorts.find((item) => item.cohortId === content.cohortId);
      return res.json({ content: toPublicV2Content(content, cohort, req) });
    } catch (error) { return next(error); }
  });
  router.get('/api/v2/contents/:contentId/versions', async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const result = await contentService.listVersions(req.params.contentId);
      return result ? res.json({ versions: result.versions }) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });
  router.post('/api/v2/contents', upload.single('file'), async (req, res, next) => {
    try {
      const cohorts = await cohortOptions();
      const result = validateV2CreateInput(req.body, req.file, cohorts);
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: [...new Set(result.errors)] });
      const item = await contentService.create({
        cohort: result.selectedCohort,
        ownerName: result.name,
        title: result.title,
        category: result.category,
        password: req.body.password,
        file: req.file,
      });
      return res.status(201).json({ content: toPublicV2Content(item, result.selectedCohort, req) });
    } catch (error) { return next(error); }
  });
  router.post('/api/v2/contents/:contentId/versions', upload.single('file'), async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const [existing, cohorts] = await Promise.all([contentService.getPrivate(req.params.contentId), cohortOptions()]);
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
      const versioned = await contentService.addVersion({ contentId: existing.contentId, password: req.body.password, title: result.title, file: req.file });
      if (versioned.status === 'forbidden') return res.status(403).json({ error: '소유 비밀번호가 맞지 않아요.' });
      const cohort = cohorts.find((item) => item.cohortId === existing.cohortId);
      return res.status(201).json({ content: toPublicV2Content(versioned.content, cohort, req) });
    } catch (error) { return next(error); }
  });
  router.get('/api/games', async (req, res, next) => {
    try {
      const sort = req.query.sort === 'likes' ? 'likes' : 'latest';
      const games = filterGames((await contentService.list()).map((content) => ({ ...content, category: normalizeCategory(content.category) })), { cohort: req.query.cohort, category: req.query.category });
      return res.json({ games: sortGames(games, sort).map(publicLegacyContent) });
    } catch (error) { return next(error); }
  });
  router.get('/api/content', async (req, res, next) => {
    if (!isValidContentId(req.query.id)) return res.sendStatus(404);
    try {
      const registered = await contentService.getPublic(req.query.id);
      const content = registered ? { ...registered, category: normalizeCategory(registered.category) } : null;
      return content ? res.json({ content: publicLegacyContent(content) }) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });
  router.get('/api/feedback', async (req, res, next) => {
    if (!isValidContentId(req.query.id)) return res.sendStatus(404);
    try { return res.json({ feedback: await feedbackRepository.list(req.query.id) }); }
    catch (error) { return next(error); }
  });
  router.post('/api/feedback', async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId)) return res.sendStatus(404);
    const result = validateFeedbackInput(req.body || {});
    if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
    if (!rateLimits.feedbackByIp.consume(clientIp(req))) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요.' });
    const entry = { contentKey: req.body.contentId, createdAt: new Date().toISOString(), nickname: result.nickname, message: result.message };
    try { await feedbackRepository.save(entry); return res.status(201).json({ feedback: entry }); }
    catch (error) { return next(error); }
  });
  router.get('/deployed/*splat', async (req, res, next) => {
    try {
      const key = Array.isArray(req.params.splat) ? req.params.splat.join('/') : req.params.splat;
      if (!isValidContentKey(key)) return res.sendStatus(404);
      return res.sendFile(path.join(publicDeployDirectory, key));
    } catch (error) { return next(error); }
  });
  router.post('/api/upload', upload.single('file'), async (req, res, next) => {
    try {
      const cohorts = await cohortOptions();
      const result = validateUploadInput({ ...req.body, file: req.file }, cohorts.map((cohort) => cohort.name));
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
      const selectedCohort = cohorts.find((cohort) => cohort.name === result.affiliation);
      const uploaded = await contentService.upsertLegacy({ cohort: selectedCohort, identity: result, password: req.body.password, file: req.file, normalizeCategory });
      if (uploaded.status === 'forbidden') return res.status(403).json({ error: '이미 등록된 이름입니다. 비밀번호가 맞지 않아요.' });
      return res.status(201).json({
        url: viewerUrl(req, uploaded.content.contentId),
        directUrl: publicUrl(uploaded.key),
        contentId: uploaded.content.contentId,
        title: result.title,
        version: uploaded.version,
        uploadedAt: uploaded.uploadedAt,
      });
    } catch (error) { return next(error); }
  });
  router.post('/api/like', async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId)) return res.sendStatus(404);
    const ip = clientIp(req);
    if (!rateLimits.likeByIp.consume(ip) || !rateLimits.likeByContent.consume(`${ip}:${req.body.contentId}`)) {
      return res.status(429).json({ error: '잠시 후 다시 시도해 주세요.' });
    }
    try {
      const likes = await contentService.incrementLikes(req.body.contentId);
      return likes === null ? res.sendStatus(404) : res.json({ likes });
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createPublicRouter };
