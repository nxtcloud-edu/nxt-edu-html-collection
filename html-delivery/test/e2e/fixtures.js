const cohortA = {
  cohortId: 'coh_aaaaaaaaaaaa',
  name: '2026 AI 리터러시 1기',
  dateLabel: '8.20~21',
  status: 'active',
  submissionMode: 'individual',
};
const cohortB = {
  cohortId: 'coh_bbbbbbbbbbbb',
  name: '부산 공유대학 프로젝트',
  dateLabel: '8.22',
  status: 'active',
  submissionMode: 'team',
  teams: ['비전팀', '클라우드팀'],
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
  await page.route('**/api/v2/cohorts', (route) => json(route, { cohorts: [cohortA, cohortB] }));
  await page.route(/\/api\/v2\/contents(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    let items = contents;
    const cohortId = url.searchParams.get('cohortId');
    const type = url.searchParams.get('type');
    if (cohortId) items = items.filter((item) => item.cohort.cohortId === cohortId);
    if (type) items = items.filter((item) => item.contentType === type);
    return json(route, { contents: items });
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
  await page.route('**/api/cohorts', (route) => json(route, { cohorts: [{ name: cohortA.name }, { name: cohortB.name }] }));
  await page.route('**/api/categories', (route) => json(route, { categories: ['webpage', 'game'] }));
  await page.route('**/api/games', (route) => json(route, { games: legacyGames }));
  await page.route('**/api/admin/cohort-overview?*', (route) => json(route, {
    overview: {
      cohort: null,
      summary: { totalContents: 3, gameCount: 1, webpageCount: 2, totalVersions: 5, latestUpdatedAt: contents[0].updatedAt, exportReady: false },
      storage: { legacyGames: 0, v2Contents: 3, unknown: 0 },
    },
  }));
}

module.exports = { cohortA, cohortB, contents, mockAdminApi, mockPublicApi };
