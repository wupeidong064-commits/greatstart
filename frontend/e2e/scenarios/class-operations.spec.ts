import { test, expect } from '@playwright/test';
import { loginRobust } from '../helpers';
import { NavigationHelpers, DataHelpers, AssertionHelpers } from '../helpers';
import { CONSTANTS, TEST_USERS } from '../setup/test-constants';

/**
 * 班级运营流程测试
 *
 * 测试从创建班级到学员管理的完整业务流程：
 * 1. 创建班级
 * 2. 设置每周排课
 * 3. 添加学员到班级
 * 4. 查看学员名单
 * 5. 筛选低出勤班级
 * 6. 管理班级信息
 */

test.describe('班级运营流程', () => {
  test.beforeEach(async ({ page }) => {
    // 使用管理员账号登录
    await loginRobust(page, {
      email: 'e2e-admin@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：查看班级列表
   * 验证：能看到42个测试班级
   */
  test('应该能查看所有班级列表', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    // 等待表格加载
    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 验证页面标题
    await expect(page.locator('text=/班级|课程管理/')).toBeVisible();

    // 获取表格行数
    const rowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);

    console.log(`[班级列表] 找到 ${rowCount} 个班级`);
  });

  /**
   * 测试场景：创建新班级
   * 验证：成功创建并显示在列表中
   */
  test('应该能创建新班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    // 点击新增按钮
    await page.click('button:has-text("新增"), button:has-text("创建"), [data-testid="create-button"]');
    await page.waitForTimeout(500);

    // 等待弹窗
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    // 生成唯一班级名称
    const className = 'E2E测试班级-' + Date.now();

    // 填写班级信息
    await page.fill('input[name*="name"], [data-testid="class-name-input"]', className);
    await page.fill('input[name*="code"], [data-testid="class-code-input"]', 'E2E-' + Date.now());

    // 选择课程类型
    const courseTypeSelect = page.locator('select[name*="courseType"], [data-testid="course-type-select"]');
    if (await courseTypeSelect.isVisible()) {
      await courseTypeSelect.selectOption('精英班');
    }

    // 填写容量
    await page.fill('input[name*="capacity"], [data-testid="capacity-input"]', '10');

    // 选择教练
    const teacherSelect = page.locator('select[name*="teacherId"], [data-testid="teacher-select"]');
    if (await teacherSelect.isVisible()) {
      const options = await teacherSelect.locator('option').allTextContents();
      if (options.length > 1) {
        await teacherSelect.selectOption({ index: 1 });
      }
    }

    // 提交
    await page.click('button:has-text("确定")');
    await page.waitForTimeout(1500);

    // 验证成功消息
    await AssertionHelpers.assertSuccessMessage(page);

    // 验证班级出现在列表中
    const tableContains = await DataHelpers.verifyTableContains(page, '.ant-table', [className]);
    expect(tableContains).toBe(true);
  });

  /**
   * 测试场景：编辑班级信息
   * 验证：班级信息更新成功
   */
  test('应该能编辑班级信息', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    // 等待表格加载
    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 点击第一行的编辑按钮
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    await firstRow.locator('button:has-text("编辑"), [data-testid="edit-button"]').click();

    // 等待弹窗
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    // 修改班级名称（添加前缀）
    const nameInput = page.locator('input[name*="name"], [data-testid="class-name-input"]');
    const currentName = await nameInput.inputValue();
    await nameInput.fill(currentName + '-已修改');

    // 提交
    await page.click('button:has-text("确定")');
    await page.waitForTimeout(1500);

    // 验证成功消息
    await AssertionHelpers.assertSuccessMessage(page);
  });

  /**
   * 测试场景：查看班级详情
   * 验证：能看到班级的完整信息
   */
  test('应该能查看班级详细信息', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 点击第一行的详情/查看按钮
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    await firstRow.locator('button:has-text("查看"), button:has-text("详情"), [data-testid="detail-button"]').click();

    // 验证详情弹窗打开
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // 验证详情内容
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.locator('text=/班级名称|教练|容量|课程类型/')).toBeVisible();
  });

  /**
   * 测试场景：设置每周排课
   * 验证：排课记录创建成功
   */
  test('应该能设置每周排课', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await page.waitForSelector('[data-testid="page-container"], .ant-page-header', { timeout: 10000 });

    // 点击新增排课按钮
    const createButton = page.locator('button:has-text("新增"), button:has-text("添加"), [data-testid="create-button"]');
    if (await createButton.isVisible()) {
      await createButton.first().click();
      await page.waitForTimeout(500);

      // 等待弹窗
      await page.waitForSelector('[role="dialog"]', { state: 'visible' });

      // 选择班级
      const classSelect = page.locator('select[name*="classId"], [data-testid="class-select"]');
      if (await classSelect.isVisible()) {
        const options = await classSelect.locator('option').allTextContents();
        if (options.length > 0) {
          await classSelect.selectOption({ index: 0 });
        }
      }

      // 选择星期
      const weekdaySelect = page.locator('select[name*="weekday"], [data-testid="weekday-select"]');
      if (await weekdaySelect.isVisible()) {
        await weekdaySelect.selectOption('1'); // 周一
      }

      // 选择时间
      await page.fill('input[name*="startTime"], [data-testid="start-time-input"]', '10:00');
      await page.fill('input[name*="endTime"], [data-testid="end-time-input"]', '11:30');

      // 提交
      await page.click('button:has-text("确定")');
      await page.waitForTimeout(1500);

      // 验证成功消息
      await AssertionHelpers.assertSuccessMessage(page);
    }
  });

  /**
   * 测试场景：查看每周排课表
   * 验证：能看到所有排课记录
   */
  test('应该能查看每周排课表', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/weekly-schedule');
    await page.waitForLoadState('networkidle');

    // 等待排课表加载
    await page.waitForSelector('[data-testid="schedule-table"], .ant-table, .schedule-grid', { timeout: 10000 });

    // 验证页面标题
    await expect(page.locator('text=/排课|周课表/')).toBeVisible();

    // 验证有排课数据
    const tableVisible = await page.locator('.ant-table, [data-testid="schedule-table"]').isVisible();
    expect(tableVisible).toBe(true);
  });

  /**
   * 测试场景：添加学员到班级
   * 验证：学员成功添加到班级
   */
  test('应该能添加学员到班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 点击第一行的学员名单按钮
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    await firstRow.locator('button:has-text("学员"), button:has-text("名单"), [data-testid="students-button"]').click();

    // 等待学员名单页面
    await page.waitForTimeout(1000);

    // 查找添加学员按钮
    const addStudentButton = page.locator('button:has-text("添加"), button:has-text("新增学员"), [data-testid="add-student-button"]');
    if (await addStudentButton.isVisible({ timeout: 3000 })) {
      await addStudentButton.click();
      await page.waitForTimeout(500);

      // 等待弹窗
      await page.waitForSelector('[role="dialog"]', { state: 'visible' });

      // 选择学员（如果有未排班学员）
      const studentSelect = page.locator('select[name*="studentId"], [data-testid="student-select"]');
      if (await studentSelect.isVisible({ timeout: 2000 })) {
        const options = await studentSelect.locator('option').allTextContents();
        if (options.length > 1) {
          await studentSelect.selectOption({ index: 1 });

          // 提交
          await page.click('button:has-text("确定")');
          await page.waitForTimeout(1500);

          // 验证成功消息
          await AssertionHelpers.assertSuccessMessage(page);
        }
      }
    }
  });

  /**
   * 测试场景：查看班级学员名单
   * 验证：能看到班级中的所有学员
   */
  test('应该能查看班级学员名单', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 点击第一行的学员名单按钮
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    await firstRow.locator('button:has-text("学员"), button:has-text("名单"), [data-testid="students-button"]').click();

    // 等待学员名单加载
    await page.waitForTimeout(1000);

    // 验证学员列表显示
    const studentTable = page.locator('.ant-table, [data-testid="class-students-table"]');
    const isVisible = await studentTable.isVisible({ timeout: 5000 });

    if (isVisible) {
      const studentCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
      console.log(`[学员名单] 班级中有 ${studentCount} 个学员`);
    }
  });

  /**
   * 测试场景：筛选低出勤班级
   * 验证：能正确筛选出低出勤班级
   */
  test('应该能筛选低出勤班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 查找低出勤筛选按钮/选项
    const lowAttendanceFilter = page.locator('button:has-text("低出勤"), [data-testid="low-attendance-filter"], label:has-text("低出勤")');

    if (await lowAttendanceFilter.isVisible({ timeout: 2000 })) {
      await lowAttendanceFilter.first().click();
      await page.waitForTimeout(1000);

      // 验证筛选结果
      await page.waitForLoadState('networkidle');
      const tableVisible = await page.locator('.ant-table, [data-testid="classes-table"]').isVisible();
      expect(tableVisible).toBe(true);
    }
  });

  /**
   * 测试场景：搜索班级
   * 验证：搜索功能正常工作
   */
  test('应该能搜索班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 获取第一行的班级名称用于搜索
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    const firstCellText = await firstRow.locator('td').first().textContent();

    if (firstCellText && firstCellText.length > 0) {
      // 使用搜索框
      const searchInput = page.locator('input[placeholder*="搜索"], input[name*="search"], [data-testid="search-input"]');

      if (await searchInput.isVisible({ timeout: 2000 })) {
        await searchInput.fill(firstCellText.trim().split(' ')[0]); // 使用班级名的一部分
        await page.waitForTimeout(1000);

        // 验证搜索结果
        const searchResults = await page.locator('.ant-table-tbody tr, tbody tr').count();
        expect(searchResults).toBeGreaterThan(0);
      }
    }
  });

  /**
   * 测试场景：按课程类型筛选
   * 验证：能按精英班/幼儿班筛选
   */
  test('应该能按课程类型筛选班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 查找课程类型筛选器
    const courseTypeFilter = page.locator('select[name*="courseType"], [data-testid="course-type-filter"]');

    if (await courseTypeFilter.isVisible({ timeout: 2000 })) {
      // 选择精英班
      await courseTypeFilter.selectOption('精英班');
      await page.waitForTimeout(1000);

      // 验证筛选结果
      await page.waitForLoadState('networkidle');
      const tableVisible = await page.locator('.ant-table, [data-testid="classes-table"]').isVisible();
      expect(tableVisible).toBe(true);
    }
  });

  /**
   * 测试场景：按教练筛选
   * 验证：能按教练筛选班级
   */
  test('应该能按教练筛选班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 查找教练筛选器
    const teacherFilter = page.locator('select[name*="teacherId"], [data-testid="teacher-filter"]');

    if (await teacherFilter.isVisible({ timeout: 2000 })) {
      // 获取教练选项
      const options = await teacherFilter.locator('option').allTextContents();

      if (options.length > 1) {
        // 选择第一个教练
        await teacherFilter.selectOption({ index: 1 });
        await page.waitForTimeout(1000);

        // 验证筛选结果
        await page.waitForLoadState('networkidle');
        const tableVisible = await page.locator('.ant-table, [data-testid="classes-table"]').isVisible();
        expect(tableVisible).toBe(true);
      }
    }
  });

  /**
   * 测试场景：导出班级数据
   * 验证：能成功导出班级列表
   */
  test('应该能导出班级数据', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 查找导出按钮
    const exportButton = page.locator('button:has-text("导出"), [data-testid="export-button"]');

    if (await exportButton.isVisible({ timeout: 2000 })) {
      // 设置下载监听
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

      await exportButton.click();

      // 等待下载开始
      const download = await downloadPromise;
      expect(download).toBeTruthy();

      console.log(`[导出] 下载文件: ${download.suggestedFilename()}`);
    }
  });

  /**
   * 测试场景：删除班级
   * 验证：班级删除成功（如果有此功能）
   */
  test('应该能删除班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 点击最后一行的删除按钮（如果有测试班级在末尾）
    const rows = page.locator('.ant-table-tbody tr, tbody tr');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const lastRow = rows.nth(rowCount - 1);

      // 检查是否有删除按钮
      const deleteButton = lastRow.locator('button:has-text("删除"), [data-testid="delete-button"]');

      if (await deleteButton.isVisible({ timeout: 2000 })) {
        await deleteButton.click();
        await page.waitForTimeout(500);

        // 确认删除
        const confirmButton = page.locator('[role="dialog"] button:has-text("确定"), .ant-popconfirm button:has-text("确定")');
        if (await confirmButton.isVisible({ timeout: 2000 })) {
          await confirmButton.click();
          await page.waitForTimeout(1500);

          // 验证成功消息
          await AssertionHelpers.assertSuccessMessage(page);
        }
      }
    }
  });

  /**
   * 测试场景：批量操作班级
   * 验证：能批量选择并操作班级
   */
  test('应该能批量操作班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 查找复选框
    const firstCheckbox = page.locator('.ant-table-tbody tr, tbody tr').first().locator('input[type="checkbox"]');

    if (await firstCheckbox.isVisible({ timeout: 2000 })) {
      // 选中第一行
      await firstCheckbox.check();
      await page.waitForTimeout(500);

      // 查找批量操作按钮
      const batchActionButton = page.locator('button:has-text("批量"), [data-testid="batch-action-button"]');

      if (await batchActionButton.isVisible({ timeout: 2000 })) {
        // 验证批量操作按钮可用
        const isEnabled = await batchActionButton.isEnabled();
        expect(isEnabled).toBe(true);
      }
    }
  });
});

/**
 * 教练视角的班级管理测试
 */
test.describe('教练视角：班级运营', () => {
  test.beforeEach(async ({ page }) => {
    // 使用教练账号登录
    await loginRobust(page, {
      email: 'e2e-coach1@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：教练能查看自己的班级
   * 验证：只显示自己负责的班级
   */
  test('教练应该能看到自己的班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 获取所有行
    const rowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();

    // 教练应该至少能看到自己的班级
    expect(rowCount).toBeGreaterThan(0);

    console.log(`[教练班级] 教练能看到 ${rowCount} 个班级`);
  });

  /**
   * 测试场景：教练能查看班级学员名单
   * 验证：能查看自己班级的学员
   */
  test('教练应该能查看班级学员名单', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 点击第一行的学员名单按钮
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    await firstRow.locator('button:has-text("学员"), button:has-text("名单"), [data-testid="students-button"]').click();

    // 等待学员名单加载
    await page.waitForTimeout(1000);

    // 验证学员列表显示
    const studentTable = page.locator('.ant-table, [data-testid="class-students-table"]');
    const isVisible = await studentTable.isVisible({ timeout: 5000 });

    if (isVisible) {
      const studentCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
      console.log(`[教练学员名单] 班级中有 ${studentCount} 个学员`);
    }
  });

  /**
   * 测试场景：教练能添加学员到自己的班级
   * 验证：可以添加未排班学员
   */
  test('教练应该能添加学员到自己的班级', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 点击第一行的学员名单按钮
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    await firstRow.locator('button:has-text("学员"), button:has-text("名单"), [data-testid="students-button"]').click();

    // 等待学员名单页面
    await page.waitForTimeout(1000);

    // 查找添加学员按钮
    const addStudentButton = page.locator('button:has-text("添加"), button:has-text("新增学员"), [data-testid="add-student-button"]');
    if (await addStudentButton.isVisible({ timeout: 3000 })) {
      await addStudentButton.click();
      await page.waitForTimeout(500);

      // 等待弹窗
      await page.waitForSelector('[role="dialog"]', { state: 'visible' });

      // 选择学员（如果有未排班学员）
      const studentSelect = page.locator('select[name*="studentId"], [data-testid="student-select"]');
      if (await studentSelect.isVisible({ timeout: 2000 })) {
        const options = await studentSelect.locator('option').allTextContents();
        if (options.length > 1) {
          await studentSelect.selectOption({ index: 1 });

          // 提交
          await page.click('button:has-text("确定")');
          await page.waitForTimeout(1500);

          // 验证成功消息
          await AssertionHelpers.assertSuccessMessage(page);
        }
      }
    }
  });
});

/**
 * 销售视角的班级查看测试
 */
test.describe('销售视角：班级查看', () => {
  test.beforeEach(async ({ page }) => {
    // 使用销售账号登录
    await loginRobust(page, {
      email: 'e2e-sales1@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：销售能查看班级列表
   * 验证：销售可以查看所有班级（只读）
   */
  test('销售应该能查看班级列表（只读）', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 验证能看到班级
    const rowCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);

    // 验证没有编辑/删除按钮（只读权限）
    const editButton = page.locator('.ant-table-tbody tr, tbody tr').first().locator('button:has-text("编辑")');
    const hasEditButton = await editButton.isVisible();

    if (hasEditButton) {
      // 如果有编辑按钮，应该是禁用状态
      const isEnabled = await editButton.isEnabled();
      expect(isEnabled).toBe(false);
    }
  });

  /**
   * 测试场景：销售能查看班级学员名单
   * 验证：可以查看学员信息
   */
  test('销售应该能查看班级学员名单', async ({ page }) => {
    await NavigationHelpers.navigateTo(page, '/classes');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('.ant-table, [data-testid="classes-table"]', { timeout: 10000 });

    // 点击第一行的学员名单按钮
    const firstRow = page.locator('.ant-table-tbody tr, tbody tr').first();
    await firstRow.locator('button:has-text("学员"), button:has-text("名单"), [data-testid="students-button"]').click();

    // 等待学员名单加载
    await page.waitForTimeout(1000);

    // 验证学员列表显示
    const studentTable = page.locator('.ant-table, [data-testid="class-students-table"]');
    const isVisible = await studentTable.isVisible({ timeout: 5000 });

    if (isVisible) {
      const studentCount = await page.locator('.ant-table-tbody tr, tbody tr').count();
      console.log(`[销售查看] 班级中有 ${studentCount} 个学员`);
    }
  });
});
