const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockPublicApi } = require('./fixtures');

test('Phase 16 앱 셸은 갤러리와 기존 후속 URL의 접근성 계약을 유지한다', async ({ page }, testInfo) => {
  await mockPublicApi(page);
  await page.goto('/app/');

  await expect(page.getByRole('heading', { name: 'AI와 함께 만든 우리들의 콘텐츠' })).toBeVisible();
  await expect(page.getByRole('link', { name: '내 콘텐츠 업로드' })).toHaveAttribute('href', '/upload.html');
  await expect(page.getByText('12개의 콘텐츠')).toBeVisible();
  await expect(page.getByLabel('콘텐츠가 많은 수업 상위 5개')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, '갤러리 셸 가로 오버플로').toBeLessThanOrEqual(1);

  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  await testInfo.attach('axe-app-shell', {
    body: Buffer.from(JSON.stringify(result.violations, null, 2)),
    contentType: 'application/json',
  });
  expect(result.violations.filter((item) => item.impact === 'critical')).toEqual([]);
});
