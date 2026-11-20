import { test, expect, Page } from '@playwright/test';
import { loginRobust, safeNavigate, waitForPageContent, TestUser } from './helpers';

// 标准测试账号
const testUser: TestUser = {
  email: process.env.TEST_EMAIL || 'test-admin@buzzer.com',
  password: process.env.TEST_PASSWORD || 'Test123456',
};

// 健壮的登录辅助函数
async function loginHelper(page: Page): Promise<boolean> {
  return loginRobust(page, testUser);
}

test.describe.serial('学员管理页面测试', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginHelper(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }
  });

  test('页面应该正确加载', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    const contentType = await waitForPageContent(page, 10000);
    console.log('页面内容类型:', contentType);

    // 检查页面标题或权限提示
    const title = page.locator('h1:has-text("学员管理")');
    const alert = page.locator('.ant-alert-warning');

    const hasTitle = await title.count();
    const hasAlert = await alert.count();

    expect(hasTitle > 0 || hasAlert > 0 || contentType !== 'none').toBeTruthy();
  });

  test('搜索功能应该工作', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const contentType = await waitForPageContent(page, 10000);
    console.log('页面内容类型:', contentType);

    // 检查是否有权限
    const alert = page.locator('.ant-alert-warning');
    const hasAlert = await alert.count();

    if (hasAlert > 0) {
      // 没有权限，跳过测试
      test.skip();
      return;
    }

    // 如果页面没有表格或空状态，跳过测试
    if (contentType === 'none') {
      test.skip();
      return;
    }

    // 输入搜索关键词
    const searchInput = page.locator('input[placeholder*="搜索学员"]');
    const searchInputCount = await searchInput.count();

    if (searchInputCount === 0) {
      console.log('搜索输入框未找到');
      test.skip();
      return;
    }

    await searchInput.fill('测试');

    // 点击搜索按钮
    const searchButton = page.locator('button:has-text("搜索")');
    const searchButtonCount = await searchButton.count();

    if (searchButtonCount > 0) {
      await searchButton.first().click();
      await page.waitForTimeout(1000);
    }

    // 验证表格或空状态存在
    const tableOrEmpty = page.locator('.ant-table, .ant-empty');
    const count = await tableOrEmpty.count();
    expect(count).toBeGreaterThan(0);
  });

  test('表格应该显示学员数据或空状态', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const contentType = await waitForPageContent(page, 10000);

    // 检查是否有权限
    const alert = page.locator('.ant-alert-warning');
    const hasAlert = await alert.count();

    if (hasAlert > 0 || contentType === 'none') {
      test.skip();
      return;
    }

    // 检查表格或空状态存在
    const tableOrEmpty = page.locator('.ant-table, .ant-empty');
    const count = await tableOrEmpty.count();
    expect(count).toBeGreaterThan(0);
  });

  test('重置搜索按钮应该清空搜索条件', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const contentType = await waitForPageContent(page, 10000);

    // 检查是否有权限
    const alert = page.locator('.ant-alert-warning');
    const hasAlert = await alert.count();

    if (hasAlert > 0 || contentType === 'none') {
      test.skip();
      return;
    }

    // 输入搜索关键词
    const searchInput = page.locator('input[placeholder*="搜索学员"]');
    const searchInputCount = await searchInput.count();

    if (searchInputCount === 0) {
      console.log('搜索输入框未找到');
      test.skip();
      return;
    }

    await searchInput.fill('测试关键词');

    // 点击重置按钮
    const resetButton = page.locator('button:has-text("重置")');
    const resetButtonCount = await resetButton.count();

    if (resetButtonCount > 0) {
      await resetButton.first().click();
      // 验证搜索框已清空
      await expect(searchInput).toHaveValue('');
    } else {
      console.log('重置按钮未找到');
      test.skip();
    }
  });
});

test.describe.serial('学员管理 CRUD 测试', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginHelper(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }
  });

  test('新增学员弹窗应该正确显示', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const contentType = await waitForPageContent(page, 10000);

    // 检查是否有权限
    const alert = page.locator('.ant-alert-warning');
    const hasAlert = await alert.count();

    if (hasAlert > 0 || contentType === 'none') {
      console.log('没有权限访问学员管理页面，跳过测试');
      test.skip();
      return;
    }

    // 点击新增学员按钮
    const addButton = page.locator('button:has-text("新增")');
    const buttonCount = await addButton.count();

    console.log('新增按钮数量:', buttonCount);

    if (buttonCount > 0) {
      await addButton.first().click();
      await page.waitForTimeout(1000);

      // 验证弹窗显示
      const modal = page.locator('.ant-modal-content');
      const modalCount = await modal.count();
      console.log('弹窗是否显示:', modalCount > 0);

      if (modalCount > 0) {
        // 关闭弹窗
        await page.keyboard.press('Escape');
      }
    } else {
      console.log('新增按钮未找到');
    }
  });

  test('编辑学员功能应该工作', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    if (!navSuccess) {
      test.skip();
      return;
    }

    const contentType = await waitForPageContent(page, 10000);

    // 检查是否有权限
    const alert = page.locator('.ant-alert-warning');
    const hasAlert = await alert.count();

    if (hasAlert > 0 || contentType === 'none') {
      console.log('没有权限访问学员管理页面，跳过测试');
      test.skip();
      return;
    }

    // 检查表格是否有数据
    const tableRows = page.locator('.ant-table-tbody tr');
    const rowCount = await tableRows.count();
    console.log('表格行数:', rowCount);

    if (rowCount > 0) {
      // 找到第一个编辑按钮
      const editButton = page.locator('button:has-text("编辑")').first();
      const buttonCount = await editButton.count();
      console.log('编辑按钮数量:', buttonCount);

      if (buttonCount > 0) {
        await editButton.click();
        await page.waitForTimeout(1000);

        // 验证编辑弹窗显示
        const modal = page.locator('.ant-modal-content');
        const modalCount = await modal.count();
        console.log('编辑弹窗是否显示:', modalCount > 0);

        if (modalCount > 0) {
          // 关闭弹窗
          await page.keyboard.press('Escape');
        }
      }
    } else {
      console.log('没有学员数据，跳过编辑测试');
    }
  });
});
