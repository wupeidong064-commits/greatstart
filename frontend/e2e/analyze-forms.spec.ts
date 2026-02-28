import { test, expect } from '@playwright/test';

/**
 * 页面结构分析测试
 * 用于了解表单的实际DOM结构
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

test.describe('页面结构分析', () => {
  test('分析成单表单结构', async ({ page }) => {
    console.log('🔍 分析成单表单结构');

    await login(page, ADMIN_USER);

    // 访问成单信息页面
    await page.goto('http://localhost:5173/cashflow/order-info');
    await page.waitForTimeout(3000);

    // 点击新增按钮
    const createButton = page.locator('button:has-text("新增"), button:has-text("创建"), .ant-btn-primary').first();

    if (await createButton.count() > 0) {
      await createButton.click();
      await page.waitForTimeout(2000);

      // 截图
      await page.screenshot({ path: 'test-results/order-form-analysis.png' });

      // 分析表单结构
      const formStructure = await page.evaluate(() => {
        const result: any = {
          title: '',
          selects: [],
          inputs: [],
          buttons: [],
          tabs: [],
          steps: [],
          hiddenElements: []
        };

        // 获取标题
        const titleEl = document.querySelector('.ant-modal-title, .ant-drawer-title, h1, h2, h3');
        if (titleEl) {
          result.title = titleEl.textContent?.trim() || '';
        }

        // 获取所有选择器
        const allSelects = document.querySelectorAll('.ant-select');
        allSelects.forEach((sel, index) => {
          const rect = sel.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(sel);
          const isVisible = rect.width > 0 && rect.height > 0 && computedStyle.display !== 'none';

          const label = sel.closest('.ant-form-item')?.querySelector('.ant-form-item-label')?.textContent?.trim() || '';

          result.selects.push({
            index,
            label,
            visible: isVisible,
            className: sel.className,
            hasValue: sel.classList.contains('ant-select-has-value')
          });
        });

        // 获取所有输入框
        const allInputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
        allInputs.forEach((input) => {
          const rect = input.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;

          if (isVisible) {
            const label = input.closest('.ant-form-item')?.querySelector('.ant-form-item-label')?.textContent?.trim() || '';
            result.inputs.push({
              label,
              type: input.type,
              placeholder: input.placeholder || '',
              id: input.id || '',
              name: input.name || ''
            });
          }
        });

        // 获取所有按钮
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach((btn) => {
          const text = btn.textContent?.trim() || '';
          const rect = btn.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;

          if (isVisible && text) {
            result.buttons.push({
              text,
              type: btn.getAttribute('type') || '',
              className: btn.className
            });
          }
        });

        // 检查标签页
        const tabs = document.querySelectorAll('.ant-tabs-tab');
        tabs.forEach((tab) => {
          result.tabs.push({
            text: tab.textContent?.trim() || '',
            active: tab.classList.contains('ant-tabs-tab-active')
          });
        });

        // 检查步骤条
        const steps = document.querySelectorAll('.ant-steps-item');
        steps.forEach((step) => {
          result.steps.push({
            text: step.textContent?.trim() || '',
            active: step.classList.contains('ant-steps-item-active')
          });
        });

        return result;
      });

      console.log('=== 表单结构分析 ===');
      console.log('标题:', formStructure.title);
      console.log('');
      console.log('选择器:');
      formStructure.selects.forEach((s: any) => {
        console.log(`  [${s.index}] ${s.label || '未命名'} - 可见: ${s.visible}, 有值: ${s.hasValue}`);
      });
      console.log('');
      console.log('输入框:');
      formStructure.inputs.forEach((i: any) => {
        console.log(`  ${i.label || '未命名'} (${i.type}) - ${i.placeholder || i.id}`);
      });
      console.log('');
      console.log('按钮:');
      formStructure.buttons.forEach((b: any) => {
        console.log(`  ${b.text}`);
      });
      console.log('');
      console.log('标签页:');
      if (formStructure.tabs.length > 0) {
        formStructure.tabs.forEach((t: any) => {
          console.log(`  ${t.text} ${t.active ? '[当前]' : ''}`);
        });
      } else {
        console.log('  无标签页');
      }
      console.log('');
      console.log('步骤:');
      if (formStructure.steps.length > 0) {
        formStructure.steps.forEach((s: any) => {
          console.log(`  ${s.text} ${s.active ? '[当前]' : ''}`);
        });
      } else {
        console.log('  无步骤条');
      }

      // 保存分析结果
      await page.evaluate((data) => {
        console.log(JSON.stringify(data, null, 2));
      }, formStructure);
    }

    console.log('✅ 表单结构分析完成');
  });

  test('分析班级管理页面结构', async ({ page }) => {
    console.log('🔍 分析班级管理页面结构');

    await login(page, ADMIN_USER);

    await page.goto('http://localhost:5173/operation/classes');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/classes-page-analysis.png' });

    // 分析页面结构
    const pageStructure = await page.evaluate(() => {
      const result: any = {
        title: document.title,
        buttons: [],
        tables: [],
        forms: []
      };

      // 获取所有可见按钮
      const allButtons = document.querySelectorAll('button, .ant-btn');
      allButtons.forEach((btn) => {
        const text = btn.textContent?.trim() || '';
        const rect = btn.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;

        if (isVisible && text) {
          result.buttons.push({
            text,
            className: btn.className
          });
        }
      });

      // 检查表格
      const tables = document.querySelectorAll('.ant-table, table');
      result.tables.push({ count: tables.length });

      return result;
    });

    console.log('=== 班级管理页面 ===');
    console.log('按钮数量:', pageStructure.buttons.length);
    console.log('前10个按钮:');
    pageStructure.buttons.slice(0, 10).forEach((b: any) => {
      console.log(`  - ${b.text}`);
    });

    console.log('✅ 页面分析完成');
  });
});
