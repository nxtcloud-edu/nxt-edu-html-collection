const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { COHORT_ID_PATTERN, deriveLegacyCohortId } = require('../domain/cohort');
const { cohortOptions, createApp } = require('../server');
const { LOCAL_EXPORT_DIR } = require('../cohort-export');
const { LOCAL_EXPORT_JOBS } = require('../export-jobs');
const { LOCAL_AUDIT_LOG } = require('../repositories/audit-repository');
const { LOCAL_VERSIONS } = require('../repositories/version-repository');
const { LOCAL_ADMIN_ACCOUNTS, LOCAL_ADMIN_CREDENTIAL, LOCAL_COHORTS, LOCAL_REGISTRY, addAdminAccount, addCustomCohort, getAdminAccounts, getCustomCohorts, getRegistryItem, hashPassword, renameCustomCohort, saveRegistryItem, updateAdminAccountPassword, verifyPassword } = require('../registry');

const LOCAL_DEPLOY_DIR = path.join(__dirname, '../.local-deploy');
const LOCAL_FEEDBACK_LOG = path.join(__dirname, '../.local-feedback.jsonl');

function runtimeSecret() { return crypto.randomBytes(18).toString('base64url'); }

async function cleanLocalState() {
  await fs.rm(LOCAL_REGISTRY, { force: true });
  await fs.rm(LOCAL_ADMIN_CREDENTIAL, { force: true });
  await fs.rm(LOCAL_ADMIN_ACCOUNTS, { force: true });
  await fs.rm(LOCAL_COHORTS, { force: true });
  await fs.rm(LOCAL_FEEDBACK_LOG, { force: true });
  await fs.rm(LOCAL_AUDIT_LOG, { force: true });
  await fs.rm(LOCAL_VERSIONS, { force: true });
  await fs.rm(LOCAL_DEPLOY_DIR, { recursive: true, force: true });
  await fs.rm(LOCAL_EXPORT_DIR, { recursive: true, force: true });
  await fs.rm(LOCAL_EXPORT_JOBS, { force: true });
}

function withAdminEnv() {
  const previous = {
    ADMIN_ID: process.env.ADMIN_ID,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_PASSWORD_SALT: process.env.ADMIN_PASSWORD_SALT,
    SESSION_SECRET: process.env.SESSION_SECRET,
    S3_BUCKET: process.env.S3_BUCKET,
    FEEDBACK_TABLE: process.env.FEEDBACK_TABLE,
  };
  const id = `admin${crypto.randomBytes(8).toString('hex')}`;
  const secret = runtimeSecret();
  const hashed = hashPassword(secret);
  process.env.ADMIN_ID = id;
  process.env.ADMIN_PASSWORD_HASH = hashed.passwordHash;
  process.env.ADMIN_PASSWORD_SALT = hashed.salt;
  process.env.SESSION_SECRET = runtimeSecret();
  delete process.env.S3_BUCKET;
  delete process.env.FEEDBACK_TABLE;
  return {
    id,
    secret,
    restore() {
      Object.entries(previous).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    },
  };
}

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function login(baseUrl, id, secret) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, password: secret }),
  });
  return { response, cookie: response.headers.get('set-cookie') };
}

function htmlBlob() {
  return new Blob([`<!doctype html><title>${runtimeSecret()}</title>`], { type: 'text/html' });
}

async function uploadContent(baseUrl, { affiliation = '2026-고대세종-ai', category = '미니게임', name = runtimeSecret().slice(0, 12), title = runtimeSecret().slice(0, 12), secret }) {
  const form = new FormData();
  form.set('affiliation', affiliation);
  form.set('category', category);
  form.set('name', name);
  form.set('title', title);
  form.set('password', secret);
  form.set('file', htmlBlob(), 'content.html');
  const response = await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: form });
  return { response, body: await response.json(), identity: { affiliation, category, name, title } };
}

async function waitForExport(baseUrl, exportId, cookie) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/admin/exports/${exportId}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const job = (await response.json()).export;
    if (job.status === 'completed' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('내보내기 작업이 제한 시간 안에 끝나지 않았습니다.');
}

test('관리자 env가 없으면 admin API가 503을 반환한다', async () => {
  await cleanLocalState();
  const previous = { ADMIN_ID: process.env.ADMIN_ID, ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH, ADMIN_PASSWORD_SALT: process.env.ADMIN_PASSWORD_SALT, SESSION_SECRET: process.env.SESSION_SECRET };
  delete process.env.ADMIN_ID;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_PASSWORD_SALT;
  delete process.env.SESSION_SECRET;
  const { server, baseUrl } = await listen(createApp());
  try {
    const response = await fetch(`${baseUrl}/api/admin/session`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, '관리자 기능이 설정되지 않았습니다.');
  } finally {
    await close(server);
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    await cleanLocalState();
  }
});

test('관리자 로그인은 성공 세션, 실패 401, 분당 제한을 적용한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  try {
    const failure = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: admin.id, password: runtimeSecret() }),
    });
    assert.equal(failure.status, 401);
    assert.equal((await failure.json()).error, '아이디 또는 비밀번호가 맞지 않아요.');

    const authenticated = await login(baseUrl, admin.id, admin.secret);
    assert.equal(authenticated.response.status, 200);
    assert.match(authenticated.cookie, /admin_session=/);
    assert.match(authenticated.cookie, /HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/);
    assert.doesNotMatch(authenticated.cookie, /Secure/);

    const session = await fetch(`${baseUrl}/api/admin/session`, { headers: { cookie: authenticated.cookie } });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), { ok: true });

    for (let index = 0; index < 5; index += 1) {
      await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.24' },
        body: JSON.stringify({ id: runtimeSecret(), password: runtimeSecret() }),
      });
    }
    const limited = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.24' },
      body: JSON.stringify({ id: runtimeSecret(), password: runtimeSecret() }),
    });
    assert.equal(limited.status, 429);
  } finally {
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('관리 API는 미인증 401, 콘텐츠 수정, 비밀번호 재설정, 피드백 단건 삭제를 처리한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const originalLog = console.log;
  console.log = () => {};
  try {
    const ownerSecret = runtimeSecret();
    const created = await uploadContent(baseUrl, { secret: ownerSecret });
    assert.equal(created.response.status, 201);

    const unauthorized = await fetch(`${baseUrl}/api/admin/content/${created.body.contentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: runtimeSecret().slice(0, 12) }),
    });
    assert.equal(unauthorized.status, 401);

    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const cookie = authenticated.cookie;
    const nextTitle = runtimeSecret().slice(0, 12);
    const patched = await fetch(`${baseUrl}/api/admin/content/${created.body.contentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: nextTitle }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).content.title, nextTitle);

    const feedback = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentId: created.body.contentId, message: runtimeSecret() }),
    });
    const feedbackBody = await feedback.json();
    assert.equal(feedback.status, 201);

    const deletedFeedback = await fetch(`${baseUrl}/api/admin/feedback`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ contentId: created.body.contentId, createdAt: feedbackBody.feedback.createdAt }),
    });
    assert.equal(deletedFeedback.status, 200);
    const feedbackAfterDelete = await fetch(`${baseUrl}/api/feedback?id=${created.body.contentId}`);
    assert.deepEqual((await feedbackAfterDelete.json()).feedback, []);

    const newOwnerSecret = runtimeSecret();
    const reset = await fetch(`${baseUrl}/api/admin/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ contentId: created.body.contentId, newPassword: newOwnerSecret }),
    });
    assert.equal(reset.status, 200);
    const registry = JSON.parse(await fs.readFile(LOCAL_REGISTRY, 'utf8'));
    assert.equal(verifyPassword(newOwnerSecret, registry[created.body.contentId].passwordHash, registry[created.body.contentId].salt), true);

    const versioned = await uploadContent(baseUrl, { ...created.identity, title: nextTitle, secret: newOwnerSecret });
    assert.equal(versioned.response.status, 201);
    assert.equal(versioned.body.version, 2);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('업로드 identity는 제목별로 새 콘텐츠를 만들고 같은 제목만 비밀번호 검증 후 버전업한다', async () => {
  await cleanLocalState();
  const { server, baseUrl } = await listen(createApp());
  try {
    const name = runtimeSecret().slice(0, 12);
    const firstTitle = runtimeSecret().slice(0, 12);
    const secondTitle = runtimeSecret().slice(0, 12);
    const firstSecret = runtimeSecret();
    const secondSecret = runtimeSecret();
    const first = await uploadContent(baseUrl, { name, title: firstTitle, secret: firstSecret });
    assert.equal(first.response.status, 201);
    assert.equal(first.body.version, 1);
    assert.match(first.body.directUrl, new RegExp(`/contents/${first.body.contentId}/v1\\.html$`));
    await fs.access(path.join(LOCAL_DEPLOY_DIR, `contents/${first.body.contentId}/v1.html`));

    const differentTitle = await uploadContent(baseUrl, { ...first.identity, title: secondTitle, secret: secondSecret });
    assert.equal(differentTitle.response.status, 201);
    assert.equal(differentTitle.body.version, 1);
    assert.notEqual(differentTitle.body.contentId, first.body.contentId);

    const versioned = await uploadContent(baseUrl, { ...first.identity, title: firstTitle, secret: firstSecret });
    assert.equal(versioned.response.status, 201);
    assert.equal(versioned.body.contentId, first.body.contentId);
    assert.equal(versioned.body.version, 2);
    assert.match(versioned.body.directUrl, new RegExp(`/contents/${first.body.contentId}/v2\\.html$`));

    const wrongPassword = await uploadContent(baseUrl, { ...first.identity, title: firstTitle, secret: runtimeSecret() });
    assert.equal(wrongPassword.response.status, 403);
  } finally {
    await close(server);
    await cleanLocalState();
  }
});

test('레거시 콘텐츠 버전 추가는 games prefix를 유지한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const originalLog = console.log;
  console.log = () => {};
  try {
    const contentId = 'abcdef12';
    const affiliation = '2026-고대세종-ai';
    const name = '레거시 소유자';
    const title = '레거시 콘텐츠';
    const secret = runtimeSecret();
    await saveRegistryItem({
      contentKey: `content#${contentId}`,
      createdAt: 'meta',
      contentId,
      cohortId: deriveLegacyCohortId(affiliation),
      affiliation,
      name,
      title,
      category: '미니게임',
      ...hashPassword(secret),
      latestVersion: 1,
      latestKey: `games/${contentId}-v1.html`,
      likes: 0,
      createdAt2: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const destination = path.join(LOCAL_DEPLOY_DIR, `games/${contentId}-v1.html`);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, '<html>legacy</html>');

    const updated = await uploadContent(baseUrl, { affiliation, name, title, category: '미니게임', secret });
    assert.equal(updated.response.status, 201);
    assert.equal(updated.body.version, 2);
    assert.match(updated.body.directUrl, new RegExp(`/games/${contentId}-v2\\.html$`));
    assert.equal((await getRegistryItem(contentId)).latestKey, `games/${contentId}-v2.html`);
    assert.match(await fs.readFile(path.join(LOCAL_DEPLOY_DIR, `games/${contentId}-v2.html`), 'utf8'), /^<!doctype html><title>.+<\/title>$/);

    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const deleted = await fetch(`${baseUrl}/api/admin/content/${contentId}`, { method: 'DELETE', headers: { cookie: authenticated.cookie } });
    assert.equal(deleted.status, 200);
    await assert.rejects(fs.stat(path.join(LOCAL_DEPLOY_DIR, `games/${contentId}-v1.html`)), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(LOCAL_DEPLOY_DIR, `games/${contentId}-v2.html`)), { code: 'ENOENT' });
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('콘텐츠 보기 페이지의 업데이트 버튼과 동일한 흐름(/api/content 조회 후 /api/upload)이 새 버전을 만든다', async () => {
  await cleanLocalState();
  const { server, baseUrl } = await listen(createApp());
  try {
    const secret = runtimeSecret();
    const created = await uploadContent(baseUrl, { secret });
    assert.equal(created.response.status, 201);

    const fetched = await fetch(`${baseUrl}/api/content?id=${created.body.contentId}`);
    const game = (await fetched.json()).content;

    const formData = new FormData();
    formData.set('affiliation', game.affiliation);
    formData.set('category', game.category);
    formData.set('name', game.name);
    formData.set('title', game.title || game.name);
    formData.set('password', secret);
    formData.set('file', htmlBlob(), 'content.html');
    const updated = await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: formData });
    const updatedBody = await updated.json();
    assert.equal(updated.status, 201);
    assert.equal(updatedBody.contentId, created.body.contentId);
    assert.equal(updatedBody.version, 2);

    const wrongPassword = new FormData();
    wrongPassword.set('affiliation', game.affiliation);
    wrongPassword.set('category', game.category);
    wrongPassword.set('name', game.name);
    wrongPassword.set('title', game.title || game.name);
    wrongPassword.set('password', runtimeSecret());
    wrongPassword.set('file', htmlBlob(), 'content.html');
    const rejected = await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: wrongPassword });
    assert.equal(rejected.status, 403);
  } finally {
    await close(server);
    await cleanLocalState();
  }
});

test('관리자 비밀번호 변경 API는 전용 로컬 파일에 오버라이드 자격을 저장하고 감사 로그에 secret을 남기지 않는다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const cookie = authenticated.cookie;
    const nextSecret = runtimeSecret();
    const changed = await fetch(`${baseUrl}/api/admin/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ currentPassword: admin.secret, newPassword: nextSecret }),
    });
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), { ok: true });

    const stat = await fs.stat(LOCAL_ADMIN_CREDENTIAL);
    assert.equal(stat.mode & 0o777, 0o600);
    await assert.rejects(fs.stat(LOCAL_REGISTRY), { code: 'ENOENT' });
    const credential = JSON.parse(await fs.readFile(LOCAL_ADMIN_CREDENTIAL, 'utf8'));
    assert.equal(credential.contentKey, 'admin#credential');
    assert.equal(credential.createdAt, 'meta');
    assert.equal(verifyPassword(nextSecret, credential.passwordHash, credential.salt), true);
    assert.equal(JSON.stringify(credential).includes(nextSecret), false);

    const oldLogin = await login(baseUrl, admin.id, admin.secret);
    assert.equal(oldLogin.response.status, 401);
    const newLogin = await login(baseUrl, admin.id, nextSecret);
    assert.equal(newLogin.response.status, 200);
    const audit = logs.map((line) => JSON.parse(line));
    assert.equal(audit.some((entry) => entry.admin_action === 'change-password' && entry.contentId === null), true);
    assert.equal(logs.join('\n').includes(nextSecret), false);
    assert.equal(logs.join('\n').includes(credential.passwordHash), false);
    assert.equal(logs.join('\n').includes(credential.salt), false);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('커스텀 관리자 계정은 전용 로컬 파일에 해시와 솔트만 저장한다', async () => {
  await cleanLocalState();
  try {
    assert.deepEqual(await getAdminAccounts(), []);
    const initialPassword = runtimeSecret();
    await addAdminAccount({ id: 'local.admin', ...hashPassword(initialPassword) });
    const stat = await fs.stat(LOCAL_ADMIN_ACCOUNTS);
    assert.equal(stat.mode & 0o777, 0o600);
    const accounts = await getAdminAccounts();
    assert.equal(verifyPassword(initialPassword, accounts[0].passwordHash, accounts[0].salt), true);
    assert.equal(JSON.stringify(accounts).includes(initialPassword), false);
    const nextPassword = runtimeSecret();
    assert.equal(await updateAdminAccountPassword('local.admin', hashPassword(nextPassword)), true);
    assert.equal(verifyPassword(nextPassword, (await getAdminAccounts())[0].passwordHash, (await getAdminAccounts())[0].salt), true);
    assert.equal(await updateAdminAccountPassword('missing.admin', hashPassword(runtimeSecret())), false);
    await assert.rejects(fs.stat(LOCAL_REGISTRY), { code: 'ENOENT' });
  } finally {
    await cleanLocalState();
  }
});

test('관리자 추가 API는 인증·입력·중복을 검증하고 새 관리자의 본인 비밀번호 변경을 처리한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const request = (body, cookie) => fetch(`${baseUrl}/api/admin/admins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const initialPassword = runtimeSecret();
    assert.equal((await request({ id: 'teacher.admin', password: initialPassword })).status, 401);
    const root = await login(baseUrl, admin.id, admin.secret);
    const cookie = root.cookie;
    assert.equal((await request({ id: 'Bad_ID', password: initialPassword }, cookie)).status, 400);
    assert.equal((await request({ id: 'teacher.admin', password: 'short7' }, cookie)).status, 400);
    assert.equal((await request({ id: admin.id, password: initialPassword }, cookie)).status, 409);
    const added = await request({ id: 'teacher.admin', password: initialPassword }, cookie);
    assert.equal(added.status, 200);
    assert.deepEqual(await added.json(), { ok: true });
    const stored = (await getAdminAccounts()).find((account) => account.id === 'teacher.admin');
    assert.equal(verifyPassword(initialPassword, stored.passwordHash, stored.salt), true);
    assert.equal(JSON.stringify(stored).includes(initialPassword), false);
    assert.equal((await request({ id: 'teacher.admin', password: initialPassword }, cookie)).status, 409);

    const accountLogin = await login(baseUrl, 'teacher.admin', initialPassword);
    assert.equal(accountLogin.response.status, 200);
    const replacementPassword = runtimeSecret();
    const changed = await fetch(`${baseUrl}/api/admin/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: accountLogin.cookie },
      body: JSON.stringify({ currentPassword: initialPassword, newPassword: replacementPassword }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await login(baseUrl, 'teacher.admin', initialPassword)).response.status, 401);
    assert.equal((await login(baseUrl, 'teacher.admin', replacementPassword)).response.status, 200);
    const logText = logs.join('\n');
    assert.equal(logText.includes(initialPassword), false);
    assert.equal(logText.includes(replacementPassword), false);
    assert.equal(logText.includes(stored.passwordHash), false);
    assert.equal(logText.includes(stored.salt), false);
    const audit = logs.map((line) => JSON.parse(line));
    assert.equal(audit.some((entry) => entry.admin_action === 'add-admin' && entry.contentId === null), true);
    assert.equal(audit.some((entry) => entry.admin_action === 'change-password' && entry.contentId === null), true);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('커스텀 코호트는 전용 로컬 파일에만 저장한다', async () => {
  await cleanLocalState();
  try {
    assert.deepEqual(await getCustomCohorts(), []);
    await addCustomCohort({ name: '2026-테스트 코호트', date: '8.1' });
    const cohorts = await getCustomCohorts();
    assert.equal(cohorts.length, 1);
    assert.equal(cohorts[0].name, '2026-테스트 코호트');
    assert.equal(cohorts[0].date, '8.1');
    assert.match(cohorts[0].cohortId, COHORT_ID_PATTERN);
    assert.match(cohorts[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
    await addCustomCohort({ name: '2026-고대세종-ai', date: '무시' });
    const merged = await cohortOptions();
    assert.equal(merged.filter((cohort) => cohort.name === '2026-고대세종-ai').length, 1);
    assert.equal(merged.find((cohort) => cohort.name === '2026-고대세종-ai').date, '6.24~25');
    await assert.rejects(fs.stat(LOCAL_REGISTRY), { code: 'ENOENT' });
  } finally {
    await cleanLocalState();
  }
});

test('renameCustomCohort는 이름만 바꾸고 일자·생성시각은 유지하며 없는 이름은 false를 반환한다', async () => {
  await cleanLocalState();
  try {
    assert.equal(await renameCustomCohort('2026-없음', '2026-새 이름'), false);
    await addCustomCohort({ name: '2026-테스트 코호트', date: '8.1' });
    const [before] = await getCustomCohorts();
    assert.equal(await renameCustomCohort('2026-테스트 코호트', '2026-바뀐 코호트'), true);
    const [after] = await getCustomCohorts();
    assert.equal(after.name, '2026-바뀐 코호트');
    assert.equal(after.cohortId, before.cohortId);
    assert.equal(after.date, before.date);
    assert.equal(after.createdAt, before.createdAt);
  } finally {
    await cleanLocalState();
  }
});

test('관리자 코호트 추가 API는 인증·입력·중복을 검증하고 업로드에 반영한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const request = (body, cookie) => fetch(`${baseUrl}/api/admin/cohorts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    assert.equal((await request({ name: '2026-새 코호트' })).status, 401);
    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const cookie = authenticated.cookie;
    const empty = await request({ name: ' ' }, cookie);
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error, '코호트 이름은 1~60자로 입력하세요.');
    assert.equal((await request({ name: '가'.repeat(61) }, cookie)).status, 400);
    const longDate = await request({ name: '2026-새 코호트', date: '1'.repeat(21) }, cookie);
    assert.equal(longDate.status, 400);
    assert.equal((await longDate.json()).error, '일자는 20자 이하로 입력하세요.');

    const added = await request({ name: ' 2026-새 코호트 ', date: ' 8.1~2 ' }, cookie);
    assert.equal(added.status, 200);
    assert.deepEqual(await added.json(), { ok: true });
    await assert.rejects(fs.stat(LOCAL_REGISTRY), { code: 'ENOENT' });
    const cohorts = await (await fetch(`${baseUrl}/api/cohorts`)).json();
    assert.equal(cohorts.cohorts.some((cohort) => cohort.name === '2026-새 코호트' && cohort.teams === null && cohort.date === '8.1~2'), true);
    assert.equal(cohorts.cohorts.every((cohort) => COHORT_ID_PATTERN.test(cohort.cohortId)), true);
    const duplicate = await request({ name: '2026-새 코호트' }, cookie);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error, '이미 있는 코호트예요.');

    const uploaded = await uploadContent(baseUrl, { affiliation: '2026-새 코호트', secret: runtimeSecret() });
    assert.equal(uploaded.response.status, 201);
    const stored = await getRegistryItem(uploaded.body.contentId);
    assert.equal(stored.cohortId, cohorts.cohorts.find((cohort) => cohort.name === '2026-새 코호트').cohortId);
    assert.equal(logs.some((line) => JSON.parse(line).admin_action === 'add-cohort'), true);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('관리자 코호트 이름 변경 API는 인증·기본 코호트 보호·중복을 검증하고 기존 콘텐츠 소속을 갱신한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const request = (body, cookie) => fetch(`${baseUrl}/api/admin/cohorts`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    assert.equal((await request({ oldName: '2026-고대세종-ai', name: '2026-바뀐 이름' })).status, 401);
    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const cookie = authenticated.cookie;

    await addCustomCohort({ name: '경희대캠타_ai스파크부트캠프_1차', date: null });
    const uploaded = await uploadContent(baseUrl, { affiliation: '경희대캠타_ai스파크부트캠프_1차', secret: runtimeSecret() });
    assert.equal(uploaded.response.status, 201);

    const empty = await request({ oldName: '경희대캠타_ai스파크부트캠프_1차', name: ' ' }, cookie);
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error, '코호트 이름은 1~60자로 입력하세요.');
    assert.equal((await request({ oldName: '경희대캠타_ai스파크부트캠프_1차', name: '가'.repeat(61) }, cookie)).status, 400);

    const missing = await request({ oldName: '2026-없는 코호트', name: '2026-새 이름' }, cookie);
    assert.equal(missing.status, 404);

    const baseCohort = await request({ oldName: '2026-고대세종-ai', name: '2026-바뀐 이름' }, cookie);
    assert.equal(baseCohort.status, 400);
    assert.equal((await baseCohort.json()).error, '기본 코호트는 이름을 변경할 수 없습니다.');

    await addCustomCohort({ name: '2026-다른 코호트', date: null });
    const duplicate = await request({ oldName: '경희대캠타_ai스파크부트캠프_1차', name: '2026-다른 코호트' }, cookie);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error, '이미 있는 코호트예요.');

    const renamed = await request({ oldName: '경희대캠타_ai스파크부트캠프_1차', name: '2026-경희대캠타_ai스파크부트캠프_1차' }, cookie);
    assert.equal(renamed.status, 200);
    assert.deepEqual(await renamed.json(), { ok: true });

    const cohorts = await (await fetch(`${baseUrl}/api/cohorts`)).json();
    assert.equal(cohorts.cohorts.some((cohort) => cohort.name === '경희대캠타_ai스파크부트캠프_1차'), false);
    assert.equal(cohorts.cohorts.some((cohort) => cohort.name === '2026-경희대캠타_ai스파크부트캠프_1차'), true);

    const games = await (await fetch(`${baseUrl}/api/games`)).json();
    const content = games.games.find((game) => game.contentId === uploaded.body.contentId);
    assert.equal(content.affiliation, '2026-경희대캠타_ai스파크부트캠프_1차');
    assert.equal(logs.some((line) => JSON.parse(line).admin_action === 'rename-cohort'), true);

    const noop = await request({ oldName: '2026-경희대캠타_ai스파크부트캠프_1차', name: '2026-경희대캠타_ai스파크부트캠프_1차' }, cookie);
    assert.equal(noop.status, 200);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('관리자 코호트 현황 API는 유형·버전·저장 방식과 export 준비 상태를 읽기 전용으로 제공한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const originalLog = console.log;
  console.log = () => {};
  try {
    const cohort = '2026-고대세종-ai';
    const ownerSecret = runtimeSecret();
    const game = await uploadContent(baseUrl, { affiliation: cohort, category: '미니게임', title: '게임', secret: ownerSecret });
    assert.equal(game.response.status, 201);
    const gameV2 = await uploadContent(baseUrl, { ...game.identity, secret: ownerSecret });
    assert.equal(gameV2.body.version, 2);
    const webpage = await uploadContent(baseUrl, { affiliation: cohort, category: '웹페이지', title: '웹페이지', secret: runtimeSecret() });
    assert.equal(webpage.response.status, 201);

    const endpoint = `${baseUrl}/api/admin/cohort-overview?cohort=${encodeURIComponent(cohort)}`;
    assert.equal((await fetch(endpoint)).status, 401);
    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const response = await fetch(endpoint, { headers: { cookie: authenticated.cookie } });
    assert.equal(response.status, 200);
    const { overview } = await response.json();
    assert.equal(overview.cohort.name, cohort);
    assert.deepEqual(overview.summary, {
      totalContents: 2,
      gameCount: 1,
      webpageCount: 1,
      totalVersions: 3,
      latestUpdatedAt: webpage.body.uploadedAt,
      exportReady: true,
    });
    assert.deepEqual(overview.storage, { legacyGames: 0, v2Contents: 2, unknown: 0 });
    assert.equal(overview.contents.length, 2);
    assert.equal(overview.contents.every((content) => content.storageScheme === 'v2-contents'), true);
    assert.equal(overview.contents.every((content) => content.latestKey.startsWith('contents/')), true);
    assert.equal(overview.contents.every((content) => content.viewerUrl.startsWith(`${baseUrl}/view.html?id=`)), true);
    assert.equal(JSON.stringify(overview).includes('passwordHash'), false);
    assert.equal(JSON.stringify(overview).includes('salt'), false);

    const empty = await fetch(`${baseUrl}/api/admin/cohort-overview?cohort=${encodeURIComponent('2026-국민대-ai워크플로우')}`, { headers: { cookie: authenticated.cookie } });
    assert.equal(empty.status, 200);
    assert.equal((await empty.json()).overview.summary.exportReady, false);
    const missing = await fetch(`${baseUrl}/api/admin/cohort-overview?cohort=${encodeURIComponent('2026-없는 코호트')}`, { headers: { cookie: authenticated.cookie } });
    assert.equal(missing.status, 404);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('관리자 코호트 export는 최신 HTML을 읽기 쉬운 파일명과 manifest로 ZIP 다운로드한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const originalLog = console.log;
  console.log = () => {};
  try {
    const cohort = '2026-고대세종-ai';
    const ownerSecret = runtimeSecret();
    const first = await uploadContent(baseUrl, { affiliation: cohort, name: '홍길동/1팀', title: 'AI: 여행 "도우미"', secret: ownerSecret });
    assert.equal(first.response.status, 201);
    const updated = await uploadContent(baseUrl, { ...first.identity, secret: ownerSecret });
    assert.equal(updated.response.status, 201);
    assert.equal(updated.body.version, 2);
    const second = await uploadContent(baseUrl, { affiliation: cohort, name: '2팀', title: '웹페이지', secret: runtimeSecret() });
    assert.equal(second.response.status, 201);
    await uploadContent(baseUrl, { affiliation: '2026-한이음-ai-중급', name: '제외', title: '다른 코호트', secret: runtimeSecret() });

    const unauthenticated = await fetch(`${baseUrl}/api/admin/exports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cohort }),
    });
    assert.equal(unauthenticated.status, 401);

    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const missing = await fetch(`${baseUrl}/api/admin/exports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: authenticated.cookie },
      body: JSON.stringify({ cohort: '2026-없는-코호트' }),
    });
    assert.equal(missing.status, 404);
    const empty = await fetch(`${baseUrl}/api/admin/exports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: authenticated.cookie },
      body: JSON.stringify({ cohort: '2026-국민대-ai워크플로우' }),
    });
    assert.equal(empty.status, 409);
    assert.equal((await empty.json()).error, '다운로드할 콘텐츠가 없습니다.');

    const response = await fetch(`${baseUrl}/api/admin/exports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: authenticated.cookie },
      body: JSON.stringify({ cohort }),
    });
    assert.equal(response.status, 202);
    const queued = (await response.json()).export;
    assert.equal(queued.status, 'queued');
    assert.equal(queued.attempt, 0);
    assert.equal(queued.cohort, cohort);
    assert.equal(Object.hasOwn(queued, 'contentIds'), false);
    const exported = await waitForExport(baseUrl, queued.exportId, authenticated.cookie);
    assert.equal(exported.status, 'completed');
    assert.equal(exported.attempt, 1);
    assert.equal(exported.count, 2);
    assert.equal(exported.cohort, cohort);
    assert.match(exported.fileName, /^2026-고대세종-ai_콘텐츠_\d{4}-\d{2}-\d{2}\.zip$/);
    assert.match(exported.downloadUrl, /^\/api\/admin\/exports\/[0-9a-f]{32}\/download\?/);

    const history = await fetch(`${baseUrl}/api/admin/exports`, { headers: { cookie: authenticated.cookie } });
    assert.equal(history.status, 200);
    const historyBody = await history.json();
    assert.equal(historyBody.exports[0].exportId, exported.exportId);
    assert.equal(historyBody.exports[0].status, 'completed');
    assert.match(historyBody.exports[0].downloadUrl, /^\/api\/admin\/exports\//);

    const invalidRetry = await fetch(`${baseUrl}/api/admin/exports/${exported.exportId}/retry`, { method: 'POST', headers: { cookie: authenticated.cookie } });
    assert.equal(invalidRetry.status, 409);

    const blockedDownload = await fetch(`${baseUrl}${exported.downloadUrl}`);
    assert.equal(blockedDownload.status, 401);

    const download = await fetch(`${baseUrl}${exported.downloadUrl}`, { headers: { cookie: authenticated.cookie } });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-type'), /application\/zip/);
    const zip = new AdmZip(Buffer.from(await download.arrayBuffer()));
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    const htmlEntries = entryNames.filter((name) => name.endsWith('.html'));
    assert.equal(htmlEntries.length, 2);
    assert.equal(htmlEntries.some((name) => name.includes('_v2.html')), true);
    assert.equal(htmlEntries.every((name) => !name.includes('/') && !name.includes(':') && !name.includes('"')), true);
    assert.deepEqual(entryNames.slice(-2), ['manifest.csv', 'manifest.json']);

    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    assert.equal(manifest.cohort, cohort);
    assert.equal(manifest.count, 2);
    assert.equal(manifest.contents.some((item) => item.contentId === first.body.contentId && item.version === 2 && item.s3Key === `contents/${first.body.contentId}/v2.html`), true);
    assert.equal(manifest.contents.every((item) => item.viewerUrl.startsWith(`${baseUrl}/view.html?id=`)), true);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('관리 콘텐츠 삭제는 로컬 배포 파일, 갤러리, 피드백을 함께 제거한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const originalLog = console.log;
  console.log = () => {};
  try {
    const ownerSecret = runtimeSecret();
    const created = await uploadContent(baseUrl, { secret: ownerSecret });
    assert.equal(created.response.status, 201);
    const updated = await uploadContent(baseUrl, { ...created.identity, secret: ownerSecret });
    assert.equal(updated.body.version, 2);
    await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentId: created.body.contentId, message: runtimeSecret() }),
    });
    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const deleted = await fetch(`${baseUrl}/api/admin/content/${created.body.contentId}`, {
      method: 'DELETE',
      headers: { cookie: authenticated.cookie },
    });
    assert.equal(deleted.status, 200);
    await assert.rejects(fs.stat(path.join(LOCAL_DEPLOY_DIR, `contents/${created.body.contentId}/v1.html`)), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(LOCAL_DEPLOY_DIR, `contents/${created.body.contentId}/v2.html`)), { code: 'ENOENT' });

    const gallery = await fetch(`${baseUrl}/api/games`);
    assert.equal((await gallery.json()).games.some((game) => game.contentId === created.body.contentId), false);
    const feedback = await fetch(`${baseUrl}/api/feedback?id=${created.body.contentId}`);
    assert.deepEqual((await feedback.json()).feedback, []);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});

test('v2 관리자 API는 ID 기반 페이지네이션·버전 메타·코호트·감사 로그를 제공한다', async () => {
  await cleanLocalState();
  const admin = withAdminEnv();
  const { server, baseUrl } = await listen(createApp());
  const originalLog = console.log;
  console.log = () => {};
  try {
    const first = await uploadContent(baseUrl, { secret: runtimeSecret(), title: '관리자 v2 첫 작품' });
    const second = await uploadContent(baseUrl, { secret: runtimeSecret(), title: '관리자 v2 둘째 작품', category: '웹페이지' });
    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 201);

    assert.equal((await fetch(`${baseUrl}/api/v2/admin/contents`)).status, 401);
    const authenticated = await login(baseUrl, admin.id, admin.secret);
    const headers = { cookie: authenticated.cookie };

    const firstPageResponse = await fetch(`${baseUrl}/api/v2/admin/contents?pageSize=1`, { headers });
    assert.equal(firstPageResponse.status, 200);
    const firstPage = await firstPageResponse.json();
    assert.equal(firstPage.contents.length, 1);
    assert.equal(firstPage.page.total, 2);
    assert.ok(firstPage.page.nextCursor);
    assert.equal(firstPage.contents[0].latestObjectKey.startsWith('contents/'), true);
    assert.equal(JSON.stringify(firstPage).includes('passwordHash'), false);

    const secondPage = await (await fetch(`${baseUrl}/api/v2/admin/contents?pageSize=1&cursor=${encodeURIComponent(firstPage.page.nextCursor)}`, { headers })).json();
    assert.equal(secondPage.contents.length, 1);
    assert.notEqual(secondPage.contents[0].contentId, firstPage.contents[0].contentId);
    const filtered = await (await fetch(`${baseUrl}/api/v2/admin/contents?type=webpage&query=${encodeURIComponent('둘째')}`, { headers })).json();
    assert.deepEqual(filtered.contents.map((item) => item.contentId), [second.body.contentId]);
    assert.equal((await fetch(`${baseUrl}/api/v2/admin/contents?cursor=broken`, { headers })).status, 400);

    const versions = await (await fetch(`${baseUrl}/api/v2/admin/contents/${first.body.contentId}/versions`, { headers })).json();
    assert.equal(versions.metadataStatus, 'complete');
    assert.equal(versions.versions[0].originalFileName, 'content.html');
    assert.match(versions.versions[0].sha256, /^[0-9a-f]{64}$/);
    assert.equal(versions.versions[0].objectKey, `contents/${first.body.contentId}/v1.html`);

    const updatedTitle = 'ID 기반으로 수정한 작품';
    const patched = await fetch(`${baseUrl}/api/v2/admin/contents/${first.body.contentId}`, {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ title: updatedTitle, contentType: 'webpage' }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).content.title, updatedTitle);

    const cohortsBefore = await (await fetch(`${baseUrl}/api/v2/admin/cohorts`, { headers })).json();
    assert.equal(cohortsBefore.cohorts.every((cohort) => COHORT_ID_PATTERN.test(cohort.cohortId)), true);
    assert.equal(cohortsBefore.cohorts.find((cohort) => cohort.name === '2026-고대세종-ai').editable, false);
    const createdCohortResponse = await fetch(`${baseUrl}/api/v2/admin/cohorts`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '2026-v2-테스트', dateLabel: '8.22' }),
    });
    assert.equal(createdCohortResponse.status, 201);
    const createdCohort = (await createdCohortResponse.json()).cohort;
    assert.equal(createdCohort.editable, true);
    const archived = await fetch(`${baseUrl}/api/v2/admin/cohorts/${createdCohort.cohortId}`, {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'archived', name: '2026-v2-테스트-보관' }),
    });
    assert.equal(archived.status, 200);
    assert.equal((await archived.json()).cohort.status, 'archived');

    const baseCohort = cohortsBefore.cohorts.find((cohort) => cohort.name === first.identity.affiliation);
    const exportResponse = await fetch(`${baseUrl}/api/v2/admin/exports`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ cohortId: baseCohort.cohortId }),
    });
    assert.equal(exportResponse.status, 202);
    const exportBody = await exportResponse.json();
    assert.equal(exportBody.export.cohort, first.identity.affiliation);
    assert.equal((await waitForExport(baseUrl, exportBody.export.exportId, authenticated.cookie)).status, 'completed');

    const auditResponse = await fetch(`${baseUrl}/api/v2/admin/audit-logs?limit=20`, { headers });
    assert.equal(auditResponse.status, 200);
    const audit = await auditResponse.json();
    assert.equal(audit.auditLogs.some((item) => item.action === 'update-content-v2' && item.targetId === first.body.contentId), true);
    assert.equal(audit.auditLogs.some((item) => item.action === 'create-cohort-v2' && item.targetId === createdCohort.cohortId), true);
    assert.equal(audit.auditLogs.some((item) => item.action === 'export-cohort-v2'), true);
    assert.equal(JSON.stringify(audit).includes(admin.secret), false);
  } finally {
    console.log = originalLog;
    await close(server);
    admin.restore();
    await cleanLocalState();
  }
});
