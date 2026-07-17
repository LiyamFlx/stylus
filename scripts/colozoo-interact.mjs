// Interaction smoke test (collapsed-chrome layout): fill dots, draw, erase, undo.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(1200);
await page.locator('button', { hasText: /ColoZoo/ }).last().click({ force: true });
await page.locator('img[alt="colozoo"]').waitFor({ timeout: 8000 });
await page.waitForTimeout(1500);

// Tap dots on the truck body (red).
for (const [x, y] of [[500, 315], [545, 315], [620, 315], [500, 435], [545, 435]]) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(120);
}
// Open the collapsed Colors panel, pick Blue (panel auto-closes), dab wheels.
await page.getByRole('button', { name: 'Colors' }).click();
await page.getByRole('button', { name: 'Blue', exact: true }).click();
await page.waitForTimeout(300);
await page.mouse.click(340, 610);
await page.mouse.click(300, 645);
// Freehand stroke.
await page.mouse.move(520, 500);
await page.mouse.down();
for (let i = 0; i <= 20; i++) {
  await page.mouse.move(520 + i * 9, 500 + Math.sin(i / 3) * 18, { steps: 2 });
}
await page.mouse.up();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cz-interact-1.png' });

// Eraser: clear one dot; then undo the erase and the stroke.
await page.getByRole('button', { name: 'Eraser' }).click();
await page.mouse.click(500, 315);
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Undo' }).click();
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cz-interact-2.png' });
console.log('interaction shots done');
await browser.close();
