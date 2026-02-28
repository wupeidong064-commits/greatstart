import { test, expect } from '@playwright/test';

/**
 * 测试班级管理页面的筛选功能
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

test.describe('班级筛选功能测试', () => {
  test('测试低出勤班级筛选', async ({ page }) => {
    console.log('🧪 测试低出勤班级筛选');

    await login(page, ADMIN_USER);

    // 访问班级管理页面
    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(3000);

    console.log('当前URL:', page.url());

    // 获取页面初始状态
    const initialState = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const tables = document.querySelectorAll('.ant-table, table');

      let classCount = 0;
      let displayText = '';

      // 查找班级相关文本
      const classMatch = bodyText.match(/(\d+)\s*个.*班级/);
      if (classMatch) {
        classCount = parseInt(classMatch[1]);
      }

      // 获取页面显示的主要文本
      const lines = bodyText.split('\n').filter(line => line.trim());
      displayText = lines.slice(5, 15).join(' | ');

      return {
        classCount,
        displayText,
        hasEmptyState: bodyText.includes('暂无') || bodyText.includes('没有'),
        bodyPreview: bodyText.substring(0, 500)
      };
    });

    console.log('=== 初始状态 ===');
    console.log('班级数量:', initialState.classCount);
    console.log('页面内容:', initialState.displayText);
    console.log('空状态:', initialState.hasEmptyState);
    console.log('');
    console.log('页面预览:');
    console.log(initialState.bodyPreview);

    // 截图初始状态
    await page.screenshot({ path: 'test-results/classes-before-filter.png' });

    // 查找并点击"低出勤班级筛选"按钮
    console.log('');
    console.log('查找低出勤班级筛选按钮...');

    const filterButton = page.locator('button:has-text("低出勤班级筛选")');

    if (await filterButton.count() > 0) {
      console.log('✓ 找到按钮');

      await filterButton.click();
      await page.waitForTimeout(2000);

      console.log('✓ 点击了筛选按钮');

      // 获取筛选后的状态
      const afterFilterState = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const tables = document.querySelectorAll('.ant-table, table');

        let classCount = 0;
        let displayText = '';

        const classMatch = bodyText.match(/(\d+)\s*个.*班级/);
        if (classMatch) {
          classCount = parseInt(classMatch[1]);
        }

        const lines = bodyText.split('\n').filter(line => line.trim());
        displayText = lines.slice(5, 15).join(' | ');

        return {
          classCount,
          displayText,
          hasChanged: bodyText.includes('低出勤'),
          bodyPreview: bodyText.substring(0, 500)
        };
      });

      console.log('');
      console.log('=== 筛选后状态 ===');
      console.log('班级数量:', afterFilterState.classCount);
      console.log('页面内容:', afterFilterState.displayText);
      console.log('内容变化:', afterFilterState.hasChanged ? '✅ 有变化' : '❌ 无变化');
      console.log('');
      console.log('页面预览:');
      console.log(afterFilterState.bodyPreview);

      // 截图筛选后状态
      await page.screenshot({ path: 'test-results/classes-after-filter.png' });

      // 分析结果
      console.log('');
      console.log('=== 分析结果 ===');

      if (initialState.classCount === afterFilterState.classCount) {
        console.log('⚠️  筛选前后班级数量相同');
        console.log('   可能原因：');
        console.log('   1. 所有班级都是低出勤（出勤率<60%）');
        console.log('   2. 筛选功能未生效');
        console.log('   3. 需要先有出勤数据才能筛选');
      } else {
        console.log('✅ 筛选功能正常');
        console.log(`   筛选前: ${initialState.classCount}个班级`);
        console.log(`   筛选后: ${afterFilterState.classCount}个班级`);
      }

    } else {
      console.log('❌ 未找到低出勤班级筛选按钮');
    }

    console.log('✅ 测试完成');
  });

  test('测试优先安排体验课班级筛选', async ({ page }) => {
    console.log('🧪 测试优先安排体验课班级筛选');

    await login(page, ADMIN_USER);

    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(3000);

    console.log('当前URL:', page.url());

    // 获取初始状态
    const initialState = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const classMatch = bodyText.match(/(\d+)\s*个.*班级/);
      const classCount = classMatch ? parseInt(classMatch[1]) : 0;

      const lines = bodyText.split('\n').filter(line => line.trim());
      const displayText = lines.slice(5, 15).join(' | ');

      return {
        classCount,
        displayText,
        bodyPreview: bodyText.substring(0, 500)
      };
    });

    console.log('=== 初始状态 ===');
    console.log('班级数量:', initialState.classCount);
    console.log('页面内容:', initialState.displayText);
    console.log('');
    console.log('页面预览:');
    console.log(initialState.bodyPreview);

    await page.screenshot({ path: 'test-results/classes-before-experience-filter.png' });

    // 查找并点击"优先安排体验课班级"按钮
    console.log('');
    console.log('查找优先安排体验课班级按钮...');

    const filterButton = page.locator('button:has-text("优先安排体验课班级")');

    if (await filterButton.count() > 0) {
      console.log('✓ 找到按钮');

      await filterButton.click();
      await page.waitForTimeout(2000);

      console.log('✓ 点击了筛选按钮');

      // 获取筛选后的状态
      const afterFilterState = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const classMatch = bodyText.match(/(\d+)\s*个.*班级/);
        const classCount = classMatch ? parseInt(classMatch[1]) : 0;

        const lines = bodyText.split('\n').filter(line => line.trim());
        const displayText = lines.slice(5, 15).join(' | ');

        return {
          classCount,
          displayText,
          hasExperienceClass: bodyText.includes('体验课') || bodyText.includes('体验'),
          bodyPreview: bodyText.substring(0, 500)
        };
      });

      console.log('');
      console.log('=== 筛选后状态 ===');
      console.log('班级数量:', afterFilterState.classCount);
      console.log('页面内容:', afterFilterState.displayText);
      console.log('体验课相关:', afterFilterState.hasExperienceClass ? '✅ 有体验课内容' : '❌ 无体验课内容');
      console.log('');
      console.log('页面预览:');
      console.log(afterFilterState.bodyPreview);

      await page.screenshot({ path: 'test-results/classes-after-experience-filter.png' });

      // 分析结果
      console.log('');
      console.log('=== 分析结果 ===');

      if (initialState.classCount === afterFilterState.classCount) {
        console.log('⚠️  筛选前后班级数量相同');
        console.log('   可能原因：');
        console.log('   1. 所有班级都可以安排体验课（容量未满）');
        console.log('   2. 筛选功能未生效');
        console.log('   3. 需要先有报名数据才能判断');
      } else {
        console.log('✅ 筛选功能正常');
        console.log(`   筛选前: ${initialState.classCount}个班级`);
        console.log(`   筛选后: ${afterFilterState.classCount}个班级`);
      }

    } else {
      console.log('❌ 未找到优先安排体验课班级按钮');
    }

    console.log('✅ 测试完成');
  });

  test('测试两个筛选按钮的实际效果', async ({ page }) => {
    console.log('🧪 对比两个筛选按钮的效果');

    await login(page, ADMIN_USER);

    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(3000);

    // 详细分析页面结构
    const pageStructure = await page.evaluate(() => {
      const result: any = {
        buttons: [],
        classList: [],
        hasScheduleClass: false,
        unscheduledClasses: []
      };

      // 获取所有按钮
      const buttons = document.querySelectorAll('button, .ant-btn');
      buttons.forEach((btn) => {
        const text = btn.textContent?.trim() || '';
        const rect = btn.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;

        if (isVisible && text) {
          result.buttons.push({ text, visible: true });
        }
      });

      // 查找班级列表
      const classElements = document.querySelectorAll('[class*="class"], .ant-card, .ant-list-item');
      classElements.forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (text && (text.includes('班') || text.includes('E2E'))) {
          result.classList.push(text.substring(0, 50));
        }
      });

      // 检查是否有排课班级和未排课班级的区分
      const bodyText = document.body.innerText;
      result.hasScheduleClass = bodyText.includes('已排课班级') || bodyText.includes('排课班级');
      result.hasUnscheduledClass = bodyText.includes('未排课班级') || bodyText.includes('暂无已排课');

      // 查找具体的未排课班级
      const unscheduledSection = Array.from(document.querySelectorAll('div, section, li')).find(el => {
        const text = el.textContent || '';
        return text.includes('未排课班级') || text.includes('点击设置时间');
      });

      if (unscheduledSection) {
        const items = unscheduledSection.querySelectorAll('li, .ant-card, [class*="item"]');
        items.forEach((item, index) => {
          if (index < 20) { // 只取前20个
            const text = item.textContent?.trim() || '';
            if (text) {
              result.unscheduledClasses.push(text);
            }
          }
        });
      }

      return result;
    });

    console.log('=== 页面结构分析 ===');
    console.log('按钮数量:', pageStructure.buttons.length);
    console.log('按钮列表:');
    pageStructure.buttons.forEach((b: any) => {
      console.log(`  - ${b.text}`);
    });
    console.log('');
    console.log('班级列表:');
    pageStructure.classList.forEach((c: string) => {
      console.log(`  - ${c}`);
    });
    console.log('');
    console.log('排课状态:');
    console.log('  有已排课班级:', pageStructure.hasScheduleClass);
    console.log('  有未排课班级:', pageStructure.hasUnscheduledClass);
    console.log('');
    console.log('未排课班级数量:', pageStructure.unscheduledClasses.length);

    await page.screenshot({ path: 'test-results/classes-structure-analysis.png' });
  });
});
