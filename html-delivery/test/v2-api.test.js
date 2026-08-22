const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createApp } = require('../server');
const { LOCAL_AUDIT_LOG } = require('../repositories/audit-repository');
const { LOCAL_VERSIONS } = require('../repositories/version-repository');
const {
  LOCAL_ADMIN_ACCOUNTS,
  LOCAL_ADMIN_CREDENTIAL,
  LOCAL_COHORTS,
  LOCAL_REGISTRY,
} = require('../registry');

const LOCAL_DEPLOY_DIR = path.join(__dirname, '../.local-deploy');
const LOCAL_FEEDBACK_LOG = path.join(__dirname, '../.local-feedback.jsonl');

function runtimeSecret() { return crypto.randomBytes(10).toString('base64url'); }
function htmlBlob(label = 'v2') { return new Blob([`<!doctype html><title>${label}</title>`], { type: 'text/html' }); }

async function cleanLocalState() {
  await Promise.all([
    fs.rm(LOCAL_DEPLOY_DIR, { recursive: true, force: true }),
    fs.rm(LOCAL_FEEDBACK_LOG, { force: true }),
    fs.rm(LOCAL_AUDIT_LOG, { force: true }),
    fs.rm(LOCAL_VERSIONS, { force: true }),
    fs.rm(LOCAL_REGISTRY, { force: true }),
    fs.rm(LOCAL_COHORTS, { force: true }),
    fs.rm(LOCAL_ADMIN_CREDENTIAL, { force: true }),
    fs.rm(LOCAL_ADMIN_ACCOUNTS, { force: true }),
  ]);
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function close(server) { await new Promise((resolve) => server.close(resolve)); }

function createForm({ cohortId, ownerName = '테스트 소유자', title = '명시적 생성 테스트', contentType = 'webpage', password }) {
  const form = new FormData();
  form.set('cohortId', cohortId);
  form.set('contentType', contentType);
  form.set('ownerName', ownerName);
  form.set('title', title);
  form.set('password', password);
  form.set('file', htmlBlob(title), 'content.html');
  return form;
}

test('v2 공개 조회는 cohortId와 정규화된 콘텐츠 필드를 사용하고 비공개 필드를 제외한다', async () => {
  await cleanLocalState();
  const { server, baseUrl } = await listen(createApp());
  try {
    for (const path of ['/index.html', '/upload.html', `/view.html?id=${'a'.repeat(8)}`]) {
      const rootDocument = await (await fetch(`${baseUrl}${path}`)).text();
      assert.match(rootDocument, /NXT Cloud AI 콘텐츠 쇼케이스/);
      assert.match(rootDocument, /\/app\/assets\/index-[^"']+\.js/);
    }

    const cohortsResponse = await fetch(`${baseUrl}/api/v2/cohorts`);
    assert.equal(cohortsResponse.status, 200);
    const cohorts = (await cohortsResponse.json()).cohorts;
    const cohort = cohorts[0];
    assert.match(cohort.cohortId, /^coh_[a-z0-9]{12}$/);
    assert.equal(cohort.status, 'active');
    assert.ok(['individual', 'team'].includes(cohort.submissionMode));

    const password = runtimeSecret();
    const created = await fetch(`${baseUrl}/api/v2/contents`, { method: 'POST', body: createForm({ cohortId: cohort.cohortId, password }) });
    assert.equal(created.status, 201);
    const content = (await created.json()).content;
    assert.equal(content.cohort.cohortId, cohort.cohortId);
    assert.equal(content.contentType, 'webpage');
    assert.equal(content.owner.name, '테스트 소유자');
    assert.equal(content.latestVersion, 1);
    assert.match(content.contentUrl, new RegExp(`/contents/${content.contentId}/v1\\.html$`));
    assert.match(content.viewerUrl, new RegExp(`/view\\.html\\?id=${content.contentId}$`));
    assert.equal(JSON.stringify(content).includes('passwordHash'), false);
    assert.equal(JSON.stringify(content).includes('latestObjectKey'), false);

    const listed = await fetch(`${baseUrl}/api/v2/contents?cohortId=${cohort.cohortId}&type=webpage`);
    assert.equal(listed.status, 200);
    assert.deepEqual((await listed.json()).contents.map((item) => item.contentId), [content.contentId]);
    assert.equal((await fetch(`${baseUrl}/api/v2/contents?type=unknown`)).status, 400);
  } finally {
    await close(server);
    await cleanLocalState();
  }
});

test('v2 신규 생성은 같은 메타데이터도 별도 콘텐츠로 만들고 버전 추가는 contentId를 명시한다', async () => {
  await cleanLocalState();
  const { server, baseUrl } = await listen(createApp());
  try {
    const cohort = (await (await fetch(`${baseUrl}/api/v2/cohorts`)).json()).cohorts[0];
    const password = runtimeSecret();
    const first = await fetch(`${baseUrl}/api/v2/contents`, { method: 'POST', body: createForm({ cohortId: cohort.cohortId, password }) });
    const second = await fetch(`${baseUrl}/api/v2/contents`, { method: 'POST', body: createForm({ cohortId: cohort.cohortId, password }) });
    const firstContent = (await first.json()).content;
    const secondContent = (await second.json()).content;
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(firstContent.contentId, secondContent.contentId);

    const versionForm = new FormData();
    versionForm.set('password', password);
    versionForm.set('file', htmlBlob('version 2'), 'version-2.html');
    const versioned = await fetch(`${baseUrl}/api/v2/contents/${firstContent.contentId}/versions`, { method: 'POST', body: versionForm });
    assert.equal(versioned.status, 201);
    const versionedContent = (await versioned.json()).content;
    assert.equal(versionedContent.contentId, firstContent.contentId);
    assert.equal(versionedContent.latestVersion, 2);
    assert.match(versionedContent.contentUrl, new RegExp(`/contents/${firstContent.contentId}/v2\\.html$`));

    const untouched = await fetch(`${baseUrl}/api/v2/contents/${secondContent.contentId}`);
    assert.equal((await untouched.json()).content.latestVersion, 1);

    const wrongPassword = new FormData();
    wrongPassword.set('password', runtimeSecret());
    wrongPassword.set('file', htmlBlob('rejected'), 'rejected.html');
    assert.equal((await fetch(`${baseUrl}/api/v2/contents/${firstContent.contentId}/versions`, { method: 'POST', body: wrongPassword })).status, 403);

    const versionsResponse = await fetch(`${baseUrl}/api/v2/contents/${firstContent.contentId}/versions`);
    assert.equal(versionsResponse.status, 200);
    const versions = (await versionsResponse.json()).versions;
    assert.deepEqual(versions.map((item) => item.version), [1, 2]);
    assert.equal(versions[1].isLatest, true);
    assert.equal(JSON.stringify(versions).includes('objectKey'), false);
    assert.equal(JSON.stringify(versions).includes('sha256'), false);
  } finally {
    await close(server);
    await cleanLocalState();
  }
});
