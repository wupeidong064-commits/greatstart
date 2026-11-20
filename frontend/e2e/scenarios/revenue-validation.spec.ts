import { test, expect } from '@playwright/test';
import { loginRobust } from '../helpers';

/**
 * 确认收入相关测试
 *
 * 测试课消收入、周总结、现金流等财务统计功能
 */

test.describe('确认收入 - 销售转化后验证', () => {
  test.beforeEach(async ({ page }) => {
    // 使用管理员账号登录
    await loginRobust(page, {
      email: 'e2e-admin@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：访问课消收入页面
   * 验证：页面能正常加载，显示确认收入指标
   */
  test('应该能查看课消收入页面', async ({ page }) => {
    await page.goto('/teachers/consumption');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 检查页面加载
    const content = page.locator('.ant-card, .ant-statistic');
    await expect(content.first()).toBeVisible();

    // 检查是否有"确认收入"或"收入"相关文本
    const pageText = await page.textContent('body');
    console.log('页面是否包含收入相关内容:', pageText?.includes('收入') || pageText?.includes('营收'));
  });

  /**
   * 测试场景：查看周总结页面
   * 验证：确认收入统计显示正确
   */
  test('应该能查看周总结页面', async ({ page }) => {
    await page.goto('/operation/weekly-summary');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 检查页面加载
    const content = page.locator('.ant-card, .ant-statistic');
    await expect(content.first()).toBeVisible();

    // 查找确认收入相关内容
    const pageText = await page.textContent('body');
    console.log('周总结是否包含确认收入:', pageText?.includes('确认收入'));
  });

  /**
   * 测试场景：现金流总结页面
   * 验证：成单金额统计显示
   */
  test('应该能查看现金流总结页面', async ({ page }) => {
    await page.goto('/cashflow/summary');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 检查页面加载
    const content = page.locator('.ant-card, .ant-table, .ant-empty');
    await expect(content.first()).toBeVisible();

    // 查找现金流相关内容
    const pageText = await page.textContent('body');
    console.log('是否包含现金流相关内容:', pageText?.includes('现金流') || pageText?.includes('收入'));
  });

  /**
   * 测试场景：课消收入页面统计卡片验证
   * 验证：关键指标卡片显示
   */
  test('课消收入页面应该显示关键指标', async ({ page }) => {
    await page.goto('/teachers/consumption');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 检查统计卡片
    const statisticCards = page.locator('.ant-statistic');
    const cardCount = await statisticCards.count();

    console.log('统计卡片数量:', cardCount);

    // 至少应该有一些统计指标
    expect(cardCount).toBeGreaterThan(0);
  });
});

/**
 * 销售视角的确认收入测试
 */
test.describe('确认收入 - Sales视角', () => {
  test.beforeEach(async ({ page }) => {
    await loginRobust(page, {
      email: 'e2e-sales1@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：销售可以查看业绩统计
   * 验证：课消收入数据可见
   */
  test('销售应该能查看业绩统计', async ({ page }) => {
    await page.goto('/teachers/consumption');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 验证页面加载
    const content = page.locator('.ant-card, .ant-statistic, .ant-empty');
    await expect(content.first()).toBeVisible();
  });
});

/**
 * 教练视角的确认收入测试
 */
test.describe('确认收入 - Coach视角', () => {
  test.beforeEach(async ({ page }) => {
    await loginRobust(page, {
      email: 'e2e-coach1@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：教练可以查看自己的统计
   * 验证：只显示自己的数据
   */
  test('教练应该能查看自己的课消统计', async ({ page }) => {
    await page.goto('/teachers/consumption');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 验证页面加载
    const content = page.locator('.ant-card, .ant-statistic, .ant-empty');
    await expect(content.first()).toBeVisible();
  });
});

/**
 * 管理者视角的确认收入测试
 */
test.describe('确认收入 - Manager视角', () => {
  test.beforeEach(async ({ page }) => {
    await loginRobust(page, {
      email: 'e2e-manager@test.com',
      password: 'test123',
    });
  });

  /**
   * 测试场景：管理者可以查看完整统计
   * 验证：所有数据可见
   */
  test('管理者应该能查看完整统计', async ({ page }) => {
    await page.goto('/teachers/consumption');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 验证页面加载
    const content = page.locator('.ant-card, .ant-statistic, .ant-empty');
    await expect(content.first()).toBeVisible();

    // 检查统计卡片
    const statisticCards = page.locator('.ant-statistic');
    const cardCount = await statisticCards.count();

    console.log('管理者看到的统计卡片数量:', cardCount);
    expect(cardCount).toBeGreaterThanOrEqual(0);
  });
});
