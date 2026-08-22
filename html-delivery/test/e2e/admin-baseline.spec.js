const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./fixtures');

test('비로그인 관리자는 로그인 화면만 볼 수 있다', async ({ page }) => {
  await page.route('**/api/admin/session', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto('/admin.html');
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
  await expect(page.locator('#adminId')).toBeVisible();
  await expect(page.locator('#adminPassword')).toBeVisible();
  await expect(page.getByRole('button', { name: '코호트 ZIP 다운로드' })).toBeHidden();
});

test('로그인 관리자는 현황·콘텐츠·ZIP 진입점을 확인한다', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/admin.html');
  await expect(page.getByText('3개의 콘텐츠')).toBeVisible();
  await expect(page.getByRole('cell', { name: '우리 동네 탄소 지도' })).toBeVisible();
  await expect(page.getByRole('button', { name: '코호트 ZIP 다운로드' })).toBeVisible();
  await expect(page.locator('#overviewTotal')).toHaveText('3개');

  await page.getByRole('button', { name: '코호트 ZIP 다운로드' }).click();
  await expect(page.getByRole('heading', { name: '코호트 ZIP 다운로드' })).toBeVisible();
  await expect(page.getByText(/이름·제목·버전/)).toBeVisible();
});
