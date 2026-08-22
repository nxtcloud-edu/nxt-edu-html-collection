const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockAdminApi } = require('./fixtures');

test('비로그인 관리자는 로그인 화면만 볼 수 있다', async ({ page }) => {
  await page.route('**/api/admin/session', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto('/admin.html');
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
  await expect(page.locator('#adminId')).toBeVisible();
  await expect(page.locator('#adminPassword')).toBeVisible();
  await expect(page.getByRole('button', { name: '코호트 ZIP 다운로드' })).toBeHidden();
});

test('로그인 관리자는 현황·콘텐츠·ZIP 진입점을 확인한다', async ({ page }, testInfo) => {
  await mockAdminApi(page);
  await page.goto('/admin.html');
  await expect(page.getByRole('heading', { name: '운영 현황' })).toBeVisible();
  await expect(page.locator('#overviewTotal')).toHaveText('4개');

  await page.getByRole('button', { name: /콘텐츠$/ }).click();
  await expect(page.getByText('4개의 콘텐츠')).toBeVisible();
  await expect(page.getByRole('cell', { name: /우리 동네 탄소 지도/ })).toBeVisible();
  await page.getByRole('button', { name: '검토' }).first().click();
  await expect(page.getByRole('complementary', { name: '콘텐츠 상세' })).toBeVisible();
  await expect(page.getByText('버전 1개')).toBeVisible();
  await page.getByRole('button', { name: '닫기' }).click();
  await page.getByRole('button', { name: '다음 25개 →' }).click();
  await expect(page.getByText('2 페이지')).toBeVisible();
  await expect(page.getByRole('cell', { name: /AI 프로젝트 4/ })).toBeVisible();
  await page.getByRole('button', { name: '← 이전 25개' }).click();
  await expect(page.getByText('1 페이지')).toBeVisible();

  await page.getByRole('button', { name: /내보내기$/ }).click();
  await expect(page.getByRole('heading', { name: '코호트 ZIP 다운로드' })).toBeVisible();
  await expect(page.getByText(/이름\/팀명·제목·버전/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'ZIP 생성 요청' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, '관리자 화면 가로 오버플로').toBeLessThanOrEqual(1);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  await testInfo.attach('axe-admin', { body: Buffer.from(JSON.stringify(result.violations, null, 2)), contentType: 'application/json' });
  expect(result.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});
