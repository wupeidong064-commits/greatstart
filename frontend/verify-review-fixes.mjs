// 复核五项修复的真实链路验证（5173 前端 → 3000 后端 → 本地 PG）
// 用法：cd frontend && node verify-review-fixes.mjs
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const EMAIL = 'schedule-qa-1793512505517@accept.buzzer.test';
const PASSWORD = 'Schedule-QA-2026!';
const OUT = '../docs/schedule-ledger';
const CAMPUS = 'ea971897-58ea-443f-ac00-4a9dbe510190';
const results = [];
const shots = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const sql = (q) => execSync(`psql -h localhost -U buzzer -d buzzer -tAc ${JSON.stringify(q)}`, { env: { ...process.env, PGPASSWORD: 'buzzer' } }).toString().trim();

const dbStudents = () => JSON.parse(sql(
  `SELECT json_object_agg(name, json_build_object('r', "remainingLessons", 'c', "consumedLessons")) FROM students WHERE "campusId"='${CAMPUS}'`));
const dbLogs = (sid) => sql(`SELECT count(*) FROM lesson_logs WHERE "scheduleId"='${sid}'`);
const S9 = '7f312214-2a84-4e5f-9aa6-027da45c810a';   // 今日 09:00
const S10 = '0ce8f448-5001-4534-b836-4cc53c04a229';  // 今日 10:00

const batchBodies = [];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('request', (req) => { if (req.url().includes('/attendances/batch')) batchBodies.push({ url: req.url(), body: req.postDataJSON() }); });

try {
  // 登录（真实账号，走 3000 真实后端）
  await page.goto(`${BASE}/login`);
  await page.fill('#account', EMAIL);
  await page.fill('#secret', PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/\/ai|\/student/, { timeout: 15000 });
  check('真实登录（5173→3000）', true, page.url());

  const baseline = dbStudents();
  const logs9Before = Number(dbLogs(S9));

  await page.goto(`${BASE}/operation/weekly-schedule`);
  await page.getByRole('tab', { name: '列表视图' }).click();
  await page.waitForSelector('.ant-table-row');
  const todayRows = page.getByRole('row').filter({ hasText: '11-01' });
  const row9 = todayRows.filter({ hasText: '09:00' });
  const row10 = todayRows.filter({ hasText: '10:00 - 11:00' });
  await page.waitForTimeout(500);
  check('今日两节课可见', await row9.count() === 1 && await row10.count() === 1, `row9=${await row9.count()} row10=${await row10.count()} today=${await todayRows.count()}（10:00 行含结束时间以免与 09:00-10:00 行混淆）`);

  // ===== A. 打开已签到场次：未修改学员不提交、预览无变更、提交禁用（幂等入口正确）=====
  await row9.getByRole('button', { name: /划课/ }).click();
  await page.waitForSelector('.attendance-dialog .ant-table-row');
  await page.waitForFunction(() => document.querySelectorAll('.attendance-dialog .ant-table-row').length === 5);
  const dialog = page.locator('.attendance-dialog');
  const rowOf = (name) => dialog.getByRole('row').filter({ hasText: name });
  const pickOption = async (title) => {
    await page.waitForTimeout(250);
    const opt = page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) [title="${title}"]`).last();
    try { await opt.click({ timeout: 4000 }); }
    catch { await opt.click({ force: true }); }
  };
  await page.waitForFunction(() => document.querySelector('.attendance-dialog')?.textContent?.includes('已保存'));
  check('A-旧状态回显（迟到/出勤=已保存）', await rowOf('课消验收0').getByText('已保存').count() >= 1 && await rowOf('课消验收1').getByText('已保存').count() >= 1);
  const previewA = await dialog.textContent();
  check('A-预览显示无待提交变更', previewA.includes('没有待提交的变更'), previewA.match(/没有待提交的变更[^\n"]*/)?.[0]?.slice(0, 60));
  const submitDisabled = await dialog.getByRole('button', { name: '确认提交' }).isDisabled();
  check('A-提交按钮禁用（无变更不提交）', submitDisabled);
  await page.screenshot({ path: `${OUT}/step3-fixA-idempotent-open.png`, fullPage: false });

  // ===== B. 仅提交被修改学员：迟到→请假 预计返还 1，请求体不含未修改学员 =====
  await rowOf('课消验收0').locator('.ant-select').click();
  await pickOption('请假');
  await page.waitForTimeout(150);
  const previewB = await dialog.textContent();
  check('B-预览=1人请假+预计返还1', /本次提交\s*1\s*人/.test(previewB) && previewB.includes('预计返还') && /返还\s*1/.test(previewB), '本次提交1人/预计返还1课时');
  await page.screenshot({ path: `${OUT}/step3-fixB-refund-preview.png`, fullPage: false });
  const bodiesBefore = batchBodies.length;
  await dialog.getByRole('button', { name: '确认提交' }).click();
  await page.waitForSelector('.ant-message-success', { timeout: 10000 });
  const msgB = (await page.locator('.ant-message-success').first().textContent()) || '';
  check('B-保存反馈=返还1', msgB.includes('返还 1'), msgB);
  const bodyB = batchBodies[bodiesBefore]?.body;
  const stu0Id = sql(`SELECT id FROM students WHERE "campusId"='${CAMPUS}' AND name='课消验收0'`);
  const stu1Id = sql(`SELECT id FROM students WHERE "campusId"='${CAMPUS}' AND name='课消验收1'`);
  const entriesB = bodyB?.entries || [];
  check('B-请求体只含被修改学员1条', entriesB.length === 1 && entriesB[0].studentId === stu0Id && entriesB[0].status === 'leave', JSON.stringify(entriesB));
  check('B-未修改学员(课消验收1)不在请求体', !entriesB.some((e) => e.studentId === stu1Id));
  const afterB = dbStudents();
  check('B-DB返还+1（9→10）', afterB['课消验收0'].r === baseline['课消验收0'].r + 1, `${baseline['课消验收0'].r}→${afterB['课消验收0'].r}`);
  check('B-回填后已保存（待提交消失）', (await rowOf('课消验收0').getByText('已保存').count()) >= 1 && (await rowOf('课消验收0').getByText('待提交').count()) === 0);
  check('B-余额回填10', (await rowOf('课消验收0').textContent()).includes('10'));

  // ===== C. 请假→迟到 恢复扣课（往返对账）=====
  await rowOf('课消验收0').locator('.ant-select').click();
  await pickOption('迟到');
  await page.waitForTimeout(150);
  const previewC = await dialog.textContent();
  check('C-预览=预计扣课1', /预计扣课/.test(previewC) && /扣课\s*1/.test(previewC));
  await dialog.getByRole('button', { name: '确认提交' }).click();
  await page.waitForTimeout(1200);
  const afterC = dbStudents();
  check('C-DB再扣1（10→9，回到基线）', afterC['课消验收0'].r === baseline['课消验收0'].r, `${afterC['课消验收0'].r}`);
  check('C-其他学员余额未被触碰', afterC['课消验收1'].r === baseline['课消验收1'].r && afterC['课消验收2'].r === baseline['课消验收2'].r);

  // ===== D. 余额不足：预警+整批失败保留选择+恢复已保存状态 =====
  await rowOf('课消验收4').locator('.ant-select').click();
  await pickOption('出勤');
  await rowOf('课消验收0').locator('.ant-select').click();
  await pickOption('缺勤');
  await page.waitForTimeout(200);
  const alertText = await dialog.textContent();
  check('D-不足预警点名课消验收4', alertText.includes('剩余课时不足') && alertText.includes('课消验收4'));
  await page.screenshot({ path: `${OUT}/step3-fixD-insufficient.png`, fullPage: false });
  const bodiesBeforeD = batchBodies.length;
  await dialog.getByRole('button', { name: '确认提交' }).click();
  await page.waitForSelector('.ant-message-error', { timeout: 10000 });
  const errD = (await page.locator('.ant-message-error').first().textContent()) || '';
  check('D-服务端整批拒绝(409)', errD.includes('课时不足'), errD.slice(0, 60));
  const afterD = dbStudents();
  check('D-DB零变动（原子回滚）', afterD['课消验收0'].r === baseline['课消验收0'].r && afterD['课消验收4'].r === baseline['课消验收4'].r);
  check('D-失败后选择保留（待提交仍在）', (await rowOf('课消验收4').getByText('待提交').count()) >= 1);
  await dialog.getByRole('button', { name: '恢复已保存状态' }).click();
  await page.waitForTimeout(200);
  check('D-恢复已保存状态清空变更', (await dialog.textContent()).includes('没有待提交的变更'));

  // ===== E. 快速切换场次：旧名单不覆盖新名单 =====
  await dialog.getByRole('button', { name: '取 消' }).click().catch(async () => { await dialog.getByRole('button', { name: '取消' }).click(); });
  await page.waitForTimeout(100);
  await row10.getByRole('button', { name: /划课/ }).click();
  await page.waitForSelector('.attendance-dialog .ant-table-row');
  await page.waitForFunction(() => document.querySelectorAll('.attendance-dialog .ant-table-row').length === 5 && document.querySelector('.attendance-dialog')?.textContent?.includes('已保存'));
  const text10 = await dialog.textContent();
  check('E-10:00场次名单=本人场数据', text10.includes('课消验收1') && (await rowOf('课消验收2').locator('.ant-select-selection-item').textContent()) === '请假', '验收2=请假（10:00 专属）');
  check('E-无09:00旧状态残留（验收0=跳过）', (await rowOf('课消验收0').locator('.ant-select-selection-item').textContent()) === '跳过');
  await page.screenshot({ path: `${OUT}/step3-fixE-switch-roster.png`, fullPage: false });
  await dialog.getByRole('button', { name: '取 消' }).click().catch(async () => { await dialog.getByRole('button', { name: '取消' }).click(); });

  // 快速切换周：下一周→本周 连点（antd 两字按钮会渲染成「本 周」，用正则匹配）
  await page.getByRole('button', { name: '下一周' }).click();
  await page.getByRole('button', { name: /本\s*周/ }).click();
  await page.waitForTimeout(900);
  await page.getByRole('tab', { name: '日历视图' }).click();
  const sundayCol = page.locator('.ant-card').filter({ hasText: '周日' });
  check('E-快速切周后今日仍2节课', (await sundayCol.textContent()).includes('共 2 节课'));

  // ===== F. 班级出勤统计衔接（今日两节课计入）=====
  await page.goto(`${BASE}/attendances`);
  await page.waitForSelector('.ant-table-row');
  const statsRow = page.getByRole('row').filter({ hasText: '真实场次验收班' });
  const statsText = await statsRow.textContent();
  check('F-排课次数=2', statsText.includes('2 次'), statsText.match(/\d+ 次/)?.[0]);
  check('F-应到10/实到3/出勤率30%', statsText.includes('3 / 10') && statsText.includes('30%'), (statsText.match(/\d+ \/ \d+/) || [])[0] + ' / ' + (statsText.match(/\d+%/g) || []).join(','));
  await page.screenshot({ path: `${OUT}/step3-fixF-class-stats.png`, fullPage: false });

  // 最终对账
  const finalStudents = dbStudents();
  const logs9After = Number(dbLogs(S9));
  const allMatch = Object.keys(baseline).every((k) => finalStudents[k].r === baseline[k].r);
  check('Z-全量余额对账回到基线', allMatch, JSON.stringify(finalStudents));
  check('Z-09:00流水新增2条（返还+再扣）', logs9After === logs9Before + 2, `${logs9Before}→${logs9After}`);
  const untouchedIds = ['课消验收1', '课消验收2', '课消验收3'].map((n) => sql(`SELECT id FROM students WHERE "campusId"='${CAMPUS}' AND name='${n}'`));
  const entryCounts = batchBodies.map((b) => (b.body?.entries || []).length).join(',');
  const onlyModified = batchBodies.every((b) => (b.body?.entries || []).every((e) => !untouchedIds.includes(e.studentId)));
  check('Z-批量请求只含被修改学员（B1条/C1条/D2条，未动学员从未出现）', onlyModified && entryCounts === '1,1,2', `${batchBodies.length} 次提交 entries=[${entryCounts}]`);
} catch (e) {
  check('脚本异常中断', false, String(e).slice(0, 300));
  await page.screenshot({ path: `${OUT}/step3-fix-ERROR.png` }).catch(() => {});
} finally {
  fs.writeFileSync(`${OUT}/step3-review-fixes.json`, JSON.stringify({ at: new Date().toISOString(), backend: 'http://localhost:3000 (tsx watch)', frontend: BASE, campus: '课消验收校区(QA)', results, batchBodies }, null, 2));
  await browser.close();
}
const pass = results.filter((r) => r.ok).length;
console.log(`\n===== ${pass}/${results.length} 通过 =====`);
process.exit(pass === results.length ? 0 : 1);
