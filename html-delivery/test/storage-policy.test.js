const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('S3 콘텐츠는 CloudFront OAC만 읽고 exports는 계속 공개하지 않는다', async () => {
  const terraform = await fs.readFile(path.join(__dirname, '../../infra/main.tf'), 'utf8');
  const publicPolicy = terraform.match(/resource "aws_s3_bucket_policy" "games"[\s\S]*?\n}\n/)?.[0] || '';
  const lambdaPolicy = terraform.match(/resource "aws_iam_role_policy" "s3_upload"[\s\S]*?\n}\n/)?.[0] || '';
  assert.match(publicPolicy, /\/games\/\*/);
  assert.match(publicPolicy, /\/contents\/\*/);
  assert.doesNotMatch(publicPolicy, /\/exports\/\*/);
  assert.doesNotMatch(publicPolicy, /PublicReadGetObject/);
  assert.doesNotMatch(publicPolicy, /Principal\s*= "\*"/);
  assert.match(publicPolicy, /AllowCloudFrontReadContent/);
  assert.match(publicPolicy, /cloudfront\.amazonaws\.com/);
  assert.match(publicPolicy, /AWS:SourceArn/);
  assert.match(lambdaPolicy, /\/games\/\*/);
  assert.match(lambdaPolicy, /\/contents\/\*/);
  assert.match(lambdaPolicy, /\/exports\/\*/);
});

test('S3 Public Access Block은 네 가지 공개 경로를 모두 차단한다', async () => {
  const terraform = await fs.readFile(path.join(__dirname, '../../infra/main.tf'), 'utf8');
  const accessBlock = terraform.match(/resource "aws_s3_bucket_public_access_block" "games"[\s\S]*?\n}\n/)?.[0] || '';
  assert.match(accessBlock, /block_public_acls\s*= true/);
  assert.match(accessBlock, /ignore_public_acls\s*= true/);
  assert.match(accessBlock, /block_public_policy\s*= true/);
  assert.match(accessBlock, /restrict_public_buckets\s*= true/);
  assert.match(accessBlock, /depends_on = \[aws_s3_bucket_policy\.games\]/);
});

test('CloudFront는 contents와 games를 OAC S3 origin으로 전달한다', async () => {
  const terraform = await fs.readFile(path.join(__dirname, '../../infra/main.tf'), 'utf8');
  assert.match(terraform, /resource "aws_cloudfront_origin_access_control" "content"/);
  assert.match(terraform, /signing_behavior\s*= "always"/);
  assert.match(terraform, /origin_id\s*= "s3-content"/);
  assert.match(terraform, /path_pattern\s*= "\/contents\/\*"[\s\S]*?target_origin_id\s*= "s3-content"/);
  assert.match(terraform, /path_pattern\s*= "\/games\/\*"[\s\S]*?target_origin_id\s*= "s3-content"/);
  assert.match(terraform, /BASE_URL\s*= "https:\/\/showcase\.nxtcloud\.kr"/);
});

test('비동기 내보내기는 작업 TTL, Lambda 자체 호출, 무재시도, 오류 경보를 구성한다', async () => {
  const terraform = await fs.readFile(path.join(__dirname, '../../infra/main.tf'), 'utf8');
  assert.match(terraform, /ttl \{\s*attribute_name = "expiresAt"\s*enabled\s*= true/);
  assert.match(terraform, /resource "aws_iam_role_policy" "lambda_self_invoke"/);
  assert.match(terraform, /Action\s*= "lambda:InvokeFunction"/);
  assert.match(terraform, /resource "aws_lambda_function_event_invoke_config" "export_worker"/);
  assert.match(terraform, /maximum_retry_attempts\s*= 0/);
  assert.match(terraform, /resource "aws_cloudwatch_metric_alarm" "export_failures"/);
  assert.match(terraform, /metric_name\s*= "Errors"/);
});
