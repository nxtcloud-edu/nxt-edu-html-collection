const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('S3 공개 읽기와 Lambda 관리 권한은 games와 contents를 포함하고 exports는 비공개로 유지한다', async () => {
  const terraform = await fs.readFile(path.join(__dirname, '../../infra/main.tf'), 'utf8');
  const publicPolicy = terraform.match(/resource "aws_s3_bucket_policy" "games"[\s\S]*?\n}\n/)?.[0] || '';
  const lambdaPolicy = terraform.match(/resource "aws_iam_role_policy" "s3_upload"[\s\S]*?\n}\n/)?.[0] || '';
  assert.match(publicPolicy, /\/games\/\*/);
  assert.match(publicPolicy, /\/contents\/\*/);
  assert.doesNotMatch(publicPolicy, /\/exports\/\*/);
  assert.match(lambdaPolicy, /\/games\/\*/);
  assert.match(lambdaPolicy, /\/contents\/\*/);
  assert.match(lambdaPolicy, /\/exports\/\*/);
});
