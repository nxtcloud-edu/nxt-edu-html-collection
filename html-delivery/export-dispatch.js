const { InvokeCommand, LambdaClient } = require('@aws-sdk/client-lambda');
const { runExportJob } = require('./export-worker');

async function dispatchExportJob(exportId) {
  if (!process.env.S3_BUCKET) {
    setImmediate(() => runExportJob(exportId).catch(() => {}));
    return;
  }
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!functionName) throw new Error('Lambda function name is unavailable');
  const client = new LambdaClient({ region: process.env.S3_REGION || 'ap-northeast-2' });
  await client.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({ type: 'admin-export-job', exportId })),
  }));
}

module.exports = { dispatchExportJob };
