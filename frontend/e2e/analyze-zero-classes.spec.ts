import { test, expect } from '@playwright/test';

/**
 * 分析班级数据为0的原因
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

test.describe('班级数据为0问题分析', () => {
  test('检查班级管理页面API请求', async ({ page }) => {
    console.log('🔍 检查班级管理页面API请求');

    await login(page, ADMIN_USER);

    // 监听所有API请求和响应
    const apiCalls: any[] = [];

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/') || url.includes('classes') || url.includes('memfire')) {
        apiCalls.push({
          type: 'request',
          method: request.method(),
          url: url,
          headers: request.headers()
        });
      }
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/') || url.includes('classes') || url.includes('memfire')) {
        try {
          const contentType = response.headers()['content-type'];
          let body = '';

          if (contentType && contentType.includes('application/json')) {
            body = await response.text();
            // 截断过长的响应
            if (body.length > 1000) {
              body = body.substring(0, 1000) + '... (truncated)';
            }
          }

          apiCalls.push({
            type: 'response',
            method: response.request().method(),
            url: url,
            status: response.status(),
            body: body
          });
        } catch (e) {
          apiCalls.push({
            type: 'response',
            url: url,
            status: response.status(),
            error: 'Failed to read body'
          });
        }
      }
    });

    // 访问班级管理页面
    console.log('访问班级管理页面: /classes');
    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(5000);

    console.log('当前URL:', page.url());

    // 获取页面内容
    const pageInfo = await page.evaluate(() => {
      const result: any = {
        bodyText: '',
        hasTable: false,
        tableRows: 0,
        hasEmptyState: false,
        visibleElements: []
      };

      result.bodyText = document.body.innerText;

      const tables = document.querySelectorAll('.ant-table, table');
      result.hasTable = tables.length > 0;

      if (tables.length > 0) {
        const tbody = tables[0].querySelector('tbody');
        if (tbody) {
          const rows = tbody.querySelectorAll('tr');
          result.tableRows = rows.length;

          // 获取前3行的内容
          rows.forEach((row, index) => {
            if (index < 3) {
              result.visibleElements.push(row.innerText);
            }
          });
        }
      }

      result.hasEmptyState = result.bodyText.includes('暂无数据') ||
                              result.bodyText.includes('没有数据');

      return result;
    });

    console.log('=== 页面信息 ===');
    console.log('有表格:', pageInfo.hasTable);
    console.log('表格行数:', pageInfo.tableRows);
    console.log('有空状态提示:', pageInfo.hasEmptyState);
    console.log('表格内容:');
    pageInfo.visibleElements.forEach((content: string, index: number) => {
      if (content) {
        console.log(`  行${index + 1}: ${content.substring(0, 100)}`);
      }
    });

    // 检查是否有筛选条件
    const filterInfo = await page.evaluate(() => {
      const result: any = {
        activeFilters: [],
        searchValue: ''
      };

      // 检查搜索框
      const searchInputs = document.querySelectorAll('input[placeholder*="搜索"], input[placeholder*="搜索"]');
      searchInputs.forEach((input) => {
        result.searchValue = (input as HTMLInputElement).value;
      });

      // 检查筛选下拉框
      const selects = document.querySelectorAll('.ant-select');
      selects.forEach((select, index) => {
        const label = select.closest('.ant-form-item, .ant-space-item')?.querySelector('.ant-form-item-label, label')?.textContent?.trim();
        const hasValue = select.classList.contains('ant-select-has-value');
        if (hasValue) {
          result.activeFilters.push({ index, label, hasValue: true });
        }
      });

      return result;
    });

    console.log('');
    console.log('=== 筛选条件 ===');
    console.log('搜索值:', filterInfo.searchValue);
    console.log('激活的筛选器:', filterInfo.activeFilters.length);
    filterInfo.activeFilters.forEach((f: any) => {
      console.log(`  - ${f.label || f.index}`);
    });

    // 分析API调用
    console.log('');
    console.log('=== API调用分析 ===');
    console.log(`总API调用数: ${apiCalls.length}`);

    const classApiCalls = apiCalls.filter(call => call.url.includes('class'));
    console.log(`班级相关API调用数: ${classApiCalls.length}`);

    classApiCalls.forEach((call) => {
      if (call.type === 'request') {
        console.log(`[REQUEST] ${call.method} ${call.url}`);
      } else if (call.type === 'response') {
        console.log(`[RESPONSE] ${call.status} ${call.url}`);
        if (call.body) {
          try {
            const jsonData = JSON.parse(call.body);
            console.log(`  数据预览:`, JSON.stringify(jsonData).substring(0, 200));
          } catch {
            console.log(`  数据预览: ${call.body.substring(0, 200)}`);
          }
        }
      }
    });

    // 检查错误响应
    const errorCalls = apiCalls.filter(call => call.status >= 400);
    if (errorCalls.length > 0) {
      console.log('');
      console.log('=== 错误响应 ===');
      errorCalls.forEach((call) => {
        console.log(`${call.status} ${call.method} ${call.url}`);
      });
    }

    // 截图
    await page.screenshot({ path: 'test-results/classes-data-analysis.png' });
  });

  test('检查用户权限和组织信息', async ({ page }) => {
    console.log('🔍 检查用户权限和组织信息');

    await login(page, ADMIN_USER);

    // 获取用户认证信息
    const authInfo = await page.evaluate(() => {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        try {
          const auth = JSON.parse(authStorage);
          return {
            userId: auth.state?.user?.id,
            organizationId: auth.state?.user?.organizationId,
            campusId: auth.state?.user?.campusId,
            role: auth.state?.user?.role,
            email: auth.state?.user?.email,
            isAuthenticated: auth.state?.isAuthenticated
          };
        } catch (e) {
          return { error: 'Parse failed' };
        }
      }
      return {};
    });

    console.log('=== 用户认证信息 ===');
    console.log(JSON.stringify(authInfo, null, 2));

    // 检查是否是正确的E2E测试组织
    const expectedOrgId = 'c1bebf13-1598-4921-b6fa-9d3a831af1b3';
    const expectedCampusId = '504a4244-7f52-4739-9336-2ceb4972b631';

    console.log('');
    console.log('=== 验证组织ID ===');
    console.log(`期望的 organizationId: ${expectedOrgId}`);
    console.log(`实际的 organizationId: ${authInfo.organizationId}`);
    console.log(`组织ID匹配: ${authInfo.organizationId === expectedOrgId ? '✅' : '❌'}`);
    console.log('');
    console.log(`期望的 campusId: ${expectedCampusId}`);
    console.log(`实际的 campusId: ${authInfo.campusId}`);
    console.log(`校区ID匹配: ${authInfo.campusId === expectedCampusId ? '✅' : '❌'}`);

    // 访问班级页面并检查
    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(3000);

    // 尝试在浏览器控制台中执行API查询
    const apiCheck = await page.evaluate(async (orgId, campusId) => {
      const result: any = {
        hasSupabase: false,
        apiAttempt: false,
        apiError: null,
        apiData: null
      };

      // 检查页面是否有任何API调用迹象
      const bodyText = document.body.innerText;
      result.hasDataDisplay = bodyText.includes('班级') || bodyText.includes('数据');

      return result;
    }, authInfo.organizationId, authInfo.campusId);

    console.log('');
    console.log('=== API检查 ===');
    console.log(JSON.stringify(apiCheck, null, 2));
  });

  test('对比有数据的页面', async ({ page }) => {
    console.log('🔍 对比分析：班级 vs 鱼池');

    await login(page, ADMIN_USER);

    const pages = [
      { name: '班级管理', url: '/classes' },
      { name: '鱼池管理', url: '/cashflow/marketing' },
      { name: '成单信息', url: '/cashflow/order-info' }
    ];

    for (const pageInfo of pages) {
      console.log(`\n分析: ${pageInfo.name}`);

      await page.goto(`http://localhost:5173${pageInfo.url}`);
      await page.waitForTimeout(3000);

      const analysis = await page.evaluate(() => {
        const tables = document.querySelectorAll('.ant-table, table');
        let rowCount = 0;
        let hasData = false;

        if (tables.length > 0) {
          const tbody = tables[0].querySelector('tbody');
          if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rowCount = rows.length;
            hasData = rows.length > 0;
          }
        }

        const bodyText = document.body.innerText;
        const hasEmpty = bodyText.includes('暂无数据') || bodyText.includes('没有数据');

        return {
          hasTable: tables.length > 0,
          tableCount: tables.length,
          rowCount,
          hasData,
          hasEmptyState: hasEmpty,
          bodyTextPreview: bodyText.substring(0, 200)
        };
      });

      console.log(`  有表格: ${analysis.hasTable}`);
      console.log(`  表格数量: ${analysis.tableCount}`);
      console.log(`  数据行数: ${analysis.rowCount}`);
      console.log(`  有数据: ${analysis.hasData}`);
      console.log(`  空状态: ${analysis.hasEmptyState}`);
      console.log(`  预览: ${analysis.bodyTextPreview}`);
    }
  });

  test('检查测试数据创建情况', async ({ page }) => {
    console.log('🔍 检查测试数据创建情况');

    await login(page, ADMIN_USER);

    // 获取用户信息
    const authInfo = await page.evaluate(() => {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        try {
          const auth = JSON.parse(authStorage);
          return {
            organizationId: auth.state?.user?.organizationId,
            campusId: auth.state?.user?.campusId
          };
        } catch (e) {
          return {};
        }
      }
      return {};
    });

    console.log('当前用户组织ID:', authInfo.organizationId);
    console.log('当前用户校区ID:', authInfo.campusId);

    console.log('');
    console.log('=== 测试数据创建脚本检查 ===');
    console.log('需要验证以下脚本是否成功执行：');
    console.log('1. /backend/scripts/create-e2e-users.ts');
    console.log('   - 创建测试用户');
    console.log('   - 创建测试组织和校区');
    console.log('');
    console.log('2. /backend/scripts/create-revenue-e2e-data.ts');
    console.log('   - 创建42个班级');
    console.log('   - 创建120个学员');
    console.log('   - 创建50个线索');
    console.log('   - 创建25个体验课');
    console.log('   - 创建排课和出勤数据');
    console.log('');
    console.log('请验证：');
    console.log('a) 脚本是否成功执行（没有错误）');
    console.log('b) 创建的数据使用了正确的 organizationId');
    console.log('c) 用户是否被分配到了正确的 campusId');

    // 在浏览器中执行简单的查询检查
    const dataCheck = await page.evaluate(async () => {
      // 尝试访问 localStorage 中的任何配置信息
      const result: any = {
        localStorageKeys: []
      };

      for (let i = 0; i < localStorage.length; i++) {
        result.localStorageKeys.push(localStorage.key(i));
      }

      return result;
    });

    console.log('');
    console.log('=== LocalStorage 键 ===');
    console.log(dataCheck.localStorageKeys.join(', '));
  });
});
