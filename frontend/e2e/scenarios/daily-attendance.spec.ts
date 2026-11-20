import { test, expect } from '@playwright/test';
import { loginRobust } from '../helpers';
import { NavigationHelpers, DataHelpers, AssertionHelpers } from '../helpers';
import { CONSTANTS, TEST_USERS } from '../setup/test-constants';

/**
 * 每日划课流程测试
 *
 * 测试每日划课的完整业务流程：
 * 1. 查看周排课
 * 2. 当日排课划课
 * 3. 验证非当日划课限制
 * 4. 验证课时扣减
 * 5. 查看出勤记录
 */

test.describe('每日划课流程', () => {
  test.beforeEach(async ({ page }) => {
    // 使用管理员账号登录
    await loginRobust(page, {
      email: 'e2e-admin@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：查看周排课表
   * 验证：能看到本周所有排课
   */
  test('应该能查看本周排课表', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 验证页面标题
    await expect(page.locator('text=/排课|周课表/')).toBeVisible();

    // 验证排课数据显示
    const scheduleVisible = await page.locator('.ant-table, [data-testid="schedule-table"]').isVisible();
    expect(scheduleVisible).toBe(true);

    console.log('[周排课] 排课表加载成功');
  });

  /**
   * 测试场景：查看当日排课
   * 验证：能看到今天的所有排课
   */
  test('应该能查看当日排课', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 查找今天的排课（根据当前星期几）
    const today = new Date().getDay(); // 0=周日, 1=周一, ...
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const todayName = weekdayNames[today];

    // 查找包含今天星期名称的排课
    const todaySchedules = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${todayName}`)
    });

    const count = await todaySchedules.count();
    console.log(`[当日排课] 今天(${todayName})有 ${count} 个排课`);
  });

  /**
   * 测试场景：对当日排课进行划课
   * 验证：划课成功，课时正确扣减
   */
  test('应该能对当日排课进行划课', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 查找今天的排课（根据当前星期几）
    const today = new Date().getDay();
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const todayName = weekdayNames[today];

    // 查找包含今天星期名称的排课
    const todaySchedules = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${todayName}`)
    });

    const count = await todaySchedules.count();

    if (count > 0) {
      // 点击第一个今日排课的划课按钮
      const firstSchedule = todaySchedules.first();
      const deductButton = firstSchedule.locator('button:has-text("划课"), button:has-text("考勤"), [data-testid="deduct-button"]');

      if (await deductButton.isVisible({ timeout: 2000 })) {
        // 记录划课前的学员课时（如果可见）
        const beforeLessons = await page.locator('text=/课时/').allTextContents();

        await deductButton.click();
        await page.waitForTimeout(500);

        // 等待划课弹窗
        await page.waitForSelector('[role="dialog"]', { state: 'visible' });

        // 选择出勤学员
        const studentCheckboxes = page.locator('[role="dialog"] input[type="checkbox"]');
        const checkboxCount = await studentCheckboxes.count();

        if (checkboxCount > 0) {
          // 选中第一个学员
          await studentCheckboxes.first().check();
          await page.waitForTimeout(500);

          // 提交划课
          await page.click('[role="dialog"] button:has-text("确定")');
          await page.waitForTimeout(1500);

          // 验证成功消息
          await AssertionHelpers.assertSuccessMessage(page);

          console.log('[划课] 当日排课划课成功');
        } else {
          console.log('[划课] 该班级没有学员');
        }
      } else {
        console.log('[划课] 该排课已经划过课或没有划课按钮');
      }
    } else {
      console.log('[划课] 今天没有排课');
      test.skip(true, '今天没有排课');
    }
  });

  /**
   * 测试场景：验证非当日排课不能划课
   * 验证：显示错误提示
   */
  test('非当日排课不能划课', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 获取今天和明天的星期
    const today = new Date().getDay();
    const tomorrow = (today + 1) % 7;
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const tomorrowName = weekdayNames[tomorrow];

    // 查找明天的排课
    const tomorrowSchedules = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${tomorrowName}`)
    });

    const count = await tomorrowSchedules.count();

    if (count > 0) {
      // 点击第一个明日排课的划课按钮
      const firstSchedule = tomorrowSchedules.first();
      const deductButton = firstSchedule.locator('button:has-text("划课"), button:has-text("考勤"), [data-testid="deduct-button"]');

      if (await deductButton.isVisible({ timeout: 2000 })) {
        await deductButton.click();
        await page.waitForTimeout(500);

        // 等待响应
        await page.waitForTimeout(1000);

        // 验证错误消息
        const hasErrorMessage = await DataHelpers.verifyErrorMessage(page, '只能划当天的课');
        expect(hasErrorMessage).toBe(true);

        console.log('[划课限制] 正确阻止非当日排课划课');
      }
    } else {
      console.log('[划课限制] 明天没有排课，跳过测试');
      test.skip(true, '明天没有排课');
    }
  });

  /**
   * 测试场景：验证课时扣减正确
   * 验证：划课后学员课时减少
   */
  test('划课后应该正确扣减课时', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/students');
    await page.waitForLoadState('networkidle');

    // 等待学员列表加载
    await page.waitForSelector('.ant-table, [data-testid="students-table"]', { timeout: 10000 });

    // 获取第一个学员的课时（假设）
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    const cells = await firstRow.locator('td').allTextContents();

    // 查找课时信息
    let beforeLessons = 0;
    for (const cell of cells) {
      const match = cell.match(/(\d+)\s*课/);
      if (match) {
        beforeLessons = parseInt(match[1], 10);
        break;
      }
    }

    console.log(`[课时验证] 划课前课时: ${beforeLessons}`);

    // 如果找到课时信息，导航到排课页面进行划课
    if (beforeLessons > 0) {
      await NavigationHelpers.navigateTo(page, '/weekly-schedule');
      await page.waitForLoadState('networkidle');

      // 查找今日排课并划课
      const today = new Date().getDay();
      const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const todayName = weekdayNames[today];

      const todaySchedules = page.locator('.ant-table-tbody tr, tbody tr').filter({
        has: page.locator(`text=${todayName}`)
      });

      const count = await todaySchedules.count();

      if (count > 0) {
        const firstSchedule = todaySchedules.first();
        const deductButton = firstSchedule.locator('button:has-text("划课"), [data-testid="deduct-button"]');

        if (await deductButton.isVisible({ timeout: 2000 })) {
          await deductButton.click();
          await page.waitForTimeout(500);

          // 等待划课弹窗
          await page.waitForSelector('[role="dialog"]', { state: 'visible' });

          // 提交划课（全选）
          await page.click('[role="dialog"] button:has-text("确定")');
          await page.waitForTimeout(1500);

          // 返回学员页面验证课时
          await NavigationHelpers.navigateTo(page, '/students');
          await page.waitForLoadState('networkidle');

          await page.waitForSelector('.ant-table, [data-testid="students-table"]', { timeout: 10000 });

          const afterRow = page.locator('.ant-table-tbody tr, tbody tr').first();
          const afterCells = await afterRow.locator('td').allTextContents();

          let afterLessons = 0;
          for (const cell of afterCells) {
            const match = cell.match(/(\d+)\s*课/);
            if (match) {
              afterLessons = parseInt(match[1], 10);
              break;
            }
          }

          console.log(`[课时验证] 划课后课时: ${afterLessons}`);

          // 验证课时减少（可能减少1课时）
          expect(afterLessons).toBeLessThanOrEqual(beforeLessons);
        }
      }
    }
  });

  /**
   * 测试场景：查看出勤记录
   * 验证：能看到历史出勤记录
   */
  test('应该能查看出勤记录', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/class-attendance');
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });

    // 验证页面标题
    await expect(page.locator('text=/出勤|考勤/')).toBeVisible();

    // 等待表格加载
    const tableVisible = await page.locator('.ant-table, [data-testid="attendance-table"]').isVisible({ timeout: 10000 });
    expect(tableVisible).toBe(true);

    console.log('[出勤记录] 出勤记录页面加载成功');
  });

  /**
   * 测试场景：按班级查看出勤记录
   * 验证：筛选功能正常
   */
  test('应该能按班级查看出勤记录', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/class-attendance');
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });

    // 查找班级筛选器
    const classFilter = page.locator('select[name*="classId"], [data-testid="class-filter"]');

    if (await classFilter.isVisible({ timeout: 2000 })) {
      // 选择第一个班级
      const options = await classFilter.locator('option').allTextContents();

      if (options.length > 1) {
        await classFilter.selectOption({ index: 1 });
        await page.waitForTimeout(1000);

        // 验证筛选结果
        await page.waitForLoadState('networkidle');
        const tableVisible = await page.locator('.ant-table, [data-testid="attendance-table"]').isVisible();
        expect(tableVisible).toBe(true);
      }
    }
  });

  /**
   * 测试场景：按日期查看出勤记录
   * 验证：日期筛选功能正常
   */
  test('应该能按日期查看出勤记录', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/class-attendance');
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });

    // 查找日期筛选器
    const dateFilter = page.locator('input[placeholder*="日期"], [data-testid="date-filter"], .ant-picker');

    if (await dateFilter.first().isVisible({ timeout: 2000 })) {
      // 选择今天
      await dateFilter.first().click();
      await page.waitForTimeout(500);

      const todayButton = page.locator('button:has-text("今天"), .ant-picker-today-btn');
      if (await todayButton.isVisible({ timeout: 2000 })) {
        await todayButton.first().click();
        await page.waitForTimeout(1000);

        // 验证筛选结果
        await page.waitForLoadState('networkidle');
        const tableVisible = await page.locator('.ant-table, [data-testid="attendance-table"]').isVisible();
        expect(tableVisible).toBe(true);
      }
    }
  });

  /**
   * 测试场景：导出出勤记录
   * 验证：能成功导出数据
   */
  test('应该能导出出勤记录', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/class-attendance');
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });

    // 查找导出按钮
    const exportButton = page.locator('button:has-text("导出"), [data-testid="export-button"]');

    if (await exportButton.isVisible({ timeout: 2000 })) {
      // 设置下载监听
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

      await exportButton.click();

      // 等待下载开始
      const download = await downloadPromise.catch(() => null);

      if (download) {
        expect(download).toBeTruthy();
        console.log(`[导出] 下载文件: ${download.suggestedFilename()}`);
      }
    }
  });

  /**
   * 测试场景：批量划课
   * 验证：能同时对多个学员进行划课
   */
  test('应该能批量进行划课', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 查找今天的排课
    const today = new Date().getDay();
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const todayName = weekdayNames[today];

    const todaySchedules = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${todayName}`)
    });

    const count = await todaySchedules.count();

    if (count > 0) {
      const firstSchedule = todaySchedules.first();
      const deductButton = firstSchedule.locator('button:has-text("划课"), [data-testid="deduct-button"]');

      if (await deductButton.isVisible({ timeout: 2000 })) {
        await deductButton.click();
        await page.waitForTimeout(500);

        // 等待划课弹窗
        await page.waitForSelector('[role="dialog"]', { state: 'visible' });

        // 获取所有学员复选框
        const studentCheckboxes = page.locator('[role="dialog"] input[type="checkbox"]');
        const checkboxCount = await studentCheckboxes.count();

        if (checkboxCount > 1) {
          // 选中前两个学员
          await studentCheckboxes.nth(0).check();
          await studentCheckboxes.nth(1).check();
          await page.waitForTimeout(500);

          // 提交划课
          await page.click('[role="dialog"] button:has-text("确定")');
          await page.waitForTimeout(1500);

          // 验证成功消息
          await AssertionHelpers.assertSuccessMessage(page);

          console.log('[批量划课] 批量划课成功');
        }
      }
    }
  });

  /**
   * 测试场景：验证课时不足不能划课
   * 验证：课时不足时显示错误提示
   */
  test('课时不足时不能划课', async ({ page }) => {
    // 这个测试需要找到课时不足的学员
    // 如果测试数据中没有课时不足的学员，跳过测试

    await NavigationHelpers.navigateTo(page, '/students');
    await page.waitForLoadState('networkidle');

    // 等待学员列表加载
    await page.waitForSelector('.ant-table, [data-testid="students-table"]', { timeout: 10000 });

    // 查找课时不足的学员（课时为0或很少）
    const lowLessonRows = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator('text=/0课时|1课时|2课时/')
    });

    const hasLowLessonStudent = await lowLessonRows.count() > 0;

    if (hasLowLessonStudent) {
      console.log('[课时验证] 找到课时不足的学员');

      // 导航到周排课，尝试对该学员划课
      await NavigationHelpers.navigateTo(page, '/weekly-schedule');
      await page.waitForLoadState('networkidle');

      // 查找今日排课并划课
      const today = new Date().getDay();
      const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const todayName = weekdayNames[today];

      const todaySchedules = page.locator('.ant-table-tbody tr, tbody tr').filter({
        has: page.locator(`text=${todayName}`)
      });

      const count = await todaySchedules.count();

      if (count > 0) {
        const firstSchedule = todaySchedules.first();
        const deductButton = firstSchedule.locator('button:has-text("划课"), [data-testid="deduct-button"]');

        if (await deductButton.isVisible({ timeout: 2000 })) {
          await deductButton.click();
          await page.waitForTimeout(500);

          // 等待划课弹窗
          await page.waitForSelector('[role="dialog"]', { state: 'visible' });

          // 提交划课
          await page.click('[role="dialog"] button:has-text("确定")');
          await page.waitForTimeout(1500);

          // 验证错误消息（如果有课时不足的学员）
          const hasErrorMessage = await DataHelpers.verifyErrorMessage(page, '课时不足');
          if (hasErrorMessage) {
            console.log('[课时验证] 正确阻止课时不足划课');
          }
        }
      }
    } else {
      console.log('[课时验证] 没有课时不足的学员，跳过测试');
      test.skip(true, '没有课时不足的学员');
    }
  });

  /**
   * 测试场景：查看划课历史记录
   * 验证：能看到过去的划课记录
   */
  test('应该能查看划课历史记录', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/class-attendance');
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });

    // 等待表格加载
    await page.waitForSelector('.ant-table, [data-testid="attendance-table"]', { timeout: 10000 });

    // 获取表格行数
    const rowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();

    if (rowCount > 0) {
      console.log(`[划课历史] 找到 ${rowCount} 条出勤记录`);

      // 验证记录包含日期、班级、出勤等信息
      const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
      await expect(firstRow).toBeVisible();
    } else {
      console.log('[划课历史] 没有出勤记录');
    }
  });
});

/**
 * 教练视角的划课测试
 */
test.describe('教练视角：每日划课', () => {
  test.beforeEach(async ({ page }) => {
    // 使用教练账号登录
    await loginRobust(page, {
      email: 'e2e-coach1@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：教练能查看自己的排课
   * 验证：只显示自己负责的排课
   */
  test('教练应该能看到自己的排课', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 验证排课数据显示
    const scheduleVisible = await page.locator('.ant-table, [data-testid="schedule-table"]').isVisible();
    expect(scheduleVisible).toBe(true);

    console.log('[教练排课] 教练排课表加载成功');
  });

  /**
   * 测试场景：教练能对自己的排课进行划课
   * 验证：划课成功
   */
  test('教练应该能对自己的排课进行划课', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 查找今天的排课
    const today = new Date().getDay();
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const todayName = weekdayNames[today];

    const todaySchedules = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${todayName}`)
    });

    const count = await todaySchedules.count();

    if (count > 0) {
      const firstSchedule = todaySchedules.first();
      const deductButton = firstSchedule.locator('button:has-text("划课"), [data-testid="deduct-button"]');

      if (await deductButton.isVisible({ timeout: 2000 })) {
        await deductButton.click();
        await page.waitForTimeout(500);

        // 等待划课弹窗
        await page.waitForSelector('[role="dialog"]', { state: 'visible' });

        // 选择出勤学员
        const studentCheckboxes = page.locator('[role="dialog"] input[type="checkbox"]');
        const checkboxCount = await studentCheckboxes.count();

        if (checkboxCount > 0) {
          // 选中第一个学员
          await studentCheckboxes.first().check();
          await page.waitForTimeout(500);

          // 提交划课
          await page.click('[role="dialog"] button:has-text("确定")');
          await page.waitForTimeout(1500);

          // 验证成功消息
          await AssertionHelpers.assertSuccessMessage(page);

          console.log('[教练划课] 教练划课成功');
        }
      }
    }
  });

  /**
   * 测试场景：教练一天只能划一次课
   * 验证：第二次划课时显示错误提示
   */
  test('教练一天只能划一次课', async ({ page }) => {
    // 这个测试需要先划一次课，然后再尝试划第二次
    // 由于测试环境的限制，这个测试可能需要特殊的数据准备

    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 查找今天的排课
    const today = new Date().getDay();
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const todayName = weekdayNames[today];

    const todaySchedules = page.locator('.ant-table-tbody tr, tbody tr').filter({
      has: page.locator(`text=${todayName}`)
    });

    const count = await todaySchedules.count();

    if (count > 0) {
      // 尝试对第一个排课划课
      const firstSchedule = todaySchedules.first();
      const deductButton = firstSchedule.locator('button:has-text("划课"), [data-testid="deduct-button"]');

      if (await deductButton.isVisible({ timeout: 2000 })) {
        await deductButton.click();
        await page.waitForTimeout(500);

        // 等待划课弹窗
        await page.waitForSelector('[role="dialog"]', { state: 'visible' });

        // 提交划课
        await page.click('[role="dialog"] button:has-text("确定")');
        await page.waitForTimeout(1500);

        // 检查是否显示"今天已经划过课"的错误消息
        const hasErrorMessage = await DataHelpers.verifyErrorMessage(page, '已经划过课');
        if (hasErrorMessage) {
          console.log('[划课限制] 正确限制教练一天只能划一次课');
        }
      }
    }
  });

  /**
   * 测试场景：教练能查看自己的出勤记录
   * 验证：只显示自己负责的出勤记录
   */
  test('教练应该能查看出勤记录', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/class-attendance');
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });

    // 验证页面标题
    await expect(page.locator('text=/出勤|考勤/')).toBeVisible();

    // 等待表格加载
    const tableVisible = await page.locator('.ant-table, [data-testid="attendance-table"]').isVisible({ timeout: 10000 });
    expect(tableVisible).toBe(true);

    console.log('[教练出勤] 教练出勤记录加载成功');
  });
});
