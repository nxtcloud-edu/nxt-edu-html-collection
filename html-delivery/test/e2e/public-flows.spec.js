const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { cohortA, mockPublicApi } = require('./fixtures');

test.beforeEach(async ({ page }) => {
  await mockPublicApi(page);
});

test('갤러리에서 유형·정렬·페이지·수업 보기를 이동한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AI와 함께 만든 우리들의 콘텐츠' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: '대시보드' })).toBeVisible();
  await expect(page.getByRole('region', { name: '콘텐츠 현황' })).toBeVisible();
  await page.getByRole('tab', { name: '콘텐츠 둘러보기' }).click();
  await expect(page.getByText('12개의 콘텐츠')).toBeVisible();
  await expect(page.locator('.content-card')).toHaveCount(10);
  await expect(page.getByRole('tabpanel', { name: '콘텐츠 둘러보기' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '수업별 모아보기' })).not.toBeVisible();

  await page.getByRole('button', { name: '추천순' }).click();
  await expect(page.locator('.content-card h3').first()).toHaveText('우리 동네 탄소 지도');

  await page.getByRole('button', { name: '다음 →' }).click();
  await expect(page.locator('.content-card')).toHaveCount(2);
  await page.getByRole('button', { name: '웹페이지', exact: true }).click();
  await expect(page.getByText('8개의 콘텐츠')).toBeVisible();

  await page.getByRole('tab', { name: '대시보드' }).click();
  await expect(page.getByRole('region', { name: '콘텐츠 현황' })).toBeVisible();
  await expect(page.locator('#home-panel-gallery')).toBeHidden();

  await page.getByRole('tab', { name: '수업별 모아보기' }).click();
  await expect(page).toHaveURL(/#cohorts$/);
  const cohortLink = page.getByRole('tabpanel', { name: '수업별 모아보기' }).getByRole('link', { name: new RegExp(cohortA.name) });
  await expect(cohortLink).toBeVisible();
  await cohortLink.click();
  await expect(page).toHaveURL(new RegExp(`/cohort\\.html\\?id=${cohortA.cohortId}`));
  await expect(page.getByRole('heading', { name: cohortA.name })).toBeVisible();
});

test('업로드 화면은 신규 생성과 버전 추가를 명확히 분리한다', async ({ page }) => {
  await page.goto(`/upload.html?cohortId=${cohortA.cohortId}`);
  await expect(page.getByRole('heading', { name: '내 콘텐츠 업로드' })).toBeVisible();
  await expect(page.getByLabel('소속(수업)')).toHaveValue(cohortA.cohortId);
  await expect(page.locator('#createForm')).toBeVisible();

  await page.getByRole('tab', { name: '기존 콘텐츠 새 버전' }).click();
  await expect(page.locator('#versionForm')).toBeVisible();
  await expect(page.getByLabel('콘텐츠 ID')).toBeVisible();
});

test('콘텐츠 보기 화면은 원본·메타데이터·피드백을 함께 제공한다', async ({ page }) => {
  await page.goto('/view.html?id=a0000001');
  await expect(page.getByRole('heading', { name: '우리 동네 탄소 지도' })).toBeVisible();
  await expect(page.getByText('2026 AI 리터러시 1기')).toBeVisible();
  await expect(page.getByRole('button', { name: /추천/ })).toContainText('20');
  await expect(page.getByText('데이터 표현이 이해하기 쉬워요.')).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute('src', /content\.showcase\.nxtcloud\.kr/);
  await page.getByRole('button', { name: '파일 업데이트' }).click();
  await expect(page.getByRole('dialog', { name: '파일 업데이트' })).toBeVisible();
  await page.getByRole('button', { name: '취소' }).click();
  await expect(page.getByRole('dialog', { name: '파일 업데이트' })).not.toBeVisible();
});

test('공개 핵심 화면에는 critical 접근성 위반이 없다', async ({ page }, testInfo) => {
  for (const path of ['/', '/upload.html', '/view.html?id=a0000001']) {
    await page.goto(path);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    await testInfo.attach(`axe-${path.replace(/\W+/g, '-') || 'home'}`, {
      body: Buffer.from(JSON.stringify(result.violations, null, 2)),
      contentType: 'application/json',
    });
    expect(result.violations.filter((item) => item.impact === 'critical'), `${path} critical violations`).toEqual([]);
  }
});
