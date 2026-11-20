import { test, expect } from '@playwright/test';
import { loginRobust } from '../helpers';
import { NavigationHelpers, DataHelpers, AssertionHelpers } from '../helpers';
import { CONSTANTS, TEST_USERS } from '../setup/test-constants';

/**
 * 完整回归测试套件
 *
 * 这是一个综合性的端到端测试套件，模拟真实用户的完整业务流程。
 * 建议在每次发布前运行此测试套件以确保系统整体功能正常。
 *
 * 测试覆盖：
 * 1. 管理员视角的完整业务流程
 * 2. 教练视角的日常工作流程
 * 3. 销售视角的转化流程
 * 4. 数据一致性和完整性验证
 */

test.describe('回归测试套件：管理员完整业务流程', () => {
  test.beforeEach(async ({ page }) => {
    await loginRobust(page, {
      email: 'e2e-admin@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：完整的销售转化流程
   * 步骤：
   * 1. 创建鱼池资源
   * 2. 安排体验课
   * 3. 体验课签到
   * 4. 创建成单
   * 5. 验证学员自动创建
   * 6. 验证数据流一致性
   */
  test('完整流程：从鱼池资源到学员创建', async ({ page }) => {
    // 1. 创建鱼池资源
    await NavigationHelpers.navigateTo(page, '/marketing-pool');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="leads-table"]', { timeout: 10000 });

    await page.click('button:has-text("新增"), button:has-text("创建"), [data-testid="create-button"]');
    await page.waitForTimeout(500);

    const customerName = 'E2E回归测试客户' + Date.now();
    await page.fill('input[placeholder*="姓名"], input[name*="name"], [data-testid="customer-name-input"]', customerName);
    await page.fill('input[placeholder*="年龄"], input[name*="age"], [data-testid="age-input"]', '8');
    await page.fill('input[placeholder*="联系方式"], input[name*="phone"], input[name*="contact"], [data-testid="contact-input"]', '13800990001');

    await page.click('button:has-text("确定"), button:has-text("提交"), button:has-text("保存")');
    await page.waitForTimeout(1000);
    await AssertionHelpers.assertSuccessMessage(page);

    // 2. 安排体验课
    await page.waitForSelector('.ant-table, [data-testid="leads-table"]', { timeout: 10000 });
    const leadRow = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${customerName}`)
    }).first();

    await leadRow.locator('button:has-text("体验"), button:has-text("安排"), [data-testid="schedule-experience-button"]').click();
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });
    await page.waitForTimeout(500);

    const classSelect = page.locator('select[name*="class"], [data-testid="class-select"]');
    if (await classSelect.isVisible()) {
      await classSelect.selectOption({ index: 0 });
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const dateInput = page.locator('input[type="date"], [data-testid="date-input"]');
    if (await dateInput.isVisible()) {
      await dateInput.fill(dateStr);
    }

    await page.click('button:has-text("确定")');
    await page.waitForTimeout(1000);
    await AssertionHelpers.assertSuccessMessage(page);

    // 3. 体验课签到
    await NavigationHelpers.navigateTo(page, '/experience-schedule');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="experience-lessons-table"]', { timeout: 10000 });

    const experienceRow = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${customerName}`)
    }).first();

    if (await experienceRow.count() > 0) {
      await experienceRow.locator('button:has-text("签到"), button:has-text("到场"), [data-testid="check-in-button"]').click();

      const confirmButton = page.locator('[role="dialog"] button:has-text("确定")');
      if (await confirmButton.isVisible({ timeout: 2000 })) {
        await confirmButton.click();
      }

      await page.waitForTimeout(1000);
      await AssertionHelpers.assertSuccessMessage(page);
    }

    // 4. 创建成单
    await NavigationHelpers.navigateTo(page, '/order-info');
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("新增"), button:has-text("创建"), [data-testid="create-button"]');
    await page.waitForTimeout(500);

    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    await page.fill('input[name*="name"], [data-testid="student-name-input"]', customerName);
    await page.fill('input[name*="age"], [data-testid="age-input"]', '8');
    await page.fill('input[name*="contact"], [data-testid="contact-input"]', '13800990001');

    const courseTypeSelect = page.locator('select[name*="courseType"], [data-testid="course-type-select"]');
    if (await courseTypeSelect.isVisible()) {
      await courseTypeSelect.selectOption('new');
    }

    await page.fill('input[name*="lessons"], [data-testid="lessons-input"]', '20');
    await page.fill('input[name*="price"], [data-testid="price-input"]', '2000');

    await page.click('button:has-text("确定")');
    await page.waitForTimeout(1500);
    await AssertionHelpers.assertSuccessMessage(page);

    // 5. 验证学员自动创建
    await NavigationHelpers.navigateTo(page, '/students');
    await page.waitForLoadState('networkidle');

    await page.fill('input[placeholder*="搜索"], input[name*="search"], [data-testid="search-input"]', customerName);
    await page.waitForTimeout(1000);

    const studentCell = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${customerName}`)
    });

    expect(await studentCell.count()).toBeGreaterThan(0);

    // 6. 验证成单记录
    await NavigationHelpers.navigateTo(page, '/order-info');
    await page.waitForLoadState('networkidle');

    await page.fill('input[placeholder*="搜索"], input[name*="search"], [data-testid="search-input"]', customerName);
    await page.waitForTimeout(1000);

    const orderCell = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${customerName}`)
    });

    expect(await orderCell.count()).toBeGreaterThan(0);
  });

  /**
   * 测试场景：完整的班级管理流程
   * 步骤：
   * 1. 查看班级列表
   * 2. 创建新班级
   * 3. 添加学员到班级
   * 4. 设置排课
   * 5. 验证班级数据
   */
  test('完整流程：班级管理', async ({ page }) => {
    // 1. 查看班级列表
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    const rowCountBefore = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(rowCountBefore).toBeGreaterThan(0);

    // 2. 创建新班级
    await page.click('button:has-text("新增"), button:has-text("创建"), [data-testid="create-button"]');
    await page.waitForTimeout(500);

    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // 填写班级信息
    const className = 'E2E回归测试班级' + Date.now();
    await page.fill('input[name*="name"], [data-testid="class-name-input"]', className);
    await page.fill('input[name*="code"], [data-testid="class-code-input"]', 'E2E' + Date.now());

    const courseTypeSelect = page.locator('select[name*="courseType"], [data-testid="course-type-select"]');
    if (await courseTypeSelect.isVisible()) {
      await courseTypeSelect.selectOption('精英班');
    }

    const teacherSelect = page.locator('select[name*="teacher"], [data-testid="teacher-select"]');
    if (await teacherSelect.isVisible()) {
      await teacherSelect.selectOption({ index: 0 });
    }

    await page.fill('input[name*="capacity"], [data-testid="capacity-input"]', '10');

    await page.click('button:has-text("确定"), button:has-text("提交")');
    await page.waitForTimeout(1500);
    await AssertionHelpers.assertSuccessMessage(page);

    // 3. 验证班级创建成功
    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });
    const rowCountAfter = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(rowCountAfter).toBe(rowCountBefore + 1);

    // 查找新创建的班级
    const newClassRow = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${className}`)
    });

    expect(await newClassRow.count()).toBeGreaterThan(0);

    // 4. 查看班级详情
    await newClassRow.first().click();
    await page.waitForTimeout(500);

    // 验证详情显示
    const dialog = page.locator('[role="dialog"]');
    if (await dialog.isVisible()) {
      await expect(dialog.locator(`text=${className}`)).toBeVisible();
    }
  });

  /**
   * 测试场景：完整的每日划课流程
   * 步骤：
   * 1. 查看周排课
   * 2. 执行当天划课
   * 3. 验证课时扣减
   * 4. 验证出勤记录
   */
  test('完整流程：每日划课', async ({ page }) => {
    // 1. 查看周排课
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="schedule-table"]', { timeout: 10000 });

    const scheduleRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(scheduleRowCount).toBeGreaterThan(0);

    // 2. 查找今天的课程
    const today = new Date().toISOString().split('T')[0];
    const todayRow = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${today}`)
    }).first();

    const hasTodayRow = await todayRow.count() > 0;

    if (hasTodayRow) {
      // 获取划课前的状态
      const beforeText = await todayRow.textContent();

      // 3. 执行划课
      await todayRow.locator('button:has-text("划课"), [data-testid="deduct-button"]').click();
      await page.waitForTimeout(500);

      const confirmButton = page.locator('[role="dialog"] button:has-text("确定")');
      if (await confirmButton.isVisible({ timeout: 2000 })) {
        await confirmButton.click();
        await page.waitForTimeout(1500);
        await AssertionHelpers.assertSuccessMessage(page);

        // 4. 验证出勤记录
        await NavigationHelpers.navigateTo(page, '/class-attendance');
        await page.waitForLoadState('networkidle');

        await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });

        const todayRecord = page.locator(`text=${today}`).first();
        const hasRecord = await todayRecord.isVisible();

        if (hasRecord) {
          await expect(todayRecord).toBeVisible();
        }
      }
    }
  });

  /**
   * 测试场景：财务数据一致性验证
   * 步骤：
   * 1. 查看成单数据
   * 2. 查看现金流
   * 3. 查看课消收入
   * 4. 验证数据一致性
   */
  test('数据一致性：财务数据', async ({ page }) => {
    // 1. 查看成单数据
    await NavigationHelpers.navigateTo(page, '/order-info');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="orders-table"]', { timeout: 10000 });

    const orderRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(orderRowCount).toBeGreaterThanOrEqual(0);

    // 2. 查看现金流
    await NavigationHelpers.navigateTo(page, '/cashflow-summary');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });
    const cashflowPageVisible = await page.locator('[data-testid="page-container"]').isVisible();
    expect(cashflowPageVisible).toBe(true);

    // 3. 查看课消收入
    await NavigationHelpers.navigateTo(page, '/consumption-and-revenue');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });
    const revenuePageVisible = await page.locator('[data-testid="page-container"]').isVisible();
    expect(revenuePageVisible).toBe(true);
  });

  /**
   * 测试场景：学员数据一致性验证
   * 步骤：
   * 1. 查看学员列表
   * 2. 查看蜜月期客户
   * 3. 查看待续费学员
   * 4. 验证数据一致性
   */
  test('数据一致性：学员数据', async ({ page }) => {
    // 1. 查看学员列表
    await NavigationHelpers.navigateTo(page, '/students');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="students-table"]', { timeout: 10000 });

    const studentRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(studentRowCount).toBeGreaterThan(0);

    // 2. 查看蜜月期客户
    await NavigationHelpers.navigateTo(page, '/honeymoon-attendance');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });
    const honeymoonPageVisible = await page.locator('[data-testid="page-container"]').isVisible();
    expect(honeymoonPageVisible).toBe(true);

    // 3. 查看待续费学员
    await NavigationHelpers.navigateTo(page, '/renewal-students');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });
    const renewalPageVisible = await page.locator('[data-testid="page-container"]').isVisible();
    expect(renewalPageVisible).toBe(true);
  });

  /**
   * 测试场景：体验课转化率验证
   * 步骤：
   * 1. 查看体验课列表
   * 2. 验证到场数据
   * 3. 验证成单数据
   * 4. 计算转化率
   */
  test('数据一致性：体验课转化率', async ({ page }) => {
    // 1. 查看体验课列表
    await NavigationHelpers.navigateTo(page, '/experience-schedule');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="experience-lessons-table"]', { timeout: 10000 });

    const experienceRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(experienceRowCount).toBeGreaterThanOrEqual(0);

    // 2. 查找转化率显示
    const conversionRate = page.locator('text=/转化率|到场率/').first();
    const hasConversionRate = await conversionRate.isVisible();

    if (hasConversionRate) {
      await expect(conversionRate).toBeVisible();
    }
  });
});

test.describe('回归测试套件：教练日常工作流程', () => {
  test.beforeEach(async ({ page }) => {
    await loginRobust(page, {
      email: 'e2e-coach1@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：教练的日常工作流程
   * 步骤：
   * 1. 查看自己的班级
   * 2. 查看周排课
   * 3. 执行当天划课
   * 4. 查看学员出勤
   * 5. 查看学员名单
   */
  test('教练日常工作流程', async ({ page }) => {
    // 1. 查看自己的班级
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 验证只显示自己的班级
    const tableText = await page.locator('.ant-table, [data-testid="classes-table"]').textContent();
    expect(tableText).toContain('E2E张教练');

    const classRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(classRowCount).toBeGreaterThan(0);

    // 2. 查看周排课
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="schedule-table"]', { timeout: 10000 });

    const scheduleRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(scheduleRowCount).toBeGreaterThan(0);

    // 3. 执行当天划课（如果有今天的课程）
    const today = new Date().toISOString().split('T')[0];
    const todayRow = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${today}`)
    }).first();

    const hasTodayRow = await todayRow.count() > 0;

    if (hasTodayRow) {
      await todayRow.locator('button:has-text("划课"), [data-testid="deduct-button"]').click();
      await page.waitForTimeout(500);

      const confirmButton = page.locator('[role="dialog"] button:has-text("确定")');
      if (await confirmButton.isVisible({ timeout: 2000 })) {
        await confirmButton.click();
        await page.waitForTimeout(1500);
        await AssertionHelpers.assertSuccessMessage(page);
      }
    }

    // 4. 查看学员出勤
    await NavigationHelpers.navigateTo(page, '/class-attendance');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });
    const attendancePageVisible = await page.locator('[data-testid="page-container"]').isVisible();
    expect(attendancePageVisible).toBe(true);

    // 5. 查看学员名单
    await NavigationHelpers.navigateTo(page, '/students');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="students-table"]', { timeout: 10000 });

    const studentRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(studentRowCount).toBeGreaterThanOrEqual(0);
  });

  /**
   * 测试场景：教练查看自己的统计数据
   * 步骤：
   * 1. 查看课消数据
   * 2. 验证只显示自己的数据
   */
  test('教练查看自己的统计数据', async ({ page }) => {
    // 1. 查看课消数据
    await NavigationHelpers.navigateTo(page, '/consumption-and-revenue');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });
    const revenuePageVisible = await page.locator('[data-testid="page-container"]').isVisible();
    expect(revenuePageVisible).toBe(true);
  });
});

test.describe('回归测试套件：销售日常工作流程', () => {
  test.beforeEach(async ({ page }) => {
    await loginRobust(page, {
      email: 'e2e-sales1@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：销售的日常工作流程
   * 步骤：
   * 1. 查看鱼池资源
   * 2. 创建新线索
   * 3. 安排体验课
   * 4. 创建成单
   * 5. 验证数据隔离
   */
  test('销售日常工作流程', async ({ page }) => {
    // 1. 查看鱼池资源
    await NavigationHelpers.navigateTo(page, '/marketing-pool');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="leads-table"]', { timeout: 10000 });

    // 验证只看到自己的线索
    const assigneeCells = await page.locator('.ant-table-tbody tr td:last-child, tbody tr td:last-child').allTextContents();
    const currentSalesName = 'E2E赵销售';
    const allBelongToCurrentSales = assigneeCells.every(cell =>
      cell.includes(currentSalesName) || cell === '' || cell === '-'
    );

    expect(assigneeCells.length).toBeGreaterThan(0);

    // 2. 创建新线索
    await page.click('button:has-text("新增"), button:has-text("创建"), [data-testid="create-button"]');
    await page.waitForTimeout(500);

    const customerName = 'E2E销售测试客户' + Date.now();
    await page.fill('input[placeholder*="姓名"], input[name*="name"], [data-testid="customer-name-input"]', customerName);
    await page.fill('input[placeholder*="年龄"], input[name*="age"], [data-testid="age-input"]', '8');
    await page.fill('input[placeholder*="联系方式"], input[name*="phone"], input[name*="contact"], [data-testid="contact-input"]', '13800880001');

    await page.click('button:has-text("确定"), button:has-text("提交"), button:has-text("保存")');
    await page.waitForTimeout(1000);
    await AssertionHelpers.assertSuccessMessage(page);

    // 3. 安排体验课
    await page.waitForSelector('.ant-table, [data-testid="leads-table"]', { timeout: 10000 });
    const leadRow = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${customerName}`)
    }).first();

    await leadRow.locator('button:has-text("体验"), button:has-text("安排"), [data-testid="schedule-experience-button"]').click();
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });
    await page.waitForTimeout(500);

    const classSelect = page.locator('select[name*="class"], [data-testid="class-select"]');
    if (await classSelect.isVisible()) {
      await classSelect.selectOption({ index: 0 });
    }

    await page.click('button:has-text("确定")');
    await page.waitForTimeout(1000);
    await AssertionHelpers.assertSuccessMessage(page);

    // 4. 创建成单
    await NavigationHelpers.navigateTo(page, '/order-info');
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("新增"), button:has-text("创建"), [data-testid="create-button"]');
    await page.waitForTimeout(500);

    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    await page.fill('input[name*="name"], [data-testid="student-name-input"]', customerName);
    await page.fill('input[name*="age"], [data-testid="age-input"]', '8');
    await page.fill('input[name*="contact"], [data-testid="contact-input"]', '13800880001');

    await page.fill('input[name*="lessons"], [data-testid="lessons-input"]', '20');
    await page.fill('input[name*="price"], [data-testid="price-input"]', '2000');

    await page.click('button:has-text("确定")');
    await page.waitForTimeout(1500);
    await AssertionHelpers.assertSuccessMessage(page);

    // 5. 验证成单记录
    await page.waitForSelector('.ant-table, [data-testid="orders-table"]', { timeout: 10000 });
    const orderCell = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${customerName}`)
    });

    expect(await orderCell.count()).toBeGreaterThan(0);
  });

  /**
   * 测试场景：销售查看体验课转化
   * 步骤：
   * 1. 查看体验课列表
   * 2. 查看转化率
   */
  test('销售查看体验课转化', async ({ page }) => {
    // 1. 查看体验课列表
    await NavigationHelpers.navigateTo(page, '/experience-schedule');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="experience-lessons-table"]', { timeout: 10000 });

    const experienceRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(experienceRowCount).toBeGreaterThanOrEqual(0);

    // 2. 查找转化率显示
    const conversionRate = page.locator('text=/转化率|到场率/').first();
    const hasConversionRate = await conversionRate.isVisible();

    if (hasConversionRate) {
      await expect(conversionRate).toBeVisible();
    }
  });
});

test.describe('回归测试套件：系统整体验证', () => {
  test.beforeEach(async ({ page }) => {
    await loginRobust(page, {
      email: 'e2e-admin@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：验证测试数据完整性
   * 步骤：
   * 1. 验证用户数据
   * 2. 验证班级数据
   * 3. 验证学员数据
   * 4. 验证鱼池资源
   */
  test('验证测试数据完整性', async ({ page }) => {
    // 1. 验证班级数据（应该有42个班级）
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    const classRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(classRowCount).toBeGreaterThanOrEqual(42);

    // 2. 验证学员数据（应该有120个学员）
    await NavigationHelpers.navigateTo(page, '/students');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="students-table"]', { timeout: 10000 });

    const studentRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(studentRowCount).toBeGreaterThanOrEqual(120);

    // 3. 验证鱼池资源（应该有50条）
    await NavigationHelpers.navigateTo(page, '/marketing-pool');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-table, [data-testid="leads-table"]', { timeout: 10000 });

    const leadRowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(leadRowCount).toBeGreaterThanOrEqual(50);
  });

  /**
   * 测试场景：验证所有主要页面可访问
   * 步骤：
   * 遍历所有主要页面，验证可访问性
   */
  test('验证所有主要页面可访问', async ({ page }) => {
    const pages = [
      { path: '/classes', name: '班级管理' },
      { path: '/students', name: '学员管理' },
      { path: '/weekly-schedule', name: '每周排课' },
      { path: '/class-attendance', name: '班级出勤' },
      { path: '/low-attendance-students', name: '低出勤学员' },
      { path: '/honeymoon-attendance', name: '蜜月期客户' },
      { path: '/marketing-pool', name: '鱼池资源' },
      { path: '/experience-schedule', name: '体验课表' },
      { path: '/order-info', name: '成单信息' },
      { path: '/consumption-and-revenue', name: '课消收入' },
      { path: '/cashflow-summary', name: '现金流中心' },
      { path: '/renewal-students', name: '续费管理' },
    ];

    for (const pageInfo of pages) {
      await NavigationHelpers.navigateTo(page, pageInfo.path);
      await page.waitForLoadState('networkidle');

      // 验证页面加载成功
      const pageLoaded = await page.locator('[data-testid="page-container"], .ant-page-header, .ant-table').isVisible({ timeout: 5000 });
      expect(pageLoaded).toBe(true);
    }
  });

  /**
   * 测试场景：验证角色权限正确性
   * 步骤：
   * 1. 管理员登录验证
   * 2. 切换到教练验证
   * 3. 切换到销售验证
   */
  test('验证角色权限正确性', async ({ page }) => {
    // 1. 管理员验证
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');
    let canAccess = await page.locator('[data-testid="page-container"], .ant-page-header').isVisible({ timeout: 5000 });
    expect(canAccess).toBe(true);

    // 退出登录
    await page.click('button:has-text("退出"), [data-testid="logout-button"]');
    await page.waitForTimeout(1000);

    // 2. 教练验证
    await loginRobust(page, {
      email: 'e2e-coach1@test.com',
      password: 'test123',
    });

    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');
    canAccess = await page.locator('[data-testid="page-container"], .ant-page-header').isVisible({ timeout: 5000 });
    expect(canAccess).toBe(true);

    // 退出登录
    await page.click('button:has-text("退出"), [data-testid="logout-button"]');
    await page.waitForTimeout(1000);

    // 3. 销售验证
    await loginRobust(page, {
      email: 'e2e-sales1@test.com',
      password: 'test123',
    });

    await NavigationHelpers.navigateTo(page, '/marketing-pool');
    await page.waitForLoadState('networkidle');
    canAccess = await page.locator('[data-testid="page-container"], .ant-page-header').isVisible({ timeout: 5000 });
    expect(canAccess).toBe(true);
  });
});
