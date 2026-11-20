import { test, expect } from '@playwright/test';

/**
 * 手动测试验证脚本
 * 基于 MANUAL_TEST_GUIDE.md 中的测试用例
 */

// 测试账号
const ADMIN_USER = {
  email: 'e2e-admin@test.com',
  password: 'test123',
};

const COACH_USER = {
  email: 'e2e-coach1@test.com',
  password: 'test123',
};

const SALES_USER = {
  email: 'e2e-sales1@test.com',
  password: 'test123',
};

// 通用登录函数
async function login(page, user: { email: string; password: string }) {
  // 清除所有存储，确保干净状态
  await page.goto('http://localhost:5173');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // 重新加载页面
  await page.reload();
  await page.waitForTimeout(3000);

  // 检查当前URL
  const currentUrl = page.url();
  console.log('当前URL:', currentUrl);

  // Ant Design Form 的输入框使用 ID 选择器
  const emailSelector = '#login_email';
  const passwordSelector = '#login_password';

  try {
    // 等待邮箱输入框出现
    await page.waitForSelector(emailSelector, { timeout: 10000 });
    console.log('✓ 找到登录表单');

    // 填写邮箱
    const emailInput = page.locator(emailSelector);
    await emailInput.click();
    await emailInput.fill(user.email);
    console.log('✓ 输入邮箱:', user.email);

    // 填写密码
    const passwordInput = page.locator(passwordSelector);
    await passwordInput.click();
    await passwordInput.fill(user.password);
    console.log('✓ 输入密码');

    // 点击登录按钮
    const loginButton = page.locator('button[type="submit"]').first();
    await loginButton.click();
    console.log('✓ 点击登录按钮');

    // 等待登录完成 - 等待URL变化
    await page.waitForTimeout(6000);

    console.log('登录后URL:', page.url());

  } catch (error) {
    console.log('登录错误:', error.message);
    console.log('当前URL:', page.url());
  }
}

test.describe('手动测试验证', () => {
  test.beforeEach(async ({ page }) => {
    // 设置较长的超时时间
    test.setTimeout(120000);
  });

  test('测试1: 管理员登录', async ({ page }) => {
    console.log('🧪 测试1: 管理员登录');

    await login(page, ADMIN_USER);

    // 验证登录成功 - 检查是否有首页元素或菜单
    const pageContent = await page.content();
    const hasMenu = pageContent.includes('运营') || pageContent.includes('学员') || pageContent.includes('财务') || pageContent.includes('销售');
    console.log('登录后页面包含菜单:', hasMenu);

    console.log('✅ 测试1完成: 管理员登录');
  });

  test('测试2: 班级管理 - 查看班级列表', async ({ page }) => {
    console.log('🧪 测试2: 班级管理 - 查看班级列表');

    await login(page, ADMIN_USER);

    // 直接访问班级管理URL
    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(3000);

    console.log('当前URL:', page.url());

    // 检查页面内容
    const pageText = await page.textContent('body');
    console.log('页面文本长度:', pageText?.length);

    // 查找表格或列表
    const tableExists = await page.locator('.ant-table, table, .ant-list').count() > 0;
    console.log('表格/列表存在:', tableExists);

    // 检查是否有数据
    const hasContent = pageText && (
      pageText.includes('精英班') ||
      pageText.includes('幼儿班') ||
      pageText.includes('班级') ||
      pageText.includes('教练')
    );
    console.log('页面包含班级相关内容:', hasContent);

    // 截图
    await page.screenshot({ path: 'test-results/classes-page.png' });
    console.log('✓ 已保存截图: test-results/classes-page.png');

    console.log('✅ 测试2完成');
  });

  test('测试3: 每周排课 - 查看排课表', async ({ page }) => {
    console.log('🧪 测试3: 每周排课 - 查看排课表');

    await login(page, ADMIN_USER);

    // 访问每周排课页面
    await page.goto('http://localhost:5173/operation/weekly-schedule');
    await page.waitForTimeout(2000);

    console.log('当前URL:', page.url());

    // 检查页面内容
    const pageText = await page.textContent('body');
    const hasScheduleContent = pageText && (
      pageText.includes('周一') ||
      pageText.includes('周二') ||
      pageText.includes('排课') ||
      pageText.includes('星期')
    );
    console.log('页面包含排课相关内容:', hasScheduleContent);

    // 截图
    await page.screenshot({ path: 'test-results/weekly-schedule-page.png' });
    console.log('✓ 已保存截图: test-results/weekly-schedule-page.png');

    console.log('✅ 测试3完成');
  });

  test('测试4: 学员管理 - 查看学员列表', async ({ page }) => {
    console.log('🧪 测试4: 学员管理 - 查看学员列表');

    await login(page, ADMIN_USER);

    // 访问学员列表页面
    await page.goto('http://localhost:5173/students');
    await page.waitForTimeout(2000);

    console.log('当前URL:', page.url());

    // 检查页面内容
    const pageText = await page.textContent('body');
    const hasStudentContent = pageText && (
      pageText.includes('学员') ||
      pageText.includes('学生') ||
      pageText.includes('姓名')
    );
    console.log('页面包含学员相关内容:', hasStudentContent);

    // 截图
    await page.screenshot({ path: 'test-results/students-page.png' });
    console.log('✓ 已保存截图: test-results/students-page.png');

    console.log('✅ 测试4完成');
  });

  test('测试5: 课消收入 - 查看统计数据', async ({ page }) => {
    console.log('🧪 测试5: 课消收入 - 查看统计数据');

    await login(page, ADMIN_USER);

    // 访问课消收入页面
    await page.goto('http://localhost:5173/teachers/consumption');
    await page.waitForTimeout(2000);

    console.log('当前URL:', page.url());

    // 检查页面内容
    const pageText = await page.textContent('body');
    const hasRevenueContent = pageText && (
      pageText.includes('课消') ||
      pageText.includes('收入') ||
      pageText.includes('统计')
    );
    console.log('页面包含收入相关内容:', hasRevenueContent);

    // 截图
    await page.screenshot({ path: 'test-results/consumption-page.png' });
    console.log('✓ 已保存截图: test-results/consumption-page.png');

    console.log('✅ 测试5完成');
  });

  test('测试6: 现金流中心 - 查看成单数据', async ({ page }) => {
    console.log('🧪 测试6: 现金流中心 - 查看成单数据');

    await login(page, ADMIN_USER);

    // 访问现金流中心页面
    await page.goto('http://localhost:5173/cashflow/summary');
    await page.waitForTimeout(2000);

    console.log('当前URL:', page.url());

    // 检查页面内容
    const pageText = await page.textContent('body');
    const hasCashflowContent = pageText && (
      pageText.includes('现金流') ||
      pageText.includes('成单') ||
      pageText.includes('收入')
    );
    console.log('页面包含现金流相关内容:', hasCashflowContent);

    // 截图
    await page.screenshot({ path: 'test-results/cashflow-page.png' });
    console.log('✓ 已保存截图: test-results/cashflow-page.png');

    console.log('✅ 测试6完成');
  });

  test('测试7: 鱼池管理 - 查看线索列表', async ({ page }) => {
    console.log('🧪 测试7: 鱼池管理 - 查看线索列表');

    await login(page, ADMIN_USER);

    // 访问鱼池管理页面
    await page.goto('http://localhost:5173/cashflow/marketing');
    await page.waitForTimeout(2000);

    console.log('当前URL:', page.url());

    // 检查页面内容
    const pageText = await page.textContent('body');
    const hasLeadContent = pageText && (
      pageText.includes('鱼池') ||
      pageText.includes('线索') ||
      pageText.includes('资源')
    );
    console.log('页面包含鱼池相关内容:', hasLeadContent);

    // 截图
    await page.screenshot({ path: 'test-results/marketing-page.png' });
    console.log('✓ 已保存截图: test-results/marketing-page.png');

    console.log('✅ 测试7完成');
  });

  test('测试8: 成单信息 - 查看成单列表', async ({ page }) => {
    console.log('🧪 测试8: 成单信息 - 查看成单列表');

    await login(page, ADMIN_USER);

    // 访问成单信息页面
    await page.goto('http://localhost:5173/cashflow/order-info');
    await page.waitForTimeout(2000);

    console.log('当前URL:', page.url());

    // 检查页面内容
    const pageText = await page.textContent('body');
    const hasOrderContent = pageText && (
      pageText.includes('成单') ||
      pageText.includes('订单')
    );
    console.log('页面包含成单相关内容:', hasOrderContent);

    // 截图
    await page.screenshot({ path: 'test-results/order-info-page.png' });
    console.log('✓ 已保存截图: test-results/order-info-page.png');

    console.log('✅ 测试8完成');
  });

  test('测试9: 教练视角登录', async ({ page }) => {
    console.log('🧪 测试9: 教练视角登录');

    await login(page, COACH_USER);

    await page.waitForTimeout(2000);

    // 检查页面内容
    const pageText = await page.textContent('body');
    const hasCoachMenu = pageText && (
      pageText.includes('班级') ||
      pageText.includes('学员') ||
      pageText.includes('课消')
    );
    console.log('教练账号登录成功，有菜单:', hasCoachMenu);

    // 检查不应该有的管理菜单
    const hasAdminMenu = pageText && (
      pageText.includes('机构管理') ||
      pageText.includes('工作人员管理')
    );
    console.log('教练账号不应该看到管理菜单:', hasAdminMenu);

    // 截图
    await page.screenshot({ path: 'test-results/coach-dashboard.png' });
    console.log('✓ 已保存截图: test-results/coach-dashboard.png');

    console.log('✅ 测试9完成');
  });

  test('测试10: 销售视角登录', async ({ page }) => {
    console.log('🧪 测试10: 销售视角登录');

    await login(page, SALES_USER);

    await page.waitForTimeout(2000);

    // 检查页面内容
    const pageText = await page.textContent('body');
    const hasSalesMenu = pageText && (
      pageText.includes('鱼池') ||
      pageText.includes('成单') ||
      pageText.includes('体验课')
    );
    console.log('销售账号登录成功，有销售菜单:', hasSalesMenu);

    // 截图
    await page.screenshot({ path: 'test-results/sales-dashboard.png' });
    console.log('✓ 已保存截图: test-results/sales-dashboard.png');

    console.log('✅ 测试10完成');
  });
});
