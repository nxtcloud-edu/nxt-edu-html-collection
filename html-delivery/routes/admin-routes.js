const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const express = require('express');

function createAdminRouter({
  adminAuth,
  cohortService,
  contentService,
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

  router.post('/api/admin/login', adminAuth.login);
  router.get('/api/admin/session', adminAuth.requireAdmin, (_req, res) => res.json({ ok: true }));
  router.post('/api/admin/logout', adminAuth.requireAdmin, adminAuth.logout);
  router.post('/api/admin/change-password', adminAuth.requireAdmin, adminAuth.changePassword);
  router.post('/api/admin/admins', adminAuth.requireAdmin, adminAuth.addAdmin);
  router.post('/api/admin/reset-password', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId)) return res.sendStatus(404);
    if (!validateNewPassword(req.body?.newPassword)) return res.status(400).json({ error: '비밀번호는 4~30자로 입력하세요.' });
    const credentials = { ...hashPassword(req.body.newPassword), updatedAt: new Date().toISOString() };
    try {
      if (!await contentService.updatePassword(req.body.contentId, credentials)) return res.sendStatus(404);
      auditAdminAction('reset-password', req.body.contentId);
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
      auditAdminAction('update-content', req.params.contentId);
      return res.json({ content: publicLegacyContent(normalizeContent(content)) });
    } catch (error) { return next(error); }
  });
  router.delete('/api/admin/content/:contentId', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.params.contentId)) return res.sendStatus(404);
    try {
      if (!await contentService.deleteContent(req.params.contentId)) return res.sendStatus(404);
      auditAdminAction('delete-content', req.params.contentId);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  router.delete('/api/admin/feedback', adminAuth.requireAdmin, async (req, res, next) => {
    if (!isValidContentId(req.body?.contentId) || typeof req.body?.createdAt !== 'string') return res.sendStatus(404);
    try {
      if (!await feedbackRepository.deleteEntry(req.body.contentId, req.body.createdAt)) return res.sendStatus(404);
      auditAdminAction('delete-feedback', req.body.contentId);
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
      auditAdminAction('add-cohort', null);
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
      auditAdminAction('rename-cohort', null);
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
      auditAdminAction('export-cohort', exportId);
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
      auditAdminAction('retry-export', req.params.exportId);
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
