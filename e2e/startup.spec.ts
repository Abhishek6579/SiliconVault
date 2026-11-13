import { expect, test } from '@playwright/test';

test('records cold browser startup and JavaScript heap metrics', async ({ page }) => {
  // This benchmark measures DOM readiness; waiting for every resource's load event is unnecessary and can hang on long-lived assets.\n  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Your work, in one place.' })).toBeVisible();
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paint = performance.getEntriesByType('paint');
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    return {
      responseStartMs: navigation ? Number(navigation.responseStart.toFixed(2)) : null,
      domContentLoadedMs: navigation ? Number(navigation.domContentLoadedEventEnd.toFixed(2)) : null,
      loadEventMs: navigation ? Number(navigation.loadEventEnd.toFixed(2)) : null,
      firstContentfulPaintMs: Number((paint.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? 0).toFixed(2)),
      usedJsHeapBytes: memory?.usedJSHeapSize ?? null,
      totalJsHeapBytes: memory?.totalJSHeapSize ?? null,
    };
  });
  console.log('SILICON_VAULT_STARTUP_BENCHMARK', JSON.stringify(metrics));
  expect(metrics.domContentLoadedMs).not.toBeNull();
  expect(metrics.domContentLoadedMs).toBeGreaterThan(0);
});
