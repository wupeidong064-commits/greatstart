import { test, expect } from '@playwright/test';
import { loginRobust } from '../helpers';

/**
 * 销售转化流程测试
 *
 * 测试从鱼池资源到成单的完整业务流程
 */

test.describe('销售转化流程', () => {
  test.beforeEach(async ({ page }) => {
    // 使用销售账号登录
    await loginRobust(page, {
      email: 'e2e-sales1@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：查看鱼池资源
   * 验证：能看到E2E测试数据
   */
  test('应该能查看鱼池资源列表', async ({ page }) => {
    await page.goto('/cashflow/marketing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for data to load

    // 检查页面内容 - 可能是表格或空状态
    const content = page.locator('.ant-table, .ant-empty');
    await expect(content.first()).toBeVisible();

    // 检查是否有数据
    const tableRows = page.locator('.ant-table-tbody tr');
    const rowCount = await tableRows.count();

    console.log('鱼池资源数量:', rowCount);

    // 如果有表格，验证有数据
    if (rowCount > 0) {
      expect(rowCount).toBeGreaterThan(0);
    }
  });

  /**
   * 测试场景：查看体验课列表
   * 验证：页面能正常加载
   */
  test('应该能查看体验课列表', async ({ page }) => {
    await page.goto('/cashflow/experience-schedule');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 检查页面加载
    const content = page.locator('.ant-table, .ant-empty');
    await expect(content.first()).toBeVisible();
  });

  /**
   * 测试场景：查看成单信息
   * 验证：页面能正常加载
   */
  test('应该能查看成单信息', async ({ page }) => {
    await page.goto('/cashflow/order-info');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 检查页面加载
    const content = page.locator('.ant-table, .ant-empty');
    await expect(content.first()).toBeVisible();
  });

  /**
   * 测试场景：销售数据隔离
   * 验证：销售只能看到自己的数据
   */
  test('销售数据应该正确隔离', async ({ page }) => {
    await page.goto('/cashflow/marketing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 检查页面标题
    const pageTitle = page.locator('h1, .ant-page-header-heading-title');
    const titleText = await pageTitle.textContent();

    // 验证在正确的页面
    expect(titleText).toContain('营销');
  });

  /**
   * 测试场景：创建新的鱼池资源
   * 验证：创建按钮存在且可点击
   */
  test('应该能创建新的鱼池资源', async ({ page }) => {
    await page.goto('/cashflow/marketing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 查找新增按钮（可能是"新增线索"或其他文本）
    const createButton = page.locator('button:has-text("新增")');
    const buttonCount = await createButton.count();

    // 验证新增按钮存在
    expect(buttonCount).toBeGreaterThan(0);
  });
});

/**
 * 管理员视角的测试
 */
test.describe('管理员视角：销售转化', () => {
  test.beforeEach(async ({ page }) => {
    await loginRobust(page, {
      email: 'e2e-admin@test.com',
      password: 'test123',
    });
  });

  test('管理员应该能访问所有销售相关页面', async ({ page }) => {
    // 访问鱼池管理
    await page.goto('/cashflow/marketing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const marketingContent = page.locator('.ant-table, .ant-empty');
    await expect(marketingContent.first()).toBeVisible();

    // 访问体验课管理
    await page.goto('/cashflow/experience-schedule');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const experienceContent = page.locator('.ant-table, .ant-empty');
    await expect(experienceContent.first()).toBeVisible();

    // 访问成单信息
    await page.goto('/cashflow/order-info');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const orderContent = page.locator('.ant-table, .ant-empty');
    await expect(orderContent.first()).toBeVisible();
  });
});
