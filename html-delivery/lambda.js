const serverless = require('serverless-http');
const { createApp } = require('./server');
const { EXPORT_ID_PATTERN } = require('./cohort-export');
const { runExportJob } = require('./export-worker');

const httpHandler = serverless(createApp(), { binary: ['image/*'] });

async function handler(event, context) {
  if (event?.type !== 'admin-export-job') return httpHandler(event, context);
  if (!EXPORT_ID_PATTERN.test(event.exportId || '')) throw new Error('유효하지 않은 내보내기 작업 이벤트입니다.');
  return runExportJob(event.exportId);
}

module.exports = { handler };
