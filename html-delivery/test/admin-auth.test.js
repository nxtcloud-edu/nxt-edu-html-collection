const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { hashPassword } = require('../registry');
const { SESSION_COOKIE_NAME, SESSION_TTL_MS, createSessionToken, parseCookies, sessionCookie, timingSafeStringEqual, verifySessionToken } = require('../admin-auth');

function runtimeSecret() { return crypto.randomBytes(18).toString('base64url'); }

function configuredSecretPair() {
  const secret = runtimeSecret();
  return { secret, ...hashPassword(secret) };
}

test('관리자 세션 토큰은 서명된 payload와 12시간 만료를 검증한다', () => {
  const secret = runtimeSecret();
  const now = () => 1_800_000_000_000;
  const token = createSessionToken({ now, secret });
  const [payloadBase64] = token.split('.');
  const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));

  assert.equal(payload.exp, Math.floor((now() + SESSION_TTL_MS) / 1000));
  assert.equal(verifySessionToken(token, { now, secret }), true);
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
