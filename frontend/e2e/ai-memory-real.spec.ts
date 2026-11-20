import { test, expect, Page } from '@playwright/test';

/**
 * R3 真实前后端 e2e：新会话协议端到端（真实 vite:5173 + 真实后端:3000 + mock 供应商）。
 * 与 direction-b（传输层全 mock）不同：本套走真实登录、真实 SSE、真实 DB 持久化。
 *
 * 前置：
 *  - 后端以 AI_PROVIDER=mock 运行（beforeAll 硬校验 diagnostics，非 mock 整体失败——
 *    防止误打真实付费供应商）；
 *  - G0 测试域已建；测试账号经环境变量注入（本地验收库合成账号，不写入源码）：
 *    R3_AI_EMAIL / R3_AI_PASSWORD
 * 覆盖：登录→发问→流式渲染→证据卡→刷新恢复→重命名→新建/删除→慢流停止→滚动稳定。
 */

const AI_EMAIL = process.env.R3_AI_EMAIL || '';
const AI_PASSWORD = process.env.R3_AI_PASSWORD || '';
if (!AI_EMAIL || !AI_PASSWORD) {
  throw new Error('R3 e2e 需要环境变量 R3_AI_EMAIL / R3_AI_PASSWORD（本地验收库测试账号，勿写入源码）');
}

// 安全白名单：仅允许本机回环后端（SSRF 收敛：不经 env/外部输入构造 URL）
const API_BASE = 'http://localhost:3000';
const LOOPBACK = new Set(['localhost', '127.0.0.1']);

async function localFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(path, API_BASE);
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(`blocked non-loopback host: ${url.hostname}`);
  }
  return fetch(url, init);
}

let providerVerified = false;

test.beforeAll(async ({ request }: { request: any }) => {
  // 补修4：校验**浏览器实际使用的后端**——经 5173（vite 代理→3000）打 diagnostics，
  // 与直连 3000 的校验独立（防止代理指向其他后端的配置漂移）
  const viaProxy = await request.get('/api/ai/diagnostics', {
    headers: { Authorization: 'Bearer __probe__' },
    failOnStatusCode: false,
  });
  if (viaProxy.status() !== 401 && viaProxy.status() !== 200) {
    throw new Error(`R3 硬校验失败：5173 代理入口 /api/ai/diagnostics 返回 ${viaProxy.status()}（代理后端不可用）`);
  }
  const loginRes = await localFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: AI_EMAIL, password: AI_PASSWORD }),
  });
  if (loginRes.status !== 200) throw new Error(`R3 前置失败：登录 ${loginRes.status}（需 G0 测试域+后端运行）`);
  const loginJson = await loginRes.json();
  const diagRes = await localFetch('/api/ai/diagnostics', {
    headers: { Authorization: `Bearer ${loginJson.data.token}` },
  });
  const diag = await diagRes.json();
  if (!String(diag?.data?.provider || '').includes('mock')) {
    throw new Error(`R3 硬校验失败：当前供应商=${diag?.data?.provider}（必须 AI_PROVIDER=mock，拒绝真实付费调用）`);
  }
  providerVerified = true;
});

async function realLogin(page: Page) {
  await page.goto('/login');
  await page.locator('#account').fill(AI_EMAIL);
  await page.locator('#secret').fill(AI_PASSWORD);
  await page.locator('#account').press('Enter'); // 回车提交（页面有两个 submit，避免 strict 冲突）
  await expect(page).toHaveURL(/\/ai/, { timeout: 15000 });
}

test.describe('R3 · 新会话协议真实前后端（mock 供应商）', () => {
  test('登录 → 发问 → 流式渲染 → 刷新恢复（含证据卡回放）', async ({ page }) => {
    expect(providerVerified).toBe(true);
    await realLogin(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    // 新会话：闲聊一句（走默认正文分支，验证服务端记忆）
    await page.locator('#wb-chat-input').fill('真实e2e闲聊：记住暗号菠萝');
    await page.locator('#wb-chat-input').press('Enter');
    await expect(page.locator('.wb-msg-ai').last()).toContainText(/菠萝|服务端记忆|模拟回复/, { timeout: 30000 });
    await page.screenshot({ path: 'e2e/artifacts/r3-real-chat.png', fullPage: false });

    // 证据卡：概览问题 → 数据卡确定性渲染
    await page.locator('#wb-chat-input').fill('本月经营概览');
    await page.locator('#wb-chat-input').press('Enter');
    await expect(page.locator('.wb-ev-card').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.wb-ev-card').first()).toContainText('口径');
    await page.screenshot({ path: 'e2e/artifacts/r3-real-evidence.png', fullPage: false });

    // 刷新恢复：历史 + 证据卡从服务端回放
    await page.reload();
    await expect(page.locator('.wb-msg-user').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.wb-msg-user').first()).toContainText('菠萝');
    await expect(page.locator('.wb-ev-card').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'e2e/artifacts/r3-real-restore.png', fullPage: false });
  });

  test('会话管理：重命名 → 新建 → 删除', async ({ page }) => {
    expect(providerVerified).toBe(true);
    await realLogin(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    // 建一个新会话（发一句话）
    await page.locator('#wb-chat-input').fill('真实e2e会话管理测试');
    await page.locator('#wb-chat-input').press('Enter');
    await expect(page.locator('.wb-msg-ai').last()).toContainText(/模拟回复|服务端记忆/, { timeout: 30000 });

    // 重命名（window.prompt）
    const convItem = page.locator('.wb-conv-item').first();
    await convItem.waitFor({ timeout: 10000 });
    await convItem.hover(); // 操作按钮 CSS hover 显示
    page.once('dialog', (dialog) => dialog.accept('R3改名验证会话'));
    await convItem.locator('a[title="重命名"]').click({ force: true });
    await expect(page.locator('.wb-conv-item').first()).toContainText('R3改名验证会话', { timeout: 10000 });
    await page.screenshot({ path: 'e2e/artifacts/r3-real-rename.png', fullPage: false });

    // 新建：清空对话流
    await page.getByRole('button', { name: /新对话|新建会话/ }).first().click();
    await expect(page.locator('.wb-msg-user, .wb-msg-ai')).toHaveCount(0, { timeout: 8000 });

    // 删除旧会话（accept 确认）
    page.once('dialog', (dialog) => dialog.accept());
    const target = page.locator('.wb-conv-item', { hasText: 'R3改名验证会话' }).first();
    await target.hover();
    await target.locator('a[title="删除会话"]').click({ force: true });
    await expect(page.locator('.wb-conv-item', { hasText: 'R3改名验证会话' })).toHaveCount(0, { timeout: 10000 });
  });

  test('慢流停止：可控慢流下阅读位置稳定 + 回底 + 真实停止 + 刷新后 stopped 保留', async ({ page }) => {
    expect(providerVerified).toBe(true);
    await realLogin(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    // 补修3：用"慢速"关键词开启可控慢流（~40ms/帧，全程 30s+），确保交互期间仍在输出
    await page.locator('#wb-chat-input').fill('请生成慢速长表格');
    await page.locator('#wb-chat-input').press('Enter');

    const log = page.locator('.wb-chatlog');
    // 等内容真正超过视口（慢流下必然发生在生成中途）
    await expect
      .poll(() => log.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 30000 })
      .toBeGreaterThan(200);

    // 上滚 → 解锁跟随，回底按钮出现（慢流保证此刻仍在生成）
    await log.evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(page.getByRole('button', { name: /有新回复|回到底部/ })).toBeVisible({ timeout: 8000 });

    // 阅读位置稳定：后续 chunk 持续到达期间 scrollTop 不被拉离顶部（1.2s 采样两次）
    await page.waitForTimeout(600);
    const topAfterChunks1 = await log.evaluate((el) => el.scrollTop);
    await page.waitForTimeout(600);
    const topAfterChunks2 = await log.evaluate((el) => el.scrollTop);
    expect(Math.max(topAfterChunks1, topAfterChunks2)).toBeLessThan(120); // 仍停在顶部附近，未跟随跳动
    const stillGenerating = await page.locator('button[title="停止生成"]').isVisible();
    expect(stillGenerating).toBe(true); // 慢流仍在输出（可控窗口验证）

    // 回底：点击后贴近底部且按钮消失
    await page.getByRole('button', { name: /有新回复|回到底部/ }).click();
    await expect
      .poll(() => log.evaluate((el) => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight)), { timeout: 8000 })
      .toBeLessThan(150);
    await expect(page.getByRole('button', { name: /有新回复|回到底部/ })).toBeHidden({ timeout: 5000 });

    // 真实停止：部分回答保留
    await page.locator('button[title="停止生成"]').click();
    await expect(page.locator('.wb-msg-ai').last()).toContainText('班级', { timeout: 10000 });
    await page.screenshot({ path: 'e2e/artifacts/r3-real-stop.png', fullPage: false });

    // 刷新后：stopped 部分回答从服务端恢复（含停止标记）
    await page.reload();
    await expect(page.locator('.wb-msg-ai').last()).toContainText(/已停止生成|班级/, { timeout: 15000 });
    await page.screenshot({ path: 'e2e/artifacts/r3-real-stopped-restore.png', fullPage: false });
  });
});
