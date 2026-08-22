const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const express = require('express');
const { filterAdminContents, toAdminContent, validateAdminV2Patch } = require('../domain/admin-content');
const { paginateAdminContents } = require('../domain/admin-query');

function createAdminRouter({
  adminAuth,
  cohortService,
  contentService,
  auditRepository,
  feedbackRepository,
  exportJobs,
  exportFiles,
  helpers,
} = {}) {
  const router = express.Router();
  const {
    auditAdminAction,
    buildCohortOverview,
    hashPassword,
    isValidContentId,
    normalizeContent,
    publicLegacyContent,
    requestBaseUrl,
    validateAdminContentPatch,
    validateNewPassword,
  } = helpers;

  const recordAudit = (req, action, targetType, targetId = null, details = {}) => auditAdminAction(action, targetId, {
    actorId: req.adminId,
    targetType,
    details,
  });

  function adminCohort(cohort) {
    return {
      cohortId: cohort.cohortId,
      name: cohort.name,
      dateLabel: cohort.date || null,
      submissionMode: cohort.submissionMode || (cohort.teams?.length ? 'team' : 'individual'),
      teamOptions: cohort.teams || [],
      status: cohort.status || 'active',
      createdAt: cohort.createdAt || null,
      updatedAt: cohort.updatedAt || null,
      editable: cohort.source === 'custom',
    };
  }

  router.post('/api/admin/login', adminAuth.login);
  router.get('/api/admin/session', adminAuth.requireAdmin, (_req, res) => res.json({ ok: true }));
  router.post('/api/admin/logout', adminAuth.requireAdmin, adminAuth.logout);
  router.post('/api/admin/change-password', adminAuth.requireAdmin, adminAuth.changePassword);
  router.post('/api/admin/admins', adminAuth.requireAdmin, adminAuth.addAdmin);

  router.get('/api/v2/admin/contents', adminAuth.requireAdmin, async (req, res, next) => {
    const pageSize = req.query.pageSize === undefined ? 50 : Number.parseInt(req.query.pageSize, 10);
    const cohortId = typeof req.query.cohortId === 'string' ? req.query.cohortId.trim() : '';
    const contentType = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return res.status(400).json({ error: 'pageSize는 1~100이어야 합니다.' });
    if (contentType && !['game', 'webpage'].includes(contentType)) return res.status(400).json({ error: 'type은 game 또는 webpage여야 합니다.' });
    if (query.length > 100) return res.status(400).json({ error: '검색어는 100자 이하여야 합니다.' });
    try {
      const [cohorts, contents] = await Promise.all([cohortService.list(), contentService.list()]);
      const cohortById = new Map(cohorts.map((cohort) => [cohort.cohortId, cohort]));
      if (cohortId && !cohortById.has(cohortId)) return res.status(400).json({ error: '등록된 코호트를 찾을 수 없습니다.' });
      const filtered = filterAdminContents(contents, { cohortId, contentType, query });
      const page = paginateAdminContents(filtered, { pageSize, cursor });
      if (page.status === 'invalid-cursor') return res.status(400).json({ error: 'cursor가 올바르지 않습니다.' });
      return res.json({
        contents: page.items.map((item) => toAdminContent(item, cohortById.get(item.cohortId), {
          appBaseUrl: requestBaseUrl(req),
          contentUrl: helpers.publicUrl,
        })),
        page: { pageSize, total: page.total, nextCursor: page.nextCursor },
      });
    } catch (error) { return next(error); }
  });

  router.get('/api/v2/admin/contents/:contentId/versions', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const result = await contentService.listVersions(req.params.contentId, { admin: true });
      return result ? res.json(result) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });

  router.patch('/api/v2/admin/contents/:contentId', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const [existing, cohorts] = await Promise.all([contentService.getPrivate(req.params.contentId), cohortService.list()]);
      if (!existing) return res.sendStatus(404);
      const result = validateAdminV2Patch(existing, req.body, cohorts);
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
      const fields = { ...result.fields, updatedAt: new Date().toISOString() };
      if (!await contentService.updateFields(existing.contentId, fields)) return res.sendStatus(404);
      const updated = await contentService.getPublic(existing.contentId);
      const cohort = cohorts.find((item) => item.cohortId === updated.cohortId);
      await recordAudit(req, 'update-content-v2', 'content', existing.contentId, { fields: Object.keys(result.fields) });
      return res.json({ content: toAdminContent(updated, cohort, { appBaseUrl: requestBaseUrl(req), contentUrl: helpers.publicUrl }) });
    } catch (error) { return next(error); }
  });

  router.get('/api/v2/admin/cohorts', adminAuth.requireAdmin, async (req, res, next) => {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    if (status && !['active', 'archived'].includes(status)) return res.status(400).json({ error: 'status는 active 또는 archived여야 합니다.' });
    try {
      const cohorts = (await cohortService.list()).map(adminCohort).filter((cohort) => !status || cohort.status === status);
      return res.json({ cohorts });
    } catch (error) { return next(error); }
  });

  router.post('/api/v2/admin/cohorts', adminAuth.requireAdmin, async (req, res, next) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const date = typeof req.body?.dateLabel === 'string' ? req.body.dateLabel.trim() : null;
    const status = req.body?.status === undefined ? 'active' : req.body.status;
    if (!name || name.length > 60) return res.status(400).json({ error: '코호트 이름은 1~60자로 입력하세요.' });
    if (date !== null && date.length > 20) return res.status(400).json({ error: '일자는 20자 이하로 입력하세요.' });
    if (!['active', 'archived'].includes(status)) return res.status(400).json({ error: 'status는 active 또는 archived여야 합니다.' });
    try {
      const result = await cohortService.add({ name, date, status });
      if (result.status === 'conflict') return res.status(409).json({ error: '이미 있는 코호트예요.' });
      const cohort = (await cohortService.list()).find((item) => item.cohortId === result.cohortId);
      await recordAudit(req, 'create-cohort-v2', 'cohort', result.cohortId);
      return res.status(201).json({ cohort: adminCohort(cohort) });
    } catch (error) { return next(error); }
  });

  router.patch('/api/v2/admin/cohorts/:cohortId', adminAuth.requireAdmin, async (req, res, next) => {
    const allowed = ['name', 'dateLabel', 'status'];
    if (!helpers.isCohortId(req.params.cohortId)) return res.sendStatus(404);
    if (!req.body || Object.keys(req.body).some((key) => !allowed.includes(key)) || !allowed.some((key) => Object.prototype.hasOwnProperty.call(req.body, key))) {
      return res.status(400).json({ error: '수정할 수 없는 항목이 포함되어 있거나 수정 항목이 없습니다.' });
    }
    const fields = {};
    if (req.body.name !== undefined) {
      fields.name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!fields.name || fields.name.length > 60) return res.status(400).json({ error: '코호트 이름은 1~60자로 입력하세요.' });
    }
    if (req.body.dateLabel !== undefined) {
      fields.date = req.body.dateLabel === null ? null : (typeof req.body.dateLabel === 'string' ? req.body.dateLabel.trim() : '');
      if (fields.date !== null && fields.date.length > 20) return res.status(400).json({ error: '일자는 20자 이하로 입력하세요.' });
    }
    if (req.body.status !== undefined) {
      if (!['active', 'archived'].includes(req.body.status)) return res.status(400).json({ error: 'status는 active 또는 archived여야 합니다.' });
      fields.status = req.body.status;
    }
    try {
      const result = await cohortService.update({ cohortId: req.params.cohortId, fields });
      if (result.status === 'not-found') return res.sendStatus(404);
      if (result.status === 'base-cohort') return res.status(400).json({ error: '기본 코호트는 수정할 수 없습니다.' });
      if (result.status === 'conflict') return res.status(409).json({ error: '이미 있는 코호트예요.' });
      const cohort = (await cohortService.list()).find((item) => item.cohortId === req.params.cohortId);
      await recordAudit(req, 'update-cohort-v2', 'cohort', req.params.cohortId, { fields: Object.keys(fields), updatedContents: result.count });
      return res.json({ cohort: adminCohort(cohort) });
    } catch (error) { return next(error); }
  });

  router.get('/api/v2/admin/audit-logs', adminAuth.requireAdmin, async (req, res, next) => {
    const limit = req.query.limit === undefined ? 50 : Number.parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'limit은 1~100이어야 합니다.' });
    try {
      const result = await auditRepository.list({
        limit,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
        action: typeof req.query.action === 'string' ? req.query.action.trim() : '',
        actorId: typeof req.query.actorId === 'string' ? req.query.actorId.trim() : '',
        targetType: typeof req.query.targetType === 'string' ? req.query.targetType.trim() : '',
        targetId: typeof req.query.targetId === 'string' ? req.query.targetId.trim() : '',
      });
      if (result.status === 'invalid-cursor') return res.status(400).json({ error: 'cursor가 올바르지 않습니다.' });
      return res.json({ auditLogs: result.items, page: { limit, nextCursor: result.nextCursor } });
    } catch (error) { return next(error); }
  });

  router.post('/api/v2/admin/exports', adminAuth.requireAdmin, async (req, res, next) => {
    const cohortId = typeof req.body?.cohortId === 'string' ? req.body.cohortId.trim() : '';
    if (!helpers.isCohortId(cohortId)) return res.sendStatus(404);
    try {
      const cohort = (await cohortService.list()).find((item) => item.cohortId === cohortId);
      if (!cohort) return res.sendStatus(404);
      const contents = (await contentService.list()).filter((content) => content.cohortId === cohortId);
      if (!contents.length) return res.status(409).json({ error: '다운로드할 콘텐츠가 없습니다.' });
      const exportId = crypto.randomBytes(16).toString('hex');
      const job = await exportJobs.create({
        exportId,
        cohort: cohort.name,
        cohortId,
        contentIds: contents.map((content) => content.contentId),
        requestedAt: new Date().toISOString(),
        requestedBy: req.adminId,
        appBaseUrl: requestBaseUrl(req),
      });
      try { await exportJobs.dispatch(exportId); }
      catch (error) {
        await exportJobs.fail(exportId, { failedAt: new Date().toISOString(), errorCode: 'DISPATCH_FAILED' });
        throw error;
      }
      await recordAudit(req, 'export-cohort-v2', 'export', exportId, { cohortId, count: contents.length });
      return res.status(202).json({ export: exportJobs.public(job) });
    } catch (error) { return next(error); }
  });
  router.post('/api/admin/reset-password', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId)) return res.sendStatus(404);
    if (!validateNewPassword(req.body?.newPassword)) return res.status(400).json({ error: '비밀번호는 4~30자로 입력하세요.' });
    const credentials = { ...hashPassword(req.body.newPassword), updatedAt: new Date().toISOString() };
    try {
      if (!await contentService.updatePassword(req.body.contentId, credentials)) return res.sendStatus(404);
      await recordAudit(req, 'reset-password', 'content', req.body.contentId);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  router.patch('/api/admin/content/:contentId', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      const existing = await contentService.getPrivate(req.params.contentId);
      if (!existing) return res.sendStatus(404);
      const result = validateAdminContentPatch(existing, req.body || {}, (await cohortService.list()).map((cohort) => cohort.name));
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
      const fields = { ...result.fields, updatedAt: new Date().toISOString() };
      if (!await contentService.updateFields(req.params.contentId, fields)) return res.sendStatus(404);
      const content = await contentService.getPublic(req.params.contentId);
      await recordAudit(req, 'update-content', 'content', req.params.contentId, { fields: Object.keys(result.fields) });
      return res.json({ content: publicLegacyContent(normalizeContent(content)) });
    } catch (error) { return next(error); }
  });
  router.delete('/api/admin/content/:contentId', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      if (!await contentService.deleteContent(req.params.contentId)) return res.sendStatus(404);
      await recordAudit(req, 'delete-content', 'content', req.params.contentId);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  router.delete('/api/admin/feedback', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId) || typeof req.body?.createdAt !== 'string') return res.sendStatus(404);
    try {
      if (!await feedbackRepository.deleteEntry(req.body.contentId, req.body.createdAt)) return res.sendStatus(404);
      await recordAudit(req, 'delete-feedback', 'feedback', `${req.body.contentId}#${req.body.createdAt}`, { contentId: req.body.contentId });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  router.get('/api/cohorts', async (_req, res, next) => {
    try { return res.json({ cohorts: await cohortService.list() }); }
    catch (error) { return next(error); }
  });
  router.get('/api/admin/cohort-overview', adminAuth.requireAdmin, async (req, res, next) => {
    const requestedCohort = typeof req.query.cohort === 'string' ? req.query.cohort.trim() : '';
    try {
      const cohorts = await cohortService.list();
      const cohort = requestedCohort ? cohorts.find((item) => item.name === requestedCohort) : null;
      if (requestedCohort && !cohort) return res.sendStatus(404);
      const contents = (await contentService.list()).filter((content) => !cohort || content.affiliation === cohort.name);
      return res.json({ overview: buildCohortOverview({ cohort, contents, appBaseUrl: requestBaseUrl(req) }) });
    } catch (error) { return next(error); }
  });
  router.post('/api/admin/cohorts', adminAuth.requireAdmin, async (req, res, next) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const date = typeof req.body?.date === 'string' ? req.body.date.trim() : null;
    if (!name || name.length > 60) return res.status(400).json({ error: '코호트 이름은 1~60자로 입력하세요.' });
    if (date !== null && date.length > 20) return res.status(400).json({ error: '일자는 20자 이하로 입력하세요.' });
    try {
      const result = await cohortService.add({ name, date });
      if (result.status === 'conflict') return res.status(409).json({ error: '이미 있는 코호트예요.' });
      await recordAudit(req, 'add-cohort', 'cohort', result.cohortId, { name });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  router.patch('/api/admin/cohorts', adminAuth.requireAdmin, async (req, res, next) => {
    const oldName = typeof req.body?.oldName === 'string' ? req.body.oldName.trim() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 60) return res.status(400).json({ error: '코호트 이름은 1~60자로 입력하세요.' });
    try {
      const result = await cohortService.rename({ oldName, name });
      if (result.status === 'not-found') return res.sendStatus(404);
      if (result.status === 'base-cohort') return res.status(400).json({ error: '기본 코호트는 이름을 변경할 수 없습니다.' });
      if (result.status === 'conflict') return res.status(409).json({ error: '이미 있는 코호트예요.' });
      await recordAudit(req, 'rename-cohort', 'cohort', null, { oldName, name, updatedContents: result.count });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  router.get('/api/admin/exports', adminAuth.requireAdmin, async (req, res, next) => {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
    try {
      const jobs = await exportJobs.list(limit);
      return res.json({ exports: await Promise.all(jobs.map(exportFiles.response)) });
    } catch (error) { return next(error); }
  });
  router.post('/api/admin/exports', adminAuth.requireAdmin, async (req, res, next) => {
    const cohort = typeof req.body?.cohort === 'string' ? req.body.cohort.trim() : '';
    try {
      if (!(await cohortService.list()).some((item) => item.name === cohort)) return res.sendStatus(404);
      const contents = (await contentService.list()).filter((content) => content.affiliation === cohort);
      if (!contents.length) return res.status(409).json({ error: '다운로드할 콘텐츠가 없습니다.' });
      const exportId = crypto.randomBytes(16).toString('hex');
      const job = await exportJobs.create({
        exportId,
        cohort,
        contentIds: contents.map((content) => content.contentId),
        requestedAt: new Date().toISOString(),
        requestedBy: req.adminId,
        appBaseUrl: requestBaseUrl(req),
      });
      try { await exportJobs.dispatch(exportId); }
      catch (error) {
        await exportJobs.fail(exportId, { failedAt: new Date().toISOString(), errorCode: 'DISPATCH_FAILED' });
        throw error;
      }
      await recordAudit(req, 'export-cohort', 'export', exportId, { cohort, count: contents.length });
      return res.status(202).json({ export: exportJobs.public(job) });
    } catch (error) { return next(error); }
  });
  router.get('/api/admin/exports/:exportId', adminAuth.requireAdmin, async (req, res, next) => {
    if (!exportJobs.idPattern.test(req.params.exportId)) return res.sendStatus(404);
    try {
      const job = await exportJobs.get(req.params.exportId);
      return job ? res.json({ export: await exportFiles.response(job) }) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });
  router.post('/api/admin/exports/:exportId/retry', adminAuth.requireAdmin, async (req, res, next) => {
    if (!exportJobs.idPattern.test(req.params.exportId)) return res.sendStatus(404);
    try {
      if (!await exportJobs.get(req.params.exportId)) return res.sendStatus(404);
      if (!await exportJobs.requeue(req.params.exportId, new Date().toISOString())) return res.status(409).json({ error: '실패한 작업만 재시도할 수 있습니다.' });
      try { await exportJobs.dispatch(req.params.exportId); }
      catch (error) {
        await exportJobs.fail(req.params.exportId, { failedAt: new Date().toISOString(), errorCode: 'DISPATCH_FAILED' });
        throw error;
      }
      await recordAudit(req, 'retry-export', 'export', req.params.exportId);
      return res.status(202).json({ export: exportJobs.public(await exportJobs.get(req.params.exportId)) });
    } catch (error) { return next(error); }
  });
  router.get('/api/admin/exports/:exportId/download', adminAuth.requireAdmin, async (req, res, next) => {
    if (process.env.S3_BUCKET) return res.sendStatus(404);
    const filePath = exportFiles.localPath(req.params.exportId);
    if (!filePath) return res.sendStatus(404);
    try {
      const job = await exportJobs.get(req.params.exportId);
      if (!job) return res.sendStatus(404);
      if (job.status !== 'completed') return res.status(409).json({ error: '아직 완료되지 않은 내보내기입니다.' });
      await fs.access(filePath);
      res.set('Content-Disposition', exportFiles.contentDisposition(job.fileName));
      return res.sendFile(filePath, { dotfiles: 'allow' });
    } catch (error) {
      if (error.code === 'ENOENT') return res.sendStatus(404);
      return next(error);
    }
  });

  return router;
}

module.exports = { createAdminRouter };
