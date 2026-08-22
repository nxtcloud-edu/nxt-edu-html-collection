const cohortA = {
  cohortId: 'coh_aaaaaaaaaaaa',
  name: '2026 AI 리터러시 1기',
  dateLabel: '8.20~21',
  status: 'active',
  submissionMode: 'individual',
  teamOptions: [],
};
const cohortB = {
  cohortId: 'coh_bbbbbbbbbbbb',
  name: '부산 공유대학 프로젝트',
  dateLabel: '8.22',
  status: 'active',
  submissionMode: 'team',
  teamOptions: ['비전팀', '클라우드팀'],
};

const contents = Array.from({ length: 12 }, (_, index) => ({
  contentId: `a${String(index + 1).padStart(7, '0')}`,
  title: index === 0 ? '우리 동네 탄소 지도' : `AI 프로젝트 ${index + 1}`,
  contentType: index % 3 === 0 ? 'game' : 'webpage',
  owner: { name: index % 2 ? `학생 ${index + 1}` : `팀 ${index + 1}` },
  cohort: index < 8 ? cohortA : cohortB,
  latestVersion: index === 0 ? 3 : 1,
  likes: 20 - index,
  updatedAt: new Date(Date.UTC(2026, 7, 22, 9, 0, index)).toISOString(),
  viewerUrl: `/view.html?id=a${String(index + 1).padStart(7, '0')}`,
  contentUrl: `https://content.showcase.nxtcloud.kr/contents/a${String(index + 1).padStart(7, '0')}/v1.html`,
}));

async function json(route, body, status = 200) {
  await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

async function mockPublicApi(page) {
  const cohortStats = [cohortA, cohortB].map((cohort) => {
    const items = contents.filter((item) => item.cohort.cohortId === cohort.cohortId);
    return { ...cohort, contentCount: items.length, gameCount: items.filter((item) => item.contentType === 'game').length, webpageCount: items.filter((item) => item.contentType === 'webpage').length };
  });
  await page.route('**/api/v2/cohorts', (route) => json(route, { cohorts: cohortStats }));
  await page.route(/\/api\/v2\/contents(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    let items = contents;
    const cohortId = url.searchParams.get('cohortId');
    const type = url.searchParams.get('type');
    const query = url.searchParams.get('query')?.toLowerCase();
    const sort = url.searchParams.get('sort');
    if (cohortId) items = items.filter((item) => item.cohort.cohortId === cohortId);
    if (type) items = items.filter((item) => item.contentType === type);
    if (query) items = items.filter((item) => [item.title, item.owner.name, item.cohort.name].some((value) => value.toLowerCase().includes(query)));
    items = [...items].sort((a, b) => sort === 'likes' ? b.likes - a.likes : b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const start = url.searchParams.get('cursor') === 'fixture-page-2' ? 10 : 0;
    const pageSize = Number(url.searchParams.get('pageSize') || total);
    return json(route, { contents: items.slice(start, start + pageSize), total, nextCursor: start + pageSize < total ? 'fixture-page-2' : null });
  });
  await page.route(/\/api\/v2\/contents\/[a-f0-9]{8}$/, (route) => json(route, { content: contents[0] }));
  await page.route(/\/api\/feedback\?.*$/, (route) => json(route, {
    feedback: [{ nickname: '동료 학습자', message: '데이터 표현이 이해하기 쉬워요.', createdAt: '2026-08-22T09:30:00.000Z' }],
  }));
}

async function mockAdminApi(page) {
  const legacyGames = contents.slice(0, 3).map((item) => ({
    contentId: item.contentId,
    title: item.title,
    name: item.owner.name,
    affiliation: item.cohort.name,
    category: item.contentType,
    latestVersion: item.latestVersion,
    likes: item.likes,
    updatedAt: item.updatedAt,
    latestKey: `contents/${item.contentId}/v${item.latestVersion}.html`,
  }));
  await page.route('**/api/admin/session', (route) => json(route, { ok: true }));
  const adminContents = contents.slice(0, 4).map((item, index) => ({
    ...item,
    owner: { ...contents[index].owner, kind: index === 0 ? 'individual' : 'individual' },
    cohort: { ...contents[index].cohort, status: 'active' },
    latestObjectKey: `contents/${item.contentId}/v${item.latestVersion}.html`,
    fallbackObjectKey: null,
    storageScheme: 'v2-contents',
    createdAt: contents[index].updatedAt,
  }));
  const adminCohorts = [cohortA, cohortB].map((cohort) => ({ ...cohort, createdAt: null, updatedAt: null, editable: cohort === cohortB }));
  await page.route(/\/api\/v2\/admin\/contents\?.*$/, (route) => {
    const secondPage = new URL(route.request().url()).searchParams.get('cursor') === 'fixture-admin-page-2';
    return json(route, { contents: secondPage ? adminContents.slice(3) : adminContents.slice(0, 3), page: { pageSize: 25, total: 4, nextCursor: secondPage ? null : 'fixture-admin-page-2' } });
  });
  await page.route('**/api/v2/admin/cohorts', (route) => json(route, { cohorts: adminCohorts }));
  await page.route(/\/api\/v2\/admin\/contents\/[a-f0-9]{8}\/versions$/, (route) => json(route, { contentId: contents[0].contentId, metadataStatus: 'complete', versions: [{ contentId: contents[0].contentId, version: 3, objectKey: `contents/${contents[0].contentId}/v3.html`, originalFileName: 'carbon-map.html', sizeBytes: 8192, sha256: 'a'.repeat(64), uploadedAt: contents[0].updatedAt }] }));
  await page.route('**/api/v2/admin/audit-logs?*', (route) => json(route, { auditLogs: [{ auditId: 'audit-1', actorId: 'fixture-admin', action: 'update-content-v2', targetType: 'content', targetId: contents[0].contentId, details: {}, occurredAt: contents[0].updatedAt }], page: { limit: 25, nextCursor: null } }));
  await page.route('**/api/admin/exports?*', (route) => json(route, { exports: [] }));
  await page.route(/\/api\/feedback\?.*$/, (route) => json(route, { feedback: [{ nickname: '동료 학습자', message: '데이터 표현이 이해하기 쉬워요.', createdAt: '2026-08-22T09:30:00.000Z' }] }));
  await page.route('**/api/cohorts', (route) => json(route, { cohorts: [{ name: cohortA.name }, { name: cohortB.name }] }));
  await page.route('**/api/categories', (route) => json(route, { categories: ['webpage', 'game'] }));
  await page.route('**/api/games', (route) => json(route, { games: legacyGames }));
  await page.route('**/api/admin/cohort-overview?*', (route) => json(route, {
    overview: {
      cohort: null,
      summary: { totalContents: 4, gameCount: 2, webpageCount: 2, totalVersions: 6, latestUpdatedAt: contents[0].updatedAt, exportReady: false },
      storage: { legacyGames: 0, v2Contents: 4, unknown: 0 },
    },
  }));
}

module.exports = { cohortA, cohortB, contents, mockAdminApi, mockPublicApi };
