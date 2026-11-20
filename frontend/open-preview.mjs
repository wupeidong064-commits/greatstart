// 为用户打开已登录的预览窗口：停在周课表页，浏览器保持打开
import { chromium } from 'playwright';

const b = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/login');
await p.fill('#account', 'schedule-qa-1793512505517@accept.buzzer.test');
await p.fill('#secret', 'Schedule-QA-2026!');
await p.getByRole('button', { name: '登录', exact: true }).click();
await p.waitForURL(/\/ai/, { timeout: 15000 });
await p.goto('http://localhost:5173/operation/weekly-schedule');
// 停在列表视图：今日两节课（09:00 / 10:00）可直接点「划课」看修复效果
await p.getByRole('tab', { name: '列表视图' }).click();
await p.bringToFront();
console.log('预览窗口已打开：周课表（列表视图，今日 11-01 两节课）');
// 保持进程驻留，浏览器不关闭
await new Promise(() => {});
