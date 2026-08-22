const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('OAC 전환 게이트는 공개 읽기를 임시 유지하면서 CloudFront와 Lambda 권한을 분리한다', async () => {
  const terraform = await fs.readFile(path.join(__dirname, '../../infra/main.tf'), 'utf8');
  const publicPolicy = terraform.match(/resource "aws_s3_bucket_policy" "games"[\s\S]*?\n}\n/)?.[0] || '';
  const lambdaPolicy = terraform.match(/resource "aws_iam_role_policy" "s3_upload"[\s\S]*?\n}\n/)?.[0] || '';
  assert.match(publicPolicy, /\/games\/\*/);
  assert.match(publicPolicy, /\/contents\/\*/);
  assert.doesNotMatch(publicPolicy, /\/exports\/\*/);
  assert.match(publicPolicy, /AllowCloudFrontReadContent/);
  assert.match(publicPolicy, /cloudfront\.amazonaws\.com/);
  assert.match(publicPolicy, /AWS:SourceArn/);
  assert.match(lambdaPolicy, /\/games\/\*/);
  assert.match(lambdaPolicy, /\/contents\/\*/);
  assert.match(lambdaPolicy, /\/exports\/\*/);
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
