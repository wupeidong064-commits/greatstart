/**
 * 蜂鸣功能验收 · 浏览器链路测试（真实前端 5173 + 真实后端 3000，无任何 mock）
 *
 * 前置：vite dev(5173) 与后端(3000) 运行中，测试数据已 init。
 * 用法：cd frontend && node scripts/acceptanceBrowser.mjs
 * 输出：e2e/artifacts/acceptance/*.png 截图 + 控制台断言结果（退出码 0=全过）
 */
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5173';
const EMAIL = process.env.ACCEPT_EMAIL || 'accept-admin@accept.buzzer.test';
const PW = process.env.ACCEPT_TEST_PASSWORD || '';
const ART = path.resolve(__dirname, '../e2e/artifacts/acceptance');
fs.mkdirSync(ART, { recursive: true });
if (!PW) { console.error('请设置 ACCEPT_TEST_PASSWORD'); process.exit(1); }

const results = [];
function rec(name, expected, actual, pass, note = '') {
  results.push({ name, expected, actual, pass, note });
  console.log(`${pass ? '✅' : '❌'} ${name} | 预期 ${expected} | 实际 ${actual}${note ? ' | ' + note : ''}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/邮箱|密码/).first().waitFor({ timeout: 15000 });
  // 登录表单：邮箱 + 密码两个输入框；提交按钮用精确匹配（避开"账号登录/验证码登录"模式切换）
  const inputs = page.locator('input');
  await inputs.nth(0).fill(EMAIL);
  await inputs.nth(1).fill(PW);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  // 登录成功后脱离 /login
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
}

async function tableRows(page) {
  await page.waitForSelector('.ant-table-row, .ant-empty', { timeout: 12000 });
  return page.locator('.ant-table-row').count();
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)); });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 150)));

  /* ---------- 1. 真实登录 ---------- */
  try {
    await login(page);
    rec('浏览器真实登录', '脱离 /login', page.url(), !page.url().includes('/login'));
    await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    rec('浏览器真实登录', '脱离 /login', '失败: ' + e.message.split('\n')[0], false);
    await browser.close(); process.exit(1);
  }

  /* ---------- 2. 首页四类提醒（暗色默认，文本断言适配新版工作台 DOM） ---------- */
  await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500); // 等 4 个数据源返回与渲染
  const homeText = await page.locator('body').innerText();
  const numAfter = (label, maxGap = 24) => {
    const m = homeText.match(new RegExp(label + `[\\s\\S]{0,${maxGap}}?(\\d+)`));
    return m ? m[1] : null;
  };
  rec('首页·低出勤班级', '2', numAfter('低出勤班级'), numAfter('低出勤班级') === '2');
  rec('首页·低出勤学员（入班前课次已剔除）', '6', numAfter('低出勤学员'), numAfter('低出勤学员') === '6');
  rec('首页·待续费（active+未标不续费）', '6', numAfter('待续费学员'), numAfter('待续费学员') === '6');
  rec('首页·体验课未成单', '4', numAfter('体验课未成单回访'), numAfter('体验课未成单回访') === '4');
  rec('首页·业务预警合计', '18', numAfter('业务预警'), numAfter('业务预警') === '18');
  const todayOk = /今日课表/.test(homeText) && /验收三班/.test(homeText);
  rec('首页·今日课表含当日班级', '含验收三班(周六 09:00)', todayOk ? '包含' : '缺失', todayOk);
  await page.screenshot({ path: path.join(ART, '01-home-dark.png'), fullPage: false });

  /* ---------- 3. 主题切换（日间） ---------- */
  await page.locator('button[aria-label*="日间"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ART, '02-home-light.png'), fullPage: false });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  rec('主题·日间背景为浅色', '非纯黑', bg, !/rgb\(0, ?0, ?0\)|#000/.test(bg), `body bg=${bg}`);
  await page.locator('button[aria-label*="夜间"]').click();
  await page.waitForTimeout(400);

  /* ---------- 4. 业务页数字 ---------- */
  const pages = [
    // [route, 名称, 期望行数(null=不校验), 必含文本, 说明]
    ['/attendances/low-attendance-classes', '低出勤班级页', 2, '验收三班|验收五班', ''],
    ['/students/low-attendance', '低出勤学员页', 6, '验收学员04', '分母已剔除入班前课次（基准日 10-31：E13 出窗后名单=B3+C3）'],
    ['/attendances/continuous-leave', '连续请假页(交互式)', null, '请选择时间范围', '名单数量已由 API 层验证=6'],
    ['/students/renewal', '待续费页(统一口径)', 6, '不续费学员', 'active+未标不续费+剩余≤10，与首页同口径；不含退费/流失学员'],
    ['/students', '学员列表', null, '验收学员', ''],
    ['/classes', '班级列表', 6, '验收一班', ''],
    ['/cashflow/summary', '现金流汇总', null, '4,800', '新签18单/续费¥4,800/退费¥2,400（金额含千分位）'],
    ['/cashflow/experience-schedule', '体验课排期', 10, '体验学员', ''],
    ['/cashflow/order-info', '成单列表', null, '验收学员', 'price.toFixed 修复后应正常渲染'],
    ['/attendances/honeymoon', '蜜月期出勤', null, '蜜月期|验收学员', ''],
  ];
  let shotIdx = 3;
  for (const [route, name, expectedRows, mustHave, note] of pages) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500); // 等真实接口返回与表格渲染
      const rows = await page.locator('.ant-table-row').count();
      const text = await page.locator('body').innerText();
      const has = new RegExp(mustHave).test(text);
      const pass = (expectedRows === null || rows === expectedRows) && has;
      rec(name, expectedRows === null ? `含「${mustHave}」` : `${expectedRows} 行 + 含「${mustHave}」`,
        `${rows} 行${has ? '' : '，关键词缺失'}`, pass, note);
      await page.screenshot({ path: path.join(ART, `${String(shotIdx).padStart(2, '0')}-${route.split('/').filter(Boolean).join('-')}.png`) });
    } catch (e) {
      rec(name, '正常打开', '异常: ' + e.message.split('\n')[0], false, note);
    }
    shotIdx++;
  }

  /* ---------- 4.5 数据说明（设置页，manager 专属） ---------- */
  try {
    await page.goto(`${BASE}/system/settings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: '数据说明' }).click();
    await page.waitForTimeout(1500);
    const ddText = await page.locator('body').innerText();
    const ddOk =
      ddText.includes('数据说明') && /资料生成时间/.test(ddText) &&
      ddText.includes('在读学员：27 人') && ddText.includes('在开班级：6 个') && ddText.includes('在职教师：3 人') &&
      ddText.includes('需要准确业务结果时，请回到系统查询') &&
      (await page.getByRole('button', { name: '复制资料' }).count()) === 1 &&
      (await page.getByRole('button', { name: '下载说明' }).count()) === 1;
    rec('数据说明页（设置 Tab）', '预览+复制+下载+快照时间', ddOk ? '完整' : '缺失', ddOk, '白名单内容由服务端组装，预览/复制/下载同源');
    await page.screenshot({ path: path.join(ART, 'data-description-desktop.png'), fullPage: true });
  } catch (e) {
    rec('数据说明页（设置 Tab）', '正常打开', '异常: ' + e.message.split('\n')[0], false);
  }

  /* ---------- 5. 家长视角 ---------- */
  const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ppage = await pctx.newPage();
  try {
    await ppage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    const pinputs = ppage.locator('input');
    await pinputs.nth(0).fill('accept-parent@accept.buzzer.test');
    await pinputs.nth(1).fill(PW);
    await ppage.getByRole('button', { name: '登录', exact: true }).click();
    await ppage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
    await ppage.waitForTimeout(2500);
    const pText = await ppage.locator('body').innerText();
    const onParentRoute = ppage.url().includes('/student/');
    const noOthers = !/验收学员02|验收学员15/.test(pText);
    rec('家长登录路由与隔离', '/student/* 且不见他人', `${ppage.url().replace(BASE, '')}${noOthers ? '' : '，越权可见❗'}`,
      onParentRoute && noOthers);
    // P0-02：家长直达 /ai 应被前端守卫拦截（权限受限，无经营数据）
    await ppage.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
    await ppage.waitForTimeout(1200);
    const aiText = await ppage.locator('body').innerText();
    const aiBlocked = aiText.includes('权限受限') && !aiText.includes('待处理预警') && !aiText.includes('在册学员');
    rec('家长直达 /ai 被拦截', '权限受限且无经营数据', aiBlocked ? '已拦截' : aiText.replace(/\s+/g, ' ').slice(0, 60), aiBlocked);
    await ppage.screenshot({ path: path.join(ART, '13-parent-view.png') });
  } catch (e) {
    rec('家长登录', '成功', '异常: ' + e.message.split('\n')[0], false);
  }
  await pctx.close();

  /* ---------- 6. 未捕获 JS 异常 ---------- */
  rec('无未捕获 JS 异常', '0', String(pageErrors.length), pageErrors.length === 0, pageErrors.slice(0, 2).join(' ; '));

  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n=== 浏览器链路 ${pass}/${results.length} 通过，截图目录 ${ART} ===`);
  fs.writeFileSync(
    path.join(ART, 'browser-evidence.json'),
    JSON.stringify({ time: new Date().toISOString(), pass, total: results.length, results }, null, 2),
    'utf-8'
  );
  process.exit(pass === results.length ? 0 : 2);
}

main().catch((e) => { console.error('执行异常:', e); process.exit(1); });
