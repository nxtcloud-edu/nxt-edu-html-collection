const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockAdminApi, mockPublicApi } = require('./fixtures');

async function assertQuality(page, testInfo, name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} 가로 오버플로`).toBeLessThanOrEqual(1);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  await testInfo.attach(`axe-${name}`, { body: Buffer.from(JSON.stringify(result.violations, null, 2)), contentType: 'application/json' });
  expect(result.violations.filter((item) => ['critical', 'serious'].includes(item.impact)), `${name} critical/serious violations`).toEqual([]);
}

test('공개 핵심 화면은 시각·접근성·모바일 품질 게이트를 지킨다', async ({ page }, testInfo) => {
  await mockPublicApi(page);
  for (const [name, url] of [['gallery', '/'], ['upload', '/upload.html'], ['viewer', '/view.html?id=a0000001']]) {
    await page.goto(url);
    await page.locator('iframe').evaluateAll((frames) => frames.forEach((frame) => { frame.style.visibility = 'hidden'; }));
    await assertQuality(page, testInfo, name);
    await expect(page).toHaveScreenshot(`${name}.png`, { animations: 'disabled', caret: 'hide', fullPage: false, maxDiffPixelRatio: 0.015 });
  }
});

test('관리자 핵심 화면은 시각·접근성·모바일 품질 게이트를 지킨다', async ({ page }, testInfo) => {
  await mockAdminApi(page);
  await page.goto('/admin.html');
  for (const [name, button] of [['admin-dashboard', null], ['admin-contents', /콘텐츠$/], ['admin-cohorts', /코호트$/], ['admin-exports', /내보내기$/], ['admin-system', /감사·시스템$/]]) {
    if (button) await page.getByRole('button', { name: button }).click();
    await assertQuality(page, testInfo, name);
    if (name === 'admin-dashboard') await expect(page).toHaveScreenshot(`${name}.png`, { animations: 'disabled', caret: 'hide', fullPage: false, maxDiffPixelRatio: 0.015 });
  }
});
