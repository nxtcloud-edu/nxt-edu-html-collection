const { createCohortExport } = require('./cohort-export');
const { claimExportJob, completeExportJob, failExportJob, getExportJob } = require('./export-jobs');
const { listContents } = require('./registry');

async function runExportJob(exportId) {
  const startedAt = new Date().toISOString();
  if (!await claimExportJob(exportId, startedAt)) return { skipped: true };
  const job = await getExportJob(exportId);
  try {
    const requestedIds = new Set(job.contentIds || []);
    const contents = (await listContents()).filter((content) => requestedIds.has(content.contentId));
    if (contents.length !== requestedIds.size) throw new Error('export content snapshot mismatch');
    const result = await createCohortExport({ exportId, cohort: job.cohort, contents, appBaseUrl: job.appBaseUrl });
    const completedAt = new Date();
    await completeExportJob(exportId, {
      completedAt: completedAt.toISOString(),
      archiveExpiresAt: new Date(completedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      fileName: result.fileName,
      count: result.count,
      storageKey: result.storageKey,
    });
    console.log(JSON.stringify({ export_job_status: 'completed', exportId, count: result.count }));
    return { completed: true };
  } catch (error) {
    await failExportJob(exportId, { failedAt: new Date().toISOString(), errorCode: 'EXPORT_GENERATION_FAILED' });
    console.error(JSON.stringify({ export_job_status: 'failed', exportId, errorCode: 'EXPORT_GENERATION_FAILED' }));
    throw error;
  }
}

module.exports = { runExportJob };
