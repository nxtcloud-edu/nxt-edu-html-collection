const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { verifyPassword } = require('../registry');

function runtimeSecret() { return crypto.randomBytes(8).toString('base64url'); }

test('관리자 HTML은 noindex이며 갤러리에서 링크를 노출하지 않는다', async () => {
  const admin = await readFile(path.join(__dirname, '../public/admin.html'), 'utf8');
  const index = await readFile(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(admin, /<meta name="robots" content="noindex,nofollow">/);
  assert.equal(index.includes('admin.html'), false);
});

test('관리자 HTML 스크립트는 렌더링에 innerHTML을 쓰지 않고 수정 저장은 submit 버튼이다', async () => {
  const admin = await readFile(path.join(__dirname, '../public/admin.html'), 'utf8');
  assert.equal(admin.includes('innerHTML'), false);
  assert.match(admin, /textContent/);
  assert.match(admin, /button\('수정 저장','primary','submit'\)/);
});

test('관리자 표와 편집 패널은 일반 창 폭에서 줄바꿈과 오버플로를 제어한다', async () => {
  const admin = await readFile(path.join(__dirname, '../public/admin.html'), 'utf8');
  assert.match(admin, /th\{white-space:nowrap\}/);
  assert.match(admin, /td\{word-break:keep-all\}/);
  assert.match(admin, /\.row-actions\{flex-wrap:nowrap\}/);
  assert.match(admin, /\.actions-cell\{white-space:nowrap;min-width:210px\}/);
  assert.match(admin, /table\{width:100%;border-collapse:collapse\}/);
  assert.equal(admin.includes('min-width:940px'), false);
  assert.match(admin, /repeat\(auto-fit,minmax\(180px,1fr\)\)/);
  assert.match(admin, /\.edit-form \.admin-button\.primary\{justify-self:end;width:auto\}/);
});

test('관리자 비밀번호 해시 스크립트는 stdin 비밀번호를 해시와 salt로 변환한다', () => {
  const password = runtimeSecret();
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/hash-admin-password.js')], {
    input: password,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const values = Object.fromEntries(result.stdout.trim().split('\n').map((line) => line.split('=')));
  assert.match(values.ADMIN_PASSWORD_HASH, /^[0-9a-f]{64}$/);
  assert.match(values.ADMIN_PASSWORD_SALT, /^[0-9a-f]{32}$/);
  assert.match(values.SESSION_SECRET, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(verifyPassword(password, values.ADMIN_PASSWORD_HASH, values.ADMIN_PASSWORD_SALT), true);
});
