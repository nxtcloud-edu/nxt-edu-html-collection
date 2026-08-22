const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('Phase 14 앱 셸은 기존 URL과 접근성 계약을 유지한다', async ({ page }, testInfo) => {
  await page.goto('/app/');

  await expect(page.getByRole('heading', { name: /콘텐츠가 쌓일수록/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '현재 갤러리 보기' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: '업로드', exact: true })).toHaveAttribute('href', '/upload.html');
  await expect(page.getByRole('link', { name: '관리자', exact: true })).toHaveAttribute('href', '/admin.html');
  await expect(page.getByText('283', { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, '앱 셸 가로 오버플로').toBeLessThanOrEqual(1);

  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  await testInfo.attach('axe-app-shell', {
    body: Buffer.from(JSON.stringify(result.violations, null, 2)),
    contentType: 'application/json',
  });
  expect(result.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});
