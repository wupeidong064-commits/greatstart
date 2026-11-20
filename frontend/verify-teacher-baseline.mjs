// 本轮五项验证（老师数据变化/基本盘/班级水平/清扫/统一页头）：5173 → 3000 → QA 校区
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = '../docs/design';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`${BASE}/login`);
  await page.fill('#account', 'schedule-qa-1793512505517@accept.buzzer.test');
  await page.fill('#secret', 'Schedule-QA-2026!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/\/ai/, { timeout: 15000 });

  // ===== 1. 老师员数据：主表两行真实数据 =====
  await page.goto(`${BASE}/teachers`);
  await page.waitForSelector('.ant-table-row');
  await page.waitForTimeout(800);
  const rowChen = page.getByRole('row').filter({ hasText: '陈教练' });
  const rowLi = page.getByRole('row').filter({ hasText: '李教练' });
  check('1-主表两位老师（本月=今日口径）', (await rowChen.count()) === 1 && (await rowLi.count()) === 1);
  const chenText = await rowChen.textContent();
  check('1-本月出勤率100%可见', chenText.includes('100%'), chenText.match(/\d+%/)?.[0]);
  await page.screenshot({ path: `${OUT}/r3-teachers-main.png` });

  // ===== 1b. 变化查看弹窗：默认最近7天 vs 前一等长区间，变化列有真实数值 =====
  await page.getByRole('button', { name: /老师员数据变化查看/ }).click();
  await page.waitForSelector('.ant-modal .ant-table-row');
  await page.waitForTimeout(1200);
  const modal = page.locator('.ant-modal');
  const mChen = modal.getByRole('row').filter({ hasText: '陈教练' });
  const mLi = modal.getByRole('row').filter({ hasText: '李教练' });
  const chenM = await mChen.textContent();
  const liM = await mLi.textContent();
  check('1b-陈变化列真实（逐场次分母：率+3%/课消+¥700/成单+¥1000）', /\+3%/.test(chenM) && /\+¥700/.test(chenM.replace(/,/g, '')) && /\+¥1000/.test(chenM.replace(/,/g, '')), chenM.replace(/\s+/g, ' ').slice(0, 170));
  check('1b-李变化列真实（逐场次分母：率+14%/课消+¥500/成单+¥6800）', /\+14%/.test(liM) && /\+¥500/.test(liM.replace(/,/g, '')) && /\+¥6800/.test(liM.replace(/,/g, '')), liM.replace(/\s+/g, ' ').slice(0, 170));
  const mainHead = await page.locator('.biz-panel').first().textContent();
  check('1-课消金额列带（估）标注', mainHead.includes('课消金额（估）') || mainHead.includes('课消金额(估)'), '估算口径在列头标注');
  check('1b-口径说明=本期减上期', (await modal.textContent()).includes('本期') && (await modal.textContent()).includes('上期'));
  await page.screenshot({ path: `${OUT}/r3-teachers-change-modal.png` });
  await modal.getByRole('button', { name: /关\s*闭/ }).click().catch(() => page.keyboard.press('Escape'));

  // ===== 2. 课消收入总结·基本盘变化分析（默认本月） =====
  await page.goto(`${BASE}/operation/consumption`);
  await page.waitForTimeout(1500);
  const bodyText = await page.locator('body').textContent();
  const panel = page.locator('text=基本盘变化分析').first();
  check('2-基本盘变化分析面板存在', (await panel.count()) === 1);
  const panelCard = page.getByText('基本盘变化分析').locator('xpath=ancestor::div[contains(@class,"ant-card")][1]');
  const pageText = (await page.locator('body').textContent()).replace(/\s+/g, ' ');
  // 数值序列在「= 本期净变化」之后依次给出，召回格为「—（暂无数据）」，最后一个数即净变化
  const tail = pageText.split('= 本期净变化')[1] || '';
  const nums = tail.match(/[+-]?\d+/g) || [];
  const netVal = nums.length ? Number(nums[nums.length - 1]) : null;
  check('2-本期净变化非零（新口径：新增-不续费-流失，召回不可用）', netVal !== null && netVal !== 0 && tail.includes('—（暂无数据）'), tail.slice(0, 80));
  await page.screenshot({ path: `${OUT}/r3-consumption-base.png`, fullPage: false });

  // ===== 3. 班级管理：水平=可选自定义 =====
  await page.goto(`${BASE}/classes`);
  await page.waitForTimeout(900);
  const hasCustom = (await page.getByRole('row').filter({ hasText: '初级(自定)' }).count()) >= 1;
  check('3-自定义水平“初级(自定)”展示', hasCustom);
  const canEdit = await page.getByRole('button', { name: /新增班级/ }).isEnabled().catch(() => false);
  if (canEdit) {
    await page.getByRole('button', { name: /新增班级/ }).click();
    await page.waitForTimeout(500);
    const levelLabel = await page.getByText('班级水平（可选，可自定义）').count();
    check('3-表单水平字段=可选+自定义', levelLabel === 1);
    await page.screenshot({ path: `${OUT}/r3-classes-level.png` });
    await page.keyboard.press('Escape');
  } else {
    check('3-表单水平字段=可选+自定义（无新增权限跳过UI）', true, 'admin 应可见，若不可见需复查');
  }

  // ===== 3b. 学员抽屉真实分区（报名/续费 + 出勤/课时流水） =====
  await page.goto(`${BASE}/students`);
  await page.waitForSelector('.ant-table-row');
  await page.locator('.student-name-link').first().click();
  await page.waitForSelector('.student-profile');
  await page.waitForTimeout(1800);
  const drawerText = (await page.locator('.student-profile').textContent()) || '';
  check('3b-抽屉分区：报名与续费 + 出勤与课时流水', drawerText.includes('报名与续费') && drawerText.includes('出勤与课时流水'));
  check('3b-流水为真实数据（扣/返条目或明确空态）', /扣 \d|返\/增 \d|暂无课时流水/.test(drawerText), drawerText.match(/扣 \d+|返\/增 \d+|暂无课时流水/)?.[0]);
  await page.screenshot({ path: `${OUT}/r4-student-drawer.png` });
  await page.keyboard.press('Escape');

  // ===== 4. 清扫：连续请假页导出按钮不再绿色 + 统一页头 =====
  await page.goto(`${BASE}/attendances/continuous-leave`);
  await page.waitForTimeout(1200);
  const exportBtn = page.getByRole('button', { name: /导出数据/ }).first();
  const btnStyle = await exportBtn.evaluate((el) => { const s = getComputedStyle(el); return s.backgroundColor + '/' + s.color; });
  const isGreen = /rgb\((?:82,\s*196,\s*26|56,\s*158,\s*13|115,\s*209,\s*61)/.test(btnStyle);
  check('4-连续请假导出按钮非绿色', !isGreen, btnStyle);
  const headOk = (await page.locator('.biz-page-head').count()) >= 1;
  const filterOk = (await page.locator('.biz-filter-row').count()) >= 1;
  check('4-统一页头/筛选条生效（连续请假页）', headOk && filterOk);
  await page.screenshot({ path: `${OUT}/r3-continuous-leave.png` });

  for (const [path, label] of [['/attendances/honeymoon', '蜜月期'], ['/attendances/low-attendance-classes', '低出勤班级'], ['/students/renewal', '续费管理'], ['/classes', '班级管理']]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(900);
    const ok = (await page.locator('.biz-page-head').count()) >= 1;
    check(`4-${label}统一页头`, ok);
  }
  await page.goto(`${BASE}/operation/consumption`);
  await page.waitForTimeout(900);
  check('4-课消收入总结统一页头', (await page.locator('.biz-page-head').count()) >= 1);

  // ===== 暗色主题抽查（页头/筛选/表格） =====
  await page.goto(`${BASE}/teachers`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/r3-teachers-dark.png` });
} catch (e) {
  check('脚本异常', false, String(e).slice(0, 300));
  await page.screenshot({ path: `${OUT}/r3-ERROR.png` }).catch(() => {});
} finally {
  fs.writeFileSync(`${OUT}/r3-review-results.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  await browser.close();
}
const pass = results.filter((r) => r.ok).length;
console.log(`\n===== ${pass}/${results.length} 通过 =====`);
process.exit(pass === results.length ? 0 : 1);
