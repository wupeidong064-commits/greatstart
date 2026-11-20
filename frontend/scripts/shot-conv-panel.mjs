/**
 * 会话面板截图（亮/暗双主题）——r5 按钮精致化验收用。
 * 用法：cd frontend && node scripts/shot-conv-panel.mjs
 * 依赖 @playwright/test 的 chromium（复用项目依赖，不额外安装）。
 * 造数：登录测试号后发一句闲聊建立会话，保证面板有真实列表可截。
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const EMAIL = process.env.R3_AI_EMAIL || 'g0-a1@g0.local';
const PASSWORD = process.env.R3_AI_PASSWORD || 'G0test#2026';
const OUT_DIR = path.resolve(process.cwd(), 'e2e/artifacts');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 本机装的是 1243 等 headless shell（项目 playwright 期望 1208 未装），直接指到现有二进制
const SHELL = '/Users/wupeidong/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch(
  fs.existsSync(SHELL) ? { executablePath: SHELL } : {}
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 登录
await page.goto(`${BASE}/login`);
await page.locator('#account').fill(EMAIL);
await page.locator('#secret').fill(PASSWORD);
await page.locator('#account').press('Enter');
await page.waitForURL(/\/ai/, { timeout: 15000 });

// 造一条会话数据（闲聊走默认正文分支，mock 供应商零费用）
await page.locator('#wb-chat-input').fill('截图造数：面板验收');
await page.locator('#wb-chat-input').press('Enter');
await page.locator('.wb-msg-ai').last().waitFor({ timeout: 20000 });

// 等会话列表刷新出现条目
await page.locator('.wb-conv-item').first().waitFor({ timeout: 10000 }).catch(() => {});

const block = page.locator('.wb-side .wb-block').first();
await block.scrollIntoViewIfNeeded();

// 亮色：整块 + 按钮特写
await block.screenshot({ path: path.join(OUT_DIR, 'r5-conv-panel-light.png') });
const btn = page.locator('.wb-btn-new-chat');
await btn.hover();
await page.waitForTimeout(250);
await block.screenshot({ path: path.join(OUT_DIR, 'r5-conv-panel-light-hover.png') });

// 暗色：项目主题钮在顶栏（aria-label 含 主题/暗色），找不到则跳过
const themeBtn = page.locator('button[aria-label*="模式"]').first();
if (await themeBtn.count()) {
  await themeBtn.click();
  await page.waitForTimeout(400);
  await block.screenshot({ path: path.join(OUT_DIR, 'r5-conv-panel-dark.png') });
}

await browser.close();
console.log('OK ->', OUT_DIR);
