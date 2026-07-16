const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { cohortOptions, createApp } = require('../server');
const { LOCAL_ADMIN_ACCOUNTS, LOCAL_ADMIN_CREDENTIAL, LOCAL_COHORTS, LOCAL_REGISTRY, addAdminAccount, addCustomCohort, getAdminAccounts, getCustomCohorts, hashPassword, updateAdminAccountPassword, verifyPassword } = require('../registry');

const LOCAL_DEPLOY_DIR = path.join(__dirname, '../.local-deploy');
const LOCAL_FEEDBACK_LOG = path.join(__dirname, '../.local-feedback.jsonl');

function runtimeSecret() { return crypto.randomBytes(18).toString('base64url'); }

async function cleanLocalState() {
  await fs.rm(LOCAL_REGISTRY, { force: true });
  await fs.rm(LOCAL_ADMIN_CREDENTIAL, { force: true });
  await fs.rm(LOCAL_ADMIN_ACCOUNTS, { force: true });
  await fs.rm(LOCAL_COHORTS, { force: true });
  await fs.rm(LOCAL_FEEDBACK_LOG, { force: true });
  await fs.rm(LOCAL_DEPLOY_DIR, { recursive: true, force: true });
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
  return { response, body: await response.json(), identity: { affiliation, category, name } };
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

    const differentTitle = await uploadContent(baseUrl, { ...first.identity, title: secondTitle, secret: secondSecret });
    assert.equal(differentTitle.response.status, 201);
    assert.equal(differentTitle.body.version, 1);
    assert.notEqual(differentTitle.body.contentId, first.body.contentId);

    const versioned = await uploadContent(baseUrl, { ...first.identity, title: firstTitle, secret: firstSecret });
    assert.equal(versioned.response.status, 201);
    assert.equal(versioned.body.contentId, first.body.contentId);
    assert.equal(versioned.body.version, 2);

    const wrongPassword = await uploadContent(baseUrl, { ...first.identity, title: firstTitle, secret: runtimeSecret() });
    assert.equal(wrongPassword.response.status, 403);
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
    const duplicate = await request({ name: '2026-새 코호트' }, cookie);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error, '이미 있는 코호트예요.');

    const uploaded = await uploadContent(baseUrl, { affiliation: '2026-새 코호트', secret: runtimeSecret() });
    assert.equal(uploaded.response.status, 201);
    assert.equal(logs.some((line) => JSON.parse(line).admin_action === 'add-cohort'), true);
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
    await assert.rejects(fs.stat(path.join(LOCAL_DEPLOY_DIR, `games/${created.body.contentId}-v1.html`)), { code: 'ENOENT' });

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
