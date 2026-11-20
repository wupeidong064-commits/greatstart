import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.use({
  viewport: { width: 1440, height: 900 },
  launchOptions: {
    args: ['--autoplay-policy=document-user-activation-required', '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies'],
    ignoreDefaultArgs: ['--autoplay-policy=no-user-gesture-required'],
  },
});

test('严格自动播放限制下，无点击也能绘制两侧并定格', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const protocol = await page.context().newCDPSession(page);
  // Playwright evaluate/locator reads may set userGesture=true. Read through CDP
  // without activation, otherwise the test itself can accidentally unblock autoplay.
  const read = async (expression: string) => {
    const result = await protocol.send('Runtime.evaluate', {
      expression, userGesture: false, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await page.goto('/login');
  expect(await read('navigator.userActivation.hasBeenActive')).toBe(false);
  expect(await read('(async () => { const context = new AudioContext(); const state = context.state; await context.close(); return state; })()')).toBe('suspended');
  await expect.poll(() => read('Number(document.querySelector("[data-imprint-frame]")?.getAttribute("data-imprint-frame"))'), { timeout: 10000 }).toBeGreaterThan(30);
  expect(await read('Number(document.querySelector("[data-imprint-part=schedule] > rect")?.getAttribute("stroke-dashoffset"))')).toBeLessThan(1);
  expect(await read('Number(document.querySelector("[data-imprint-part=teaching] > g")?.getAttribute("opacity"))')).toBeGreaterThan(0);
  await expect.poll(() => read('document.querySelector("[data-imprint-state]")?.getAttribute("data-imprint-state")'), { timeout: 10000 }).toBe('settled');
  expect(await read('document.querySelector("[data-imprint-frame]")?.getAttribute("data-imprint-frame")')).toBe('119');
  expect(await read('document.querySelectorAll(".__remotion-player").length')).toBe(0);
  expect(await read('navigator.userActivation.hasBeenActive')).toBe(false);
  const finalMarkup = await read('document.querySelector("#login-imprint").innerHTML');
  await page.waitForTimeout(1200);
  expect(await read('document.querySelector("#login-imprint").innerHTML')).toBe(finalMarkup);
  expect(await read('navigator.userActivation.hasBeenActive')).toBe(false);
  expect(errors).toEqual([]);
  fs.mkdirSync(path.resolve('e2e/artifacts/login-production'), { recursive: true });
  await page.screenshot({ path: 'e2e/artifacts/login-production/autoplay-restricted.png' });
});

test('减少动态效果时直接显示两侧末帧，保留登录交互', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await expect(page.locator('[data-imprint-state="settled"]')).toBeVisible();
  await expect(page.locator('[data-imprint-frame]')).toHaveAttribute('data-imprint-frame', '119');
  await expect(page.locator('.__remotion-player')).toHaveCount(0);
  await expect(page.locator('#slogan')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: '验证码登录', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '短信验证码', exact: true })).toBeVisible();
});
