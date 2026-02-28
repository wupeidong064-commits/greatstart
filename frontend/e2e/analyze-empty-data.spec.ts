import { test, expect } from '@playwright/test';

/**
 * 分析页面数据为空的问题
 */

const ADMIN_USER = {
  email: 'e2e-admin@test.com',
  password: 'test123',
};

async function login(page, user: { email: string; password: string }) {
  await page.goto('http://localhost:5173');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.reload();
  await page.waitForTimeout(3000);

  const emailSelector = '#login_email';
  const passwordSelector = '#login_password';

  try {
    await page.waitForSelector(emailSelector, { timeout: 10000 });

    const emailInput = page.locator(emailSelector);
    await emailInput.click();
    await emailInput.fill(user.email);

    const passwordInput = page.locator(passwordSelector);
    await passwordInput.click();
    await passwordInput.fill(user.password);

    const loginButton = page.locator('button[type="submit"]').first();
    await loginButton.click();

    await page.waitForTimeout(6000);

  } catch (error) {
    console.log('登录错误:', error.message);
  }
}

test.describe('数据为空问题分析', () => {
  test('检查登录后的状态', async ({ page }) => {
    console.log('🔍 检查登录后的用户状态');

    await login(page, ADMIN_USER);

    // 检查localStorage中的用户信息
    const authInfo = await page.evaluate(() => {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        try {
          return JSON.parse(authStorage);
        } catch (e) {
          return { error: 'Parse failed' };
        }
      }
      return { error: 'No auth-storage found' };
    });

    console.log('=== Auth Storage ===');
    console.log(JSON.stringify(authInfo, null, 2));

    // 获取当前URL
    console.log('当前URL:', page.url());

    // 检查页面上的用户信息
    const userInfo = await page.evaluate(() => {
      const result: any = {};

      // 查找用户信息显示
      const userElements = document.querySelectorAll('.ant-dropdown-menu-user, .user-info, [data-user-id]');
      userElements.forEach((el) => {
        result.userInfo = el.textContent?.trim();
      });

      // 检查所有可见文本中的关键字
      const bodyText = document.body.innerText;
      result.hasOrganization = bodyText.includes('机构') || bodyText.includes('E2E');
      result.hasCampus = bodyText.includes('校区') || bodyText.includes('E2E');

      return result;
    });

    console.log('=== 页面用户信息 ===');
    console.log(JSON.stringify(userInfo, null, 2));

    await page.screenshot({ path: 'test-results/after-login-state.png' });
  });

  test('分析班级管理页面', async ({ page }) => {
    console.log('🔍 分析班级管理页面');

    await login(page, ADMIN_USER);

    await page.goto('http://localhost:5173/operation/classes');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/classes-page-empty.png' });

    // 分析页面内容
    const pageAnalysis = await page.evaluate(() => {
      const result: any = {
        url: window.location.href,
        title: document.title,
        hasTable: false,
        hasEmpty: false,
        hasNoData: false,
        tableRows: 0,
        visibleText: '',
        filters: [],
        buttons: []
      };

      // 检查表格
      const tables = document.querySelectorAll('.ant-table, table');
      result.hasTable = tables.length > 0;

      if (tables.length > 0) {
        const tbody = tables[0].querySelector('tbody');
        if (tbody) {
          result.tableRows = tbody.querySelectorAll('tr').length;
        }
      }

      // 检查空状态提示
      const bodyText = document.body.innerText;
      result.hasEmpty = bodyText.includes('暂无数据') || bodyText.includes('没有数据') || bodyText.includes('No data');
      result.hasNoData = bodyText.includes('No') && bodyText.includes('data');

      // 获取可见文本（前500字符）
      result.visibleText = bodyText.substring(0, 500);

      // 检查筛选器
      const filterInputs = document.querySelectorAll('input[placeholder], .ant-select');
      filterInputs.forEach((input, index) => {
        if (index < 10) { // 只记录前10个
          const placeholder = input.getAttribute('placeholder') || '';
          const className = input.className || '';
          result.filters.push({ placeholder, className });
        }
      });

      // 检查按钮
      const buttons = document.querySelectorAll('button');
      buttons.forEach((btn) => {
        const text = btn.textContent?.trim() || '';
        if (text && result.buttons.length < 20) {
          result.buttons.push({ text, visible: btn.offsetParent !== null });
        }
      });

      return result;
    });

    console.log('=== 班级管理页面分析 ===');
    console.log('URL:', pageAnalysis.url);
    console.log('有表格:', pageAnalysis.hasTable);
    console.log('表格行数:', pageAnalysis.tableRows);
    console.log('显示空数据:', pageAnalysis.hasEmpty || pageAnalysis.hasNoData);
    console.log('');
    console.log('页面文本（前500字符）:');
    console.log(pageAnalysis.visibleText);
    console.log('');
    console.log('筛选器:');
    pageAnalysis.filters.slice(0, 5).forEach((f: any) => {
      console.log(`  - ${f.placeholder || f.className}`);
    });
    console.log('');
    console.log('按钮:');
    pageAnalysis.buttons.forEach((b: any) => {
      if (b.visible) console.log(`  - ${b.text}`);
    });

    // 检查网络请求
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/') || url.includes('classes') || url.includes('students')) {
        apiRequests.push(`[REQUEST] ${request.method()} ${url}`);
      }
    });

    await page.waitForTimeout(2000);

    console.log('');
    console.log('API请求:', apiRequests.length > 0 ? apiRequests.join('\n') : '未捕获到API请求');
  });

  test('直接查询数据库检查数据', async ({ page }) => {
    console.log('🔍 直接检查数据库数据');

    await login(page, ADMIN_USER);

    // 在浏览器控制台中执行查询
    const dbCheck = await page.evaluate(async () => {
      const result: any = {
        memfireConfigured: false,
        supabaseClient: false,
        testData: {
          organizations: 0,
          campuses: 0,
          classes: 0,
          students: 0,
          schedules: 0,
          enrollments: 0
        }
      };

      // 检查是否有Supabase客户端
      try {
        // @ts-ignore
        if (window.supabase || window.createClient) {
          result.supabaseClient = true;
        }
      } catch (e) {
        // Ignore
      }

      // 检查localStorage中的组织信息
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        try {
          const auth = JSON.parse(authStorage);
          result.organizationId = auth?.state?.user?.organizationId;
          result.campusId = auth?.state?.user?.campusId;
          result.userId = auth?.state?.user?.id;
          result.userRole = auth?.state?.user?.role;
        } catch (e) {
          result.parseError = true;
        }
      }

      // 获取页面上的所有数据相关信息
      const bodyText = document.body.innerText;

      // 检查是否有E2E测试相关的数据
      result.hasE2EData = bodyText.includes('E2E') || bodyText.includes('测试班级');

      return result;
    });

    console.log('=== 数据库检查 ===');
    console.log(JSON.stringify(dbCheck, null, 2));

    // 访问班级管理页面并检查
    await page.goto('http://localhost:5173/operation/classes');
    await page.waitForTimeout(3000);

    // 检查是否有API错误
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    if (consoleErrors.length > 0) {
      console.log('=== 控制台错误 ===');
      consoleErrors.slice(0, 10).forEach((err) => console.log(`  ${err}`));
    }

    await page.screenshot({ path: 'test-results/classes-page-debug.png' });
  });

  test('检查测试数据创建脚本结果', async ({ page }) => {
    console.log('🔍 检查测试数据');

    await login(page, ADMIN_USER);

    // 尝试访问鱼池管理（之前显示有数据）
    await page.goto('http://localhost:5173/cashflow/marketing');
    await page.waitForTimeout(3000);

    const marketingPageAnalysis = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const tables = document.querySelectorAll('.ant-table, table');
      let rowCount = 0;

      if (tables.length > 0) {
        const tbody = tables[0].querySelector('tbody');
        if (tbody) {
          rowCount = tbody.querySelectorAll('tr').length;
        }
      }

      return {
        hasData: bodyText.includes('E2E') || bodyText.includes('测试'),
        tableRows: rowCount,
        bodyTextPreview: bodyText.substring(0, 300)
      };
    });

    console.log('=== 鱼池管理页面 ===');
    console.log('有数据:', marketingPageAnalysis.hasData);
    console.log('表格行数:', marketingPageAnalysis.tableRows);
    console.log('页面内容:', marketingPageAnalysis.bodyTextPreview);

    // 对比分析
    console.log('');
    console.log('=== 对比分析 ===');
    console.log('鱼池管理有数据:', marketingPageAnalysis.hasData);
    console.log('班级管理可能无数据: 需要验证');

    // 检查数据创建脚本
    console.log('');
    console.log('=== 需要检查 ===');
    console.log('1. 测试数据创建脚本是否成功执行');
    console.log('2. 创建的数据使用的是正确的organizationId');
    console.log('3. 页面筛选条件是否默认过滤掉了数据');
    console.log('4. API返回的数据格式是否正确');
  });
});
