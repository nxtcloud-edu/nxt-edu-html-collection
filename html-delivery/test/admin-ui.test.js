const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { verifyPassword } = require('../registry');

function runtimeSecret() { return crypto.randomBytes(8).toString('base64url'); }

test('관리자 HTML은 noindex이고 공개 페이지 푸터에서만 관리자 링크를 노출한다', async () => {
  const admin = await readFile(path.join(__dirname, '../public/admin.html'), 'utf8');
  const publicPages = await Promise.all(['index.html', 'cohort.html', 'upload.html', 'view.html'].map((file) => readFile(path.join(__dirname, '../public', file), 'utf8')));
  const footer = '<footer class="site-footer"><span>© NXT Cloud · AI 리터러시 콘텐츠 갤러리</span><a class="admin-link" href="/admin.html">관리자</a></footer>';
  assert.match(admin, /<meta name="robots" content="noindex,nofollow">/);
  assert.equal(admin.includes('site-footer'), false);
  publicPages.forEach((html) => assert.equal(html.includes(footer), true));
});

test('관리자 HTML 스크립트는 렌더링에 innerHTML을 쓰지 않고 수정 저장은 submit 버튼이다', async () => {
  const admin = await readFile(path.join(__dirname, '../public/admin.html'), 'utf8');
  assert.equal(admin.includes('innerHTML'), false);
  assert.match(admin, /textContent/);
  assert.match(admin, /button\('수정 저장','primary','submit'\)/);
  assert.match(admin, /<dialog id="passwordModal"/);
  assert.match(admin, /id="openPasswordButton"/);
  assert.match(admin, /<dialog id="adminModal"/);
  assert.match(admin, /id="openAdminButton"/);
  assert.match(admin, /id="newAdminId"[^>]*maxlength="30"/);
  assert.match(admin, /id="newAdminInitPassword"[^>]*type="password"[^>]*minlength="8"[^>]*maxlength="72"/);
  assert.match(admin, /openAdminButton\.addEventListener\('click',[\s\S]*adminModal\.showModal\(\)/);
  assert.match(admin, /\/api\/admin\/admins/);
  assert.match(admin, /openAdminButton\.hidden=false/);
  assert.match(admin, /openAdminButton\.hidden=true/);
  assert.match(admin, /<dialog id="cohortModal"/);
  assert.match(admin, /id="openCohortButton"/);
  assert.match(admin, /id="cohortName"[^>]*maxlength="60"/);
  assert.match(admin, /id="cohortDate"[^>]*maxlength="20"/);
  assert.match(admin, /openCohortButton\.addEventListener\('click',[\s\S]*cohortModal\.showModal\(\)/);
  assert.match(admin, /\/api\/admin\/cohorts/);
  assert.match(admin, /<dialog id="passwordModal"[\s\S]*id="passwordChangeForm"/);
  assert.match(admin, /openPasswordButton\.addEventListener\('click',[\s\S]*passwordModal\.showModal\(\)/);
  assert.match(admin, /openPasswordButton\.hidden=false/);
  assert.match(admin, /openPasswordButton\.hidden=true/);
  assert.match(admin, /passwordModal\.close\(\)/);
  assert.match(admin, /id="passwordChangeForm"/);
  assert.match(admin, /id="currentAdminPassword"[^>]*type="password"/);
  assert.match(admin, /id="newAdminPassword"[^>]*type="password"[^>]*minlength="8"[^>]*maxlength="72"/);
  assert.match(admin, /id="confirmAdminPassword"[^>]*type="password"[^>]*minlength="8"[^>]*maxlength="72"/);
  assert.match(admin, /비밀번호 변경<\/button>/);
  assert.match(admin, /\/api\/admin\/change-password/);
});

test('관리자 표와 편집 패널은 일반 창 폭에서 줄바꿈과 오버플로를 제어한다', async () => {
  const admin = await readFile(path.join(__dirname, '../public/admin.html'), 'utf8');
  assert.match(admin, /th\{white-space:nowrap\}/);
  assert.match(admin, /td\{word-break:keep-all\}/);
  assert.match(admin, /\.table-wrap\{overflow-x:auto/);
  assert.equal(admin.includes('overflow-x:visible'), false);
  assert.match(admin, /\.button-row,\.toolbar,\.row-actions\{display:flex;align-items:center;flex-wrap:wrap;gap:var\(--sp-2\)\}/);
  assert.match(admin, /\.actions-cell\{white-space:normal;min-width:180px\}/);
  assert.match(admin, /table\{width:100%;border-collapse:collapse\}/);
  assert.equal(admin.includes('min-width:940px'), false);
  assert.match(admin, /repeat\(auto-fit,minmax\(180px,1fr\)\)/);
  assert.match(admin, /\.edit-form \.admin-button\.primary\{justify-self:end;width:auto\}/);
});

test('콘텐츠 보기 페이지는 비밀번호 확인 후 새 파일을 /api/upload로 업데이트하는 버튼을 제공한다', async () => {
  const view = await readFile(path.join(__dirname, '../public/view.html'), 'utf8');
  assert.match(view, /<button id="updateButton" type="button" hidden>파일 업데이트<\/button>/);
  assert.match(view, /<input id="updatePassword" name="password" type="password"[^>]*required>/);
  assert.match(view, /<input id="updateFile" name="file" type="file" accept="\.html,text\/html" required>/);
  assert.match(view, /currentGame=game;updateButton\.hidden=false/);
  assert.match(view, /updateButton\.addEventListener\('click',\(\)=>\{updatePanel\.hidden=false;updateButton\.hidden=true/);
  assert.match(view, /formData\.set\('affiliation',currentGame\.affiliation\)/);
  assert.match(view, /formData\.set\('password',updateForm\.password\.value\)/);
  assert.match(view, /fetch\('\/api\/upload',\{method:'POST',body:formData\}\)/);
  assert.equal(view.includes('innerHTML'), false);
});

test('업로드 페이지와 코호트 페이지는 코호트 전달 및 성공 이동 계약을 유지한다', async () => {
  const [upload, cohort] = await Promise.all(['upload.html', 'cohort.html'].map((file) => readFile(path.join(__dirname, '../public', file), 'utf8')));
  assert.match(upload, /new URLSearchParams\(location\.search\)\.get\('c'\)/);
  assert.match(upload, /affiliation\.value = requestedCohort/);
  assert.match(upload, /updateNameField\(\)/);
  assert.match(upload, /if \(!data\.url\) throw new Error/);
  assert.match(upload, /window\.location\.assign\(data\.url\)/);
  assert.equal(upload.includes('URL 복사'), false);
  assert.match(cohort, /<a class="upload-link" id="uploadLink" href="upload\.html">내 콘텐츠 업로드<\/a>/);
  assert.match(cohort, /uploadLink\.href='upload\.html\?c='\+encodeURIComponent\(cohort\)/);
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
