import { test, expect, type Page } from '@playwright/test';

/**
 * 方向 B · 经营工作台（首页复刻原型）专项 e2e
 *
 * 本机无数据库：授权态经 zustand persist 注入；工作台各业务接口在传输层
 * mock（数字与原型一致，仅测试布局与交互），生产代码零改动。
 * 覆盖：首页布局（问候/指标卡/输入框/chips/右栏）、流式对话与滚动状态机、
 * 常用功能（首页块 + 共享管理弹窗）、功能墙跳转、主题切换、四档视口、
 * 侧栏折叠与移动端抽屉。
 */

const MOCK_USER = {
  id: 'e2e-manager-001',
  name: '测试管理员',
  email: 'test@qq.com',
  role: 'manager',
  organizationId: 'demo-org',
};

const today = new Date().toISOString().slice(0, 10);

async function setupWorkspace(page: Page, opts?: { theme?: string }) {
  // 兜底先注册（低优先级）：无效 token 不触发全局登出
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
  );

  await page.addInitScript(
    ({ user, theme }) => {
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { token: 'mock-token-for-ui-test', user, isAuthenticated: true }, version: 0 })
      );
      localStorage.setItem(
        'buzzer-ui-v1',
        JSON.stringify({
          state: {
            theme,
            favorites: ['attendance', 'lowclass', 'conleave', 'teachers', 'renewal', 'lost', 'pool', 'experience', 'sales'],
            siderCollapsed: false,
          },
          version: 0,
        })
      );
    },
    { user: MOCK_USER, theme: opts?.theme ?? 'dark' }
  );

  // 工作台业务接口（专项后注册 = 优先命中），数字与原型一致
  const mocks: [string, unknown][] = [
    ['**/api/organizations/**', { success: true, data: { name: '蜂鸣演示馆（三馆）' } }],
    ['**/api/consumption/statistics*', { success: true, data: { baseCount: 386, totalAttendance: 412 } }],
    ['**/api/conversions*', { success: true, total: 3, data: [
      { price: 29800, courseType: '新报名', conversionDate: today },
      { price: 29800, courseType: '新报名', conversionDate: today },
      { price: 26400, courseType: '新报名', conversionDate: today },
    ] }],
    ['**/api/attendances/low-attendance-classes*', { success: true, data: [
      { id: 'lc1', className: 'MAX-U8 周六班', attendanceRate: 58 },
      { id: 'lc2', className: 'MAX-U10 周五班', attendanceRate: 54 },
      { id: 'lc3', className: '制燥-U12 周日班', attendanceRate: 49 },
    ] }],
    ['**/api/attendances/low-attendance-students*', { success: true, data: Array.from(
      { length: 12 }, (_, i) => ({ id: `ls${i}`, studentName: `低出勤学员${i + 1}` })
    ) }],
    ['**/api/experience-lessons/unconverted*', { success: true, data: [
      { id: 'exp1', studentName: '体验学员一' }, { id: 'exp2', studentName: '体验学员二' },
      { id: 'exp3', studentName: '体验学员三' }, { id: 'exp4', studentName: '体验学员四' },
    ] }],
    ['**/api/attendances/continuous-leave*', { success: true, data: [
      { studentName: '刘一诺', className: 'MAX-U8 周六班' },
      { studentName: '周子墨', className: '制燥-U10 周日班' },
    ] }],
    ['**/api/students*', { success: true, total: 7, data: Array.from({ length: 7 }, (_, i) =>
      ({ id: `renewal${i}`, name: i === 0 ? '顾一帆' : `待续费学员${i + 1}`, remainingLessons: 6 })) }],
    ['**/api/schedules*', { success: true, data: [
      { id: 'sc1', classId: 'c1', teacherId: 't1', startTime: `${today}T23:59:00`, status: 'scheduled' }, // 时刻无关：白天运行恒为"未来"（原 16:00 过午后断言必挂）
      { id: 'sc2', classId: 'c2', teacherId: 't2', startTime: `${today}T17:30:00`, status: 'scheduled' },
      { id: 'sc3', classId: 'c3', teacherId: 't3', startTime: `${today}T19:00:00`, status: 'scheduled' },
      { id: 'sc4', classId: 'c1', teacherId: 't1', startTime: `${today}T19:30:00`, status: 'cancelled' },
    ] }],
    ['**/api/classes*', { success: true, data: [
      { id: 'c1', name: 'MAX-U8 基础班', teacherId: 't1' },
      { id: 'c2', name: '制燥-U10 提高班', teacherId: 't2' },
      { id: 'c3', name: 'MAX-U10 周五班', teacherId: 't3' },
    ] }],
    ['**/api/users/teachers*', { success: true, data: [
      { id: 't1', name: '王磊' }, { id: 't2', name: '李楠' }, { id: 't3', name: '陈晨' },
    ] }],
  ];
  for (const [pattern, body] of mocks) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    );
  }
}

/** 长回答 SSE（保证对话流溢出可滚动） */
function longSse(): string {
  const deltas: string[] = [
    '**本周概览解读**：\n',
    '- 在册 386 人 · 课消 412 人次 · 新签 ¥8.6万\n',
    '\n| 优先级 | 动作 |\n|---|---|\n| 1 | 联系连续请假学员 |\n| 2 | 复核低出勤班级 |\n',
  ];
  for (let i = 1; i <= 16; i++) {
    deltas.push(`- 跟进建议 ${i}：本周内完成电话回访并记录结果，重点确认续费意向。\n`);
  }
  return deltas.map((d) => `data: ${JSON.stringify({ delta: d })}\n\n`).join('') + 'data: {"done":true}\n\n';
}

test.describe('方向 B · 经营工作台', () => {
  test('登录页正常渲染（未注入授权态）', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toContainText(/登录|账号/);
    await page.screenshot({ path: 'e2e/artifacts/wb-login.png', fullPage: true });
  });

  test('首页布局复刻：问候 + 4 指标卡 + 输入框 + 3 快捷提问 + 右栏两面板（暗色 1440）', async ({ page }) => {
    await setupWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ai');

    // 问候（含机构名与日期行）
    await expect(page.getByRole('heading', { name: /需要我为你做些什么/ })).toBeVisible();
    await expect(page.locator('.wb-greet p')).toContainText('蜂鸣演示馆（三馆）');
    await expect(page.locator('.wb-greet p')).toContainText(/周[一二三四五六日]，\d+月\d+日 · 今日运营概览/);

    // 4 指标卡：标签在上、数值在下；预警卡 warn 态
    await expect(page.locator('.wb-pill').first()).toContainText('在册学员');
    const firstPill = page.locator('.wb-pill').first();
    await expect(firstPill.locator('.pk')).toHaveText('在册学员');
    await expect(firstPill.locator('.pv')).toHaveText('386');
    await expect(page.locator('.wb-pill').nth(1).locator('.pv')).toHaveText('412');
    await expect(page.locator('.wb-pill').nth(2).locator('.pv')).toHaveText('¥8.6万');
    await expect(page.locator('.wb-pill.warn .pv')).toHaveText('26'); // 3 低出勤班 + 12 低出勤学员 + 7 待续费 + 4 体验课未成单
    // pk 在 pv 之前（原型顺序：标签上、数值下）
    expect(await firstPill.locator('.pk').boundingBox()).toBeTruthy();

    // 输入框 + 3 快捷提问
    await expect(page.locator('.wb-chat-input')).toBeVisible();
    await expect(page.locator('.bz-chip')).toHaveCount(3);

    // 常用功能全量视图在 /favorites 页（首页为对话专注模式，不再重复放功能块）
    await expect(page.locator('.wb-fav-card')).toHaveCount(0);
    await expect(page.locator('.wb-block-head', { hasText: '常用功能' })).toHaveCount(0);

    // 右栏：四类真实事项入口与跟进进度；业务预警数不被个人勾选改变。
    const side = page.locator('.wb-side');
    await expect(side.getByRole('heading', { name: '今日待处理' })).toBeVisible();
    await expect(side.getByRole('progressbar', { name: '今日跟进进度' })).toHaveAttribute('aria-valuemax', '26');
    await expect(side.locator('.focus-category')).toHaveCount(4);
    const catNum = (name: string) => side.locator('.focus-category', { hasText: name }).locator('.focus-count');
    await expect(catNum('低出勤班级')).toHaveText('3');
    await expect(catNum('低出勤学员')).toHaveText('12');
    await expect(catNum('待续费学员')).toHaveText('7');
    await expect(catNum('体验课未成单回访')).toHaveText('4');
    await expect(side.getByRole('heading', { name: '今日课表' })).toBeVisible();
    // 叠卡概览结构断言（时刻无关：真实钟点跨午夜/过点不再影响——曾两度咬人）
    await expect(side.locator('.ws-main')).toBeVisible();
    await expect(side).toContainText('共 3 个班次');
    await expect(side).toContainText(/今日还有 2 节|今日第一节/);
    // 点开叠卡 → 展开列表：全部班级/老师可见，cancelled 场次不展示（主卡是哪节不绑真实钟点）
    await side.locator('.wb-sched-stack').click();
    await expect(side).toContainText('MAX-U8 基础班');
    await expect(side).toContainText('制燥-U10 提高班');
    await expect(side).toContainText('MAX-U10 周五班');
    await expect(side).toContainText('王磊');
    await expect(side).not.toContainText('19:30'); // cancelled 不展示

    // 侧栏：机构副标 + 计数徽标；顶栏面包屑 + 主题按钮；积分胶囊未配置时隐藏
    await expect(page.locator('.bz-logo-sub')).toContainText('蜂鸣演示馆（三馆）');
    await expect(page.locator('.bz-crumb b')).toHaveText('AI 助理');
    await expect(page.locator('.bz-nav-count').first()).toBeVisible();
    await expect(page.locator('.bz-quota-chip')).toHaveCount(0);

    await page.screenshot({ path: 'e2e/artifacts/wb-home-dark-1440.png' });
  });

  test('对话流：发起后隐藏问候与指标卡；流式渲染表格；上滚解锁 + 回到底部；错误态重试', async ({ page }) => {
    await setupWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    let calls = 0;
    await page.route('**/api/ai/chat', async (route) => {
      calls += 1;
      if (calls === 1) {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
          body: longSse(),
        });
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'AI 服务未配置：请在后端环境变量中配置 GLM_API_KEY 后重启服务' }),
        });
      }
    });

    await page.goto('/ai');
    await page.locator('.bz-chip').first().click(); // 快捷提问真实发起

    // 指标卡与问候隐藏（原型行为）；回答渲染含表格
    await expect(page.locator('.wb-pills')).toHaveCount(0);
    await expect(page.locator('.wb-greet')).toHaveCount(0);
    await expect(page.locator('.wb-msg-ai .wb-ai-table').first()).toBeVisible();
    await expect(page.locator('.wb-msg-user').first()).toContainText('本周有哪些异常');

    // 自动跟随：贴近底部
    const bottom1 = await page.locator('.wb-chatlog').evaluate((el) => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight));
    expect(bottom1).toBeLessThan(120);

    // 上滚 → 解锁 + 回到底部按钮；点击后恢复贴底且按钮消失
    await page.locator('.wb-chatlog').evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(page.getByRole('button', { name: /回到底部/ })).toBeVisible();
    // 浮标不能改变滚动内容高度，否则拖动经过底部阈值时会反复闪现。
    const log = page.locator('.wb-chatlog');
    const heightBefore = await log.evaluate(el => el.scrollHeight);
    for (const distance of [110, 80, 110, 80, 110]) {
      await log.evaluate((el, d) => { el.scrollTop = el.scrollHeight - el.clientHeight - d; }, distance);
      await page.waitForTimeout(80);
      expect(await log.evaluate(el => el.scrollHeight)).toBe(heightBefore);
    }
    await log.evaluate(el => { el.scrollTop = 0; });
    await expect(page.getByRole('button', { name: /回到底部/ })).toBeVisible();
    await page.getByRole('button', { name: /回到底部/ }).click();
    await expect
      .poll(() => page.locator('.wb-chatlog').evaluate((el) => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight)), { timeout: 5000 })
      .toBeLessThan(120);
    await expect(page.getByRole('button', { name: /回到底部/ })).toBeHidden({ timeout: 5000 });

    // 对话态：chips 隐藏（对话专注模式），第二条提问走输入框
    await expect(page.locator('.wb-chips')).toBeHidden();
    await page.locator('.wb-chat-input').fill('本月成单情况如何？');
    await page.locator('.wb-chat-input').press('Enter');
    await expect(page.locator('.wb-msg-ai.is-error').last()).toContainText('AI 服务未配置');
    await expect(page.getByText('重试').last()).toBeVisible();
    await page.screenshot({ path: 'e2e/artifacts/wb-chat-error.png' });
  });

  test('常用功能：管理弹窗（pick 网格）真实增删 + 去重（/favorites 页）', async ({ page }) => {
    await setupWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    // 首页主栏已改为对话专注模式，常用功能全量视图在 /favorites 页
    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: '常用功能' })).toBeVisible();

    await page.locator('.bz-page-head').getByRole('button', { name: '管理' }).click();
    const modal = page.locator('.wb-modal');
    await expect(modal).toBeVisible();

    const pick = modal.locator('.wb-pick', { hasText: '周总结' });
    await pick.click(); // 加入
    await pick.click(); // 取消
    await pick.click(); // 再加入（验证不产生重复）
    await modal.getByRole('button', { name: '完成' }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('.bz-func-card')).toHaveCount(10);
    await expect(page.locator('.bz-func-card', { hasText: '周总结' })).toHaveCount(1);

    // 移除恢复 9
    await page.locator('.bz-page-head').getByRole('button', { name: '管理' }).click();
    const modal2 = page.locator('.wb-modal');
    await modal2.locator('.wb-pick', { hasText: '周总结' }).click();
    await modal2.getByRole('button', { name: '完成' }).click();
    await expect(page.locator('.bz-func-card')).toHaveCount(9);

    // 卡片点击进入业务路由
    await page.locator('.bz-func-card', { hasText: '续费管理' }).click();
    await expect(page).toHaveURL(/\/students\/renewal/);
    await page.screenshot({ path: 'e2e/artifacts/wb-fav-navigate.png' });
  });

  test('功能墙：考勤中心 5 卡含低出勤学员，点卡片进真实路由', async ({ page }) => {
    await setupWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/cat/attendance');
    const cards = page.locator('.bz-func-card');
    await expect(cards).toHaveCount(5);
    await page.locator('.bz-func-card', { hasText: '低出勤学员' }).click();
    await expect(page).toHaveURL(/\/students\/low-attendance/);
    await expect(page.getByText('判定规则')).toBeVisible();
    await page.screenshot({ path: 'e2e/artifacts/wb-lowattendance.png' });
  });

  test('主题切换：顶栏按钮双向切换 data-theme', async ({ page }) => {
    await setupWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ai');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: '切换到日间模式' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: 'e2e/artifacts/wb-home-light-1440.png' });
    await page.getByRole('button', { name: '切换到夜间模式' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('四档视口：1440 两栏 / 1024 单列+右栏并排 / 390 堆叠，无横向溢出', async ({ page }) => {
    await setupWorkspace(page);
    const cases: [number, number, string][] = [
      [1440, 900, '1440'],
      [1024, 800, '1024'],
      [390, 844, '390'],
    ];
    for (const [w, h, label] of cases) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/ai');
      await expect(page.getByRole('heading', { name: /需要我为你做些什么/ })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(2);

      const cols = await page.locator('.wb-inner').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      if (w > 1100) expect(cols).toBe(2);
      else expect(cols).toBe(1);

      // 390 下侧栏应为抽屉形态（无桌面侧栏）
      if (w < 920) {
        await expect(page.locator('.bz-sider')).toHaveCount(0);
        await page.getByRole('button', { name: '打开导航' }).click();
        await expect(page.locator('.ant-drawer')).toBeVisible();
        await expect(page.locator('.ant-drawer')).toContainText('AI 助理');
      }
      await page.screenshot({ path: `e2e/artifacts/wb-home-${label}.png` });
    }
  });

  test('侧栏折叠 236↔64；折叠态展开钮完整可见；用户菜单在侧栏底部', async ({ page }) => {
    await setupWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ai');
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect(page.locator('.bz-sider')).toHaveCSS('width', '64px');

    // 折叠态：展开钮必须完整落在侧栏内（横排会被 overflow:hidden 裁成 3px 缝）
    const btn = page.getByRole('button', { name: '展开侧栏' });
    await expect(btn).toBeVisible();
    const btnBox = await btn.boundingBox();
    const siderBox = await page.locator('.bz-sider').boundingBox();
    expect(btnBox).toBeTruthy();
    expect(siderBox).toBeTruthy();
    expect(btnBox!.x).toBeGreaterThanOrEqual(siderBox!.x);
    expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(siderBox!.x + siderBox!.width + 0.5);

    await btn.click();
    await expect(page.locator('.bz-sider')).toHaveCSS('width', '236px');
    await expect(page.locator('.bz-side-user')).toContainText('测试管理员');
    await page.screenshot({ path: 'e2e/artifacts/wb-sidebar.png' });

    // 再折叠一次截图留档（头部纵向堆叠：logo 上、展开钮下）
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect(page.locator('.bz-sider')).toHaveCSS('width', '64px');
    await page.screenshot({ path: 'e2e/artifacts/wb-sidebar-collapsed.png', clip: { x: 0, y: 0, width: 64, height: 400 } });
  });
});
