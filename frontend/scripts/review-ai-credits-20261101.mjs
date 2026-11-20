import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const fx = JSON.parse(fs.readFileSync('/tmp/buzzer-ai-credit-review-fixtures.json', 'utf8'));
const out = path.resolve('../docs/ai-credits/independent-review-2026-11-01');
fs.mkdirSync(out, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
// Standalone scripts have no Playwright Test timeout policy.
const ctxs = [];
const record = (name, expected, actual, pass) => { results.push({ name, expected, actual, pass }); console.log(JSON.stringify(results.at(-1))); };
async function contextFor(key, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  ctx.setDefaultTimeout(12000);
  ctxs.push(ctx);
  await ctx.addInitScript((session) => {
    localStorage.setItem('auth-storage', JSON.stringify({ state: { token: session.token, user: session.user, isAuthenticated: true }, version: 0 }));
  }, fx.sessions[key]);
  return ctx;
}
async function api(route, method = 'GET', body) {
  const r = await fetch('http://localhost:3000/api' + route, {
    method,
    headers: { Authorization: `Bearer ${fx.sessions.platform.token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, json: await r.json() };
}
try {
  const manager = await contextFor('manager');
  const page = await manager.newPage();
  await page.goto('http://localhost:5173/ai-credits');
  await page.getByRole('button', { name: '用量统计', exact: true }).waitFor();
  record('Manager sees both configured packages', '68/2000 and 168/6800', await page.locator('body').innerText(), (await page.locator('body').innerText()).includes('6,800'));
  await page.screenshot({ path: path.join(out, 'manager-plans.png'), fullPage: true });
  await page.getByRole('button', { name: '用量统计', exact: true }).click();
  await page.getByText('剩余额度', { exact: false }).waitFor();
  const usageText = await page.locator('body').innerText();
  record('Campus page has recharge and per-task consumption details', 'recharge and task detail tables/entries', { rechargeDetails: /充值记录/.test(usageText), taskDetails: /消费明细|任务记录/.test(usageText) }, /充值记录/.test(usageText) && /消费明细|任务记录/.test(usageText));
  await page.screenshot({ path: path.join(out, 'manager-usage.png'), fullPage: true });
  const chipBefore = await page.locator('.bz-quota-chip').innerText();
  const beforeWallet = (await api('/ai-credits/admin/accounts')).json.data.find(x => x.id === fx.accountId);
  const target = String((beforeWallet.balanceMicros - beforeWallet.reservedMicros) / 10000 + 100);
  await api('/ai-credits/admin/adjust', 'POST', { accountId: fx.accountId, credits: 100, reason: '独立复核测试顶部余额同步', idempotencyKey: fx.accountId + '-chip-' + Date.now() });
  await page.getByRole('button').filter({ has: page.locator('svg[data-icon="reload"], span[aria-label="reload"]') }).last().click();
  await page.getByText('剩余额度', { exact: false }).filter({ hasText: target }).waitFor({ timeout: 10000 });
  const chipAfter = await page.locator('.bz-quota-chip').innerText();
  record('Quota chip updates when wallet refreshes', `chip and body both ${target}`, { chipBefore, chipAfter, bodyBalance: target }, chipAfter.includes(target));

  const unopened = await contextFor('managerC');
  const p2 = await unopened.newPage();
  await p2.goto('http://localhost:5173/ai-credits');
  await p2.getByRole('alert').waitFor();
  const unopenedText = await p2.locator('body').innerText();
  record('Unopened campus still sees package information', 'prices and unopened-state guidance', { serviceNotReady: unopenedText.includes('服务未就绪'), hasPackages: unopenedText.includes('基础包') && unopenedText.includes('进阶包') }, unopenedText.includes('基础包') && unopenedText.includes('进阶包'));
  await p2.screenshot({ path: path.join(out, 'unopened-campus.png'), fullPage: true });

  const platform = await contextFor('platform');
  const p3 = await platform.newPage();
  await p3.goto('http://localhost:5173/admin/ai-campuses');
  await p3.getByRole('heading', { name: '校区 AI 管理', exact: true }).waitFor();
  await p3.getByRole('row').filter({ hasText: '独立复核临时机构 · 复核 A 校区' }).waitFor();
  const btns = await p3.getByRole('button').allTextContents();
  record('Platform page can open a previously unopened campus', 'new campus open action or selector', { buttons: btns.filter(x => x.trim()), hasOpenAction: btns.some(x => /新增|开通校区|新建账户/.test(x)) }, btns.some(x => /新增|开通校区|新建账户/.test(x)));
  await p3.screenshot({ path: path.join(out, 'platform-accounts.png'), fullPage: true });
  await p3.getByRole('row').filter({ hasText: '独立复核临时机构 · 复核 A 校区' }).getByRole('button', { name: /停\s*用/ }).click();
  const scratchRow = p3.getByRole('row').filter({ hasText: '独立复核临时机构 · 复核 A 校区' });
  await scratchRow.getByRole('button', { name: '重新启用', exact: true }).waitFor();
  const requestPromise = p3.waitForRequest(r => r.url().endsWith('/ai-credits/admin/open') && r.method() === 'POST');
  await scratchRow.getByRole('button', { name: '重新启用', exact: true }).click();
  const req = await requestPromise;
  await p3.getByRole('row').filter({ hasText: '独立复核临时机构 · （机构级）' }).waitFor();
  const listed = await api('/ai-credits/admin/accounts');
  const original = listed.json.data.find(x => x.id === fx.accountId);
  record('Re-enable returns to same campus account', { campusId: fx.campuses.ca.id, originalStatus: 'active' }, { request: req.postDataJSON(), originalStatus: original.status, createdOrgLevelAccount: true }, original.status === 'active');
  await p3.screenshot({ path: path.join(out, 'reenable-wrong-account.png'), fullPage: true });
  await api('/ai-credits/admin/open', 'POST', { organizationId: fx.org.id, campusId: fx.campuses.ca.id });

  // Confirm mobile overflow on a real loaded wallet; do not mutate any business data.
  const mobile = await contextFor('manager', { width: 390, height: 844 });
  const p4 = await mobile.newPage();
  await p4.goto('http://localhost:5173/ai-credits');
  await p4.getByRole('button', { name: '用量统计', exact: true }).waitFor();
  await p4.getByRole('button', { name: '用量统计', exact: true }).click();
  const metrics = await p4.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  record('390px wallet page has no horizontal overflow', 'scrollWidth<=390', metrics, metrics.scrollWidth <= metrics.width);
  await p4.screenshot({ path: path.join(out, 'manager-mobile.png'), fullPage: true });
} catch (e) {
  record('Browser verification execution', 'complete', String(e.message), false);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ date: '2026-11-01', method: 'Playwright Chromium, real localhost frontend/backend; own temporary fixtures; no models', results }, null, 2));
  for (const ctx of ctxs) await ctx.close();
  await browser.close();
}
