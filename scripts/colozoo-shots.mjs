// Screenshot ColoZoo at three widths for v3 verification.
import { chromium } from '@playwright/test';

const SIZES = [
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'tablet-834', width: 834, height: 1112 },
  { name: 'phone-390', width: 390, height: 844 },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const s of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  // dismiss any first-run dialog by pressing Escape, then enter ColoZoo
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1500);
  const tab = page.locator('button', { hasText: /ColoZoo/ }).last();
  await tab.click({ timeout: 8000, force: true });
  await page.locator('img[alt="colozoo"]').waitFor({ timeout: 8000 }).catch(() => console.log(`${s.name}: wordmark never appeared`));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `/tmp/cz-${s.name}.png` });
  console.log(`${s.name} done`);
  await ctx.close();
}
await browser.close();
