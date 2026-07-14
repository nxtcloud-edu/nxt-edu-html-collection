const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createAdminAuth, SESSION_COOKIE_NAME, SESSION_TTL_MS, createSessionToken, parseCookies, sessionCookie, timingSafeStringEqual, verifySessionToken } = require('../admin-auth');
const { hashPassword, verifyPassword } = require('../registry');

function runtimeSecret() { return crypto.randomBytes(18).toString('base64url'); }

function configuredSecretPair() {
  const secret = runtimeSecret();
  return { secret, ...hashPassword(secret) };
}

function withEnvConfig(pair = configuredSecretPair()) {
  const previous = {
    ADMIN_ID: process.env.ADMIN_ID,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_PASSWORD_SALT: process.env.ADMIN_PASSWORD_SALT,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  process.env.ADMIN_ID = `admin${crypto.randomBytes(8).toString('hex')}`;
  process.env.ADMIN_PASSWORD_HASH = pair.passwordHash;
  process.env.ADMIN_PASSWORD_SALT = pair.salt;
  process.env.SESSION_SECRET = runtimeSecret();
  return {
    id: process.env.ADMIN_ID,
    secret: pair.secret,
    restore() {
      Object.entries(previous).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    },
  };
}

function req({ body = {}, cookie = '', ip = '127.0.0.1' } = {}) {
  return { body, ip, get: (name) => (name.toLowerCase() === 'cookie' ? cookie : '') };
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function call(handler, request) {
  const response = res();
  await handler(request, response, (error) => { if (error) throw error; });
  return response;
}

test('관리자 세션 토큰은 서명된 payload와 12시간 만료를 검증한다', () => {
  const secret = runtimeSecret();
  const now = () => 1_800_000_000_000;
  const token = createSessionToken({ id: 'root.admin', now, secret });
  const [payloadBase64] = token.split('.');
  const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));

  assert.equal(payload.exp, Math.floor((now() + SESSION_TTL_MS) / 1000));
  assert.deepEqual(verifySessionToken(token, { now, secret }), payload);
});

test('관리자 세션 토큰은 변조와 만료를 거부한다', () => {
  const secret = runtimeSecret();
  const nowValue = 1_800_000_000_000;
  const token = createSessionToken({ now: () => nowValue, secret });
  const [payloadBase64, signature] = token.split('.');
  const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, exp: payload.exp + 60 })).toString('base64url');

  assert.equal(verifySessionToken(`${tamperedPayload}.${signature}`, { now: () => nowValue, secret }), false);
  assert.equal(verifySessionToken(token, { now: () => nowValue + SESSION_TTL_MS, secret }), false);
});

test('쿠키 파서는 수동으로 admin_session 값을 찾고 쿠키 속성을 고정한다', () => {
  const token = createSessionToken({ secret: runtimeSecret() });
  assert.equal(parseCookies(`theme=dark; ${SESSION_COOKIE_NAME}=${token}; flag=1`)[SESSION_COOKIE_NAME], token);
  assert.equal(sessionCookie(token).includes('HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'), true);
});

test('관리자 id 비교와 비밀번호 검증은 런타임 생성 secret으로 성공/실패를 판정한다', () => {
  const id = runtimeSecret();
  const pair = configuredSecretPair();
  assert.equal(timingSafeStringEqual(id, id), true);
  assert.equal(timingSafeStringEqual(runtimeSecret(), id), false);
  assert.equal(hashPassword(pair.secret, pair.salt).passwordHash, pair.passwordHash);
});

test('관리자 로그인은 오버라이드가 있으면 오버라이드 자격을 env보다 우선한다', async () => {
  const envPair = configuredSecretPair();
  const overridePair = configuredSecretPair();
  const env = withEnvConfig(envPair);
  let override = { passwordHash: overridePair.passwordHash, salt: overridePair.salt };
  const auth = createAdminAuth({
    getAdminCredential: async () => override,
    saveAdminCredential: async () => {},
    getAdminAccounts: async () => [],
    addAdminAccount: async () => {},
    updateAdminAccountPassword: async () => false,
    hashPassword,
  });
  try {
    const envLogin = await call(auth.login, req({ body: { id: env.id, password: env.secret } }));
    assert.equal(envLogin.statusCode, 401);

    const overrideLogin = await call(auth.login, req({ body: { id: env.id, password: overridePair.secret } }));
    assert.equal(overrideLogin.statusCode, 200);
    assert.match(overrideLogin.headers['set-cookie'], /admin_session=/);

    override = null;
    const fallbackLogin = await call(auth.login, req({ body: { id: env.id, password: env.secret } }));
    assert.equal(fallbackLogin.statusCode, 200);
  } finally {
    env.restore();
  }
});

test('change-password는 현재 비밀번호와 새 비밀번호를 검증하고 해시/솔트만 저장한다', async () => {
  const currentPair = configuredSecretPair();
  const env = withEnvConfig(currentPair);
  let saved = null;
  const auditLogs = [];
  const auth = createAdminAuth({
    getAdminCredential: async () => saved,
    saveAdminCredential: async (credential) => { saved = credential; },
    getAdminAccounts: async () => [],
    addAdminAccount: async () => {},
    updateAdminAccountPassword: async () => false,
    hashPassword,
    auditAdminAction: (admin_action, contentId) => auditLogs.push({ admin_action, contentId }),
  });
  const cookie = sessionCookie(createSessionToken({ secret: process.env.SESSION_SECRET }));
  const newSecret = runtimeSecret();
  try {
    const badCurrent = await call(auth.changePassword, req({ cookie, body: { currentPassword: runtimeSecret(), newPassword: newSecret } }));
    assert.equal(badCurrent.statusCode, 401);
    assert.equal(badCurrent.body.error, '현재 비밀번호가 맞지 않아요.');

    for (const invalid of ['short7', currentPair.secret, `${runtimeSecret()}${'x'.repeat(80)}`]) {
      const rejected = await call(auth.changePassword, req({ cookie, body: { currentPassword: currentPair.secret, newPassword: invalid } }));
      assert.equal(rejected.statusCode, 400);
      assert.equal(rejected.body.error, '새 비밀번호는 8~72자이고 현재 비밀번호와 달라야 해요.');
    }

    const changed = await call(auth.changePassword, req({ cookie, body: { currentPassword: currentPair.secret, newPassword: newSecret } }));
    assert.equal(changed.statusCode, 200);
    assert.deepEqual(changed.body, { ok: true });
    assert.equal(saved.passwordHash === newSecret, false);
    assert.equal(saved.salt === newSecret, false);
    assert.equal(verifyPassword(newSecret, saved.passwordHash, saved.salt), true);
    assert.match(saved.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(auditLogs, [{ admin_action: 'change-password', contentId: null }]);

    const oldLogin = await call(auth.login, req({ body: { id: env.id, password: currentPair.secret } }));
    assert.equal(oldLogin.statusCode, 401);
    const newLogin = await call(auth.login, req({ body: { id: env.id, password: newSecret } }));
    assert.equal(newLogin.statusCode, 200);
  } finally {
    env.restore();
  }
});

test('다중 관리자는 신원 세션으로 로그인·비밀번호 변경·관리자 추가를 처리한다', async () => {
  const env = withEnvConfig();
  const accountPassword = runtimeSecret();
  const account = { id: 'operator.1', ...hashPassword(accountPassword), createdAt: new Date().toISOString() };
  const accounts = [account];
  const auditLogs = [];
  let savedEnvCredential = null;
  const auth = createAdminAuth({
    getAdminCredential: async () => savedEnvCredential,
    saveAdminCredential: async (credential) => { savedEnvCredential = credential; },
    getAdminAccounts: async () => accounts,
    addAdminAccount: async (next) => { accounts.push({ ...next, createdAt: new Date().toISOString() }); },
    updateAdminAccountPassword: async (id, credential) => {
      const existing = accounts.find((item) => item.id === id);
      if (!existing) return false;
      Object.assign(existing, credential);
      return true;
    },
    hashPassword,
    auditAdminAction: (adminAction, contentId) => auditLogs.push({ adminAction, contentId }),
  });
  try {
    const envLogin = await call(auth.login, req({ body: { id: env.id, password: env.secret } }));
    assert.equal(envLogin.statusCode, 200);
    const accountLogin = await call(auth.login, req({ body: { id: account.id, password: accountPassword } }));
    assert.equal(accountLogin.statusCode, 200);
    const accountToken = parseCookies(accountLogin.headers['set-cookie'])[SESSION_COOKIE_NAME];
    assert.equal(verifySessionToken(accountToken, { secret: process.env.SESSION_SECRET }).id, account.id);
    const protectedRequest = req({ cookie: accountLogin.headers['set-cookie'] });
    let nextCalled = false;
    auth.requireAdmin(protectedRequest, res(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(protectedRequest.adminId, account.id);
    const legacyRequest = req({ cookie: sessionCookie(createSessionToken({ secret: process.env.SESSION_SECRET })) });
    auth.requireAdmin(legacyRequest, res(), () => {});
    assert.equal(legacyRequest.adminId, env.id);
    assert.equal((await call(auth.login, req({ body: { id: 'missing.admin', password: accountPassword } }))).statusCode, 401);
    assert.equal((await call(auth.login, req({ body: { id: account.id, password: runtimeSecret() } }))).statusCode, 401);

    const replacementPassword = runtimeSecret();
    const changed = await call(auth.changePassword, { ...req({ body: { currentPassword: accountPassword, newPassword: replacementPassword } }), adminId: account.id });
    assert.equal(changed.statusCode, 200);
    assert.equal(verifyPassword(replacementPassword, account.passwordHash, account.salt), true);
    assert.equal((await call(auth.login, req({ ip: '127.0.0.2', body: { id: account.id, password: accountPassword } }))).statusCode, 401);
    assert.equal((await call(auth.login, req({ ip: '127.0.0.2', body: { id: account.id, password: replacementPassword } }))).statusCode, 200);

    assert.equal((await call(auth.addAdmin, req({ body: { id: 'Bad_ID', password: runtimeSecret() } }))).statusCode, 400);
    assert.equal((await call(auth.addAdmin, req({ body: { id: 'new.admin', password: 'short7' } }))).statusCode, 400);
    assert.equal((await call(auth.addAdmin, req({ body: { id: env.id, password: runtimeSecret() } }))).statusCode, 409);
    const initialPassword = runtimeSecret();
    const added = await call(auth.addAdmin, req({ body: { id: 'new.admin', password: initialPassword } }));
    assert.equal(added.statusCode, 200);
    const addedAccount = accounts.find((item) => item.id === 'new.admin');
    assert.equal(verifyPassword(initialPassword, addedAccount.passwordHash, addedAccount.salt), true);
    assert.equal(JSON.stringify(addedAccount).includes(initialPassword), false);
    assert.deepEqual(auditLogs, [{ adminAction: 'change-password', contentId: null }, { adminAction: 'add-admin', contentId: null }]);
  } finally {
    env.restore();
  }
});
