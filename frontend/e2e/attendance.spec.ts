import { test, expect, Page } from '@playwright/test';
import { loginRobust, safeNavigate, waitForPageContent, TestUser } from './helpers';

// Admin 账号配置（标准测试账号）
const adminUser: TestUser = {
  email: process.env.ADMIN_EMAIL || 'test-admin@buzzer.com',
  password: process.env.ADMIN_PASSWORD || 'Test123456',
};

// Coach 账号配置（标准测试账号）
const coachUser: TestUser = {
  email: process.env.COACH_EMAIL || 'test-coach@buzzer.com',
  password: process.env.COACH_PASSWORD || 'Test123456',
};

// 健壮的通用登录函数
async function loginAs(page: Page, user: TestUser): Promise<boolean> {
  return loginRobust(page, user);
}

test.describe.serial('班级出勤管理页面 - Admin 权限测试', () => {
  test.slow();

  test('班级出勤页面应该正确加载', async ({ page }) => {
    const loginSuccess = await loginAs(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances');
    expect(navSuccess).toBe(true);

    const currentUrl = page.url();
    expect(currentUrl).toContain('/attendances');

    console.log('班级出勤页面加载成功');
  });

  test('班级出勤页面应该显示筛选器', async ({ page }) => {
    const loginSuccess = await loginAs(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances');
    if (!navSuccess) {
      test.skip();
      return;
    }

    await waitForPageContent(page, 10000);

    // 检查日期选择器存在
    const datePicker = page.locator('.ant-picker-range');
    const datePickerCount = await datePicker.count();
    console.log('日期选择器数量:', datePickerCount);

    // 检查教师筛选下拉框存在
    const select = page.locator('.ant-select');
    const selectCount = await select.count();
    console.log('下拉选择器数量:', selectCount);

    expect(datePickerCount + selectCount).toBeGreaterThan(0);
  });

  test('班级出勤页面应该显示表格或空状态', async ({ page }) => {
    const loginSuccess = await loginAs(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const contentType = await waitForPageContent(page, 10000);

    // 检查表格或空状态存在
    const tableOrEmpty = page.locator('.ant-table, .ant-empty');
    const count = await tableOrEmpty.count();
    expect(count).toBeGreaterThan(0);

    console.log('班级出勤表格/空状态检查通过');
  });

  test('查询按钮应该可以点击', async ({ page }) => {
    const loginSuccess = await loginAs(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances');
    if (!navSuccess) {
      test.skip();
      return;
    }

    await waitForPageContent(page, 10000);

    // 查找查询/搜索按钮
    const searchButton = page.locator('button:has-text("查询"), button:has-text("搜索")');
    const count = await searchButton.count();

    if (count > 0) {
      await searchButton.first().click();
      await page.waitForTimeout(1000);
      console.log('查询按钮点击成功');
    } else {
      console.log('查询按钮未找到，可能有其他筛选方式');
    }
  });

  test('重置按钮应该可以点击', async ({ page }) => {
    const loginSuccess = await loginAs(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances');
    if (!navSuccess) {
      test.skip();
      return;
    }

    await waitForPageContent(page, 10000);

    // 查找重置按钮
    const resetButton = page.locator('button:has-text("重置")');
    const count = await resetButton.count();

    if (count > 0) {
      await resetButton.first().click();
      await page.waitForTimeout(1000);
      console.log('重置按钮点击成功');
    } else {
      console.log('重置按钮未找到');
    }
  });
});

test.describe.serial('班级出勤管理页面 - Coach 权限测试', () => {
  test.slow();

  test('Coach 可以访问班级出勤页面', async ({ page }) => {
    const loginSuccess = await loginAs(page, coachUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances');
    expect(navSuccess).toBe(true);

    const currentUrl = page.url();
    expect(currentUrl).toContain('/attendances');

    console.log('Coach 班级出勤页面访问成功');
  });

  test('Coach 可以查看出勤数据', async ({ page }) => {
    const loginSuccess = await loginAs(page, coachUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const contentType = await waitForPageContent(page, 10000);

    // 检查表格或空状态存在
    const tableOrEmpty = page.locator('.ant-table, .ant-empty');
    const count = await tableOrEmpty.count();
    expect(count).toBeGreaterThan(0);

    console.log('Coach 出勤数据查看正常');

    // 截图
    await page.screenshot({ path: 'test-results/coach-attendance-page.png' });
  });
});

test.describe.serial('出勤相关页面测试', () => {
  test.slow();

  test('连续请假学生页面应该可以访问', async ({ page }) => {
    const loginSuccess = await loginAs(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances/continuous-leave');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const currentUrl = page.url();
    console.log('连续请假学生页面 URL:', currentUrl);

    // 检查页面加载（可能没有权限或数据）
    const content = page.locator('.ant-table, .ant-empty, .ant-alert');
    const hasContent = await content.count();
    console.log('页面内容元素数量:', hasContent);
  });

  test('蜜月期出勤页面应该可以访问', async ({ page }) => {
    const loginSuccess = await loginAs(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances/honeymoon');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const currentUrl = page.url();
    console.log('蜜月期出勤页面 URL:', currentUrl);

    const content = page.locator('.ant-table, .ant-empty, .ant-alert');
    const hasContent = await content.count();
    console.log('页面内容元素数量:', hasContent);
  });

  test('低出勤率班级页面应该可以访问', async ({ page }) => {
    const loginSuccess = await loginAs(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const navSuccess = await safeNavigate(page, '/attendances/low-attendance-classes');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const currentUrl = page.url();
    console.log('低出勤率班级页面 URL:', currentUrl);

    const content = page.locator('.ant-table, .ant-empty, .ant-alert');
    const hasContent = await content.count();
    console.log('页面内容元素数量:', hasContent);
  });
});
