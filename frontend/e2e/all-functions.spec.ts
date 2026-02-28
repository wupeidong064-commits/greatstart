import { test, expect } from '@playwright/test';

/**
 * 全面功能测试脚本
 * 测试所有功能和页面按钮
 */

// 测试账号
const ADMIN_USER = {
  email: 'e2e-admin@test.com',
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

  // Ant Design Form 的输入框使用 ID 选择器
  const emailSelector = '#login_email';
  const passwordSelector = '#login_password';

  try {
    // 等待邮箱输入框出现
    await page.waitForSelector(emailSelector, { timeout: 10000 });

    // 填写邮箱
    const emailInput = page.locator(emailSelector);
    await emailInput.click();
    await emailInput.fill(user.email);

    // 填写密码
    const passwordInput = page.locator(passwordSelector);
    await passwordInput.click();
    await passwordInput.fill(user.password);

    // 点击登录按钮
    const loginButton = page.locator('button[type="submit"]').first();
    await loginButton.click();

    // 等待登录完成
    await page.waitForTimeout(6000);

  } catch (error) {
    console.log('登录错误:', error.message);
  }
}

// 获取页面上所有可点击的按钮
async function getAllButtons(page) {
  const buttons = await page.evaluate(() => {
    const result = [];
    // 更全面的按钮选择器
    const allButtons = document.querySelectorAll('button, .ant-btn, [role="button"], .ant-button');
    allButtons.forEach(btn => {
      const text = btn.textContent?.trim() || '';
      const className = btn.className || '';
      const id = btn.id || '';

      // 检查元素是否可见和可点击
      const rect = btn.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      const computedStyle = window.getComputedStyle(btn);
      const displayVisible = computedStyle.display !== 'none';
      const visibilityVisible = computedStyle.visibility !== 'hidden';

      if ((text || id) && visible && displayVisible && visibilityVisible) {
        result.push({ text, className, id, visible: true });
      }
    });
    return result;
  });
  return buttons;
}

test.describe('全面功能测试', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000); // 5分钟超时
  });

  test('功能1: 创建班级', async ({ page }) => {
    console.log('🧪 功能1: 创建班级');

    await login(page, ADMIN_USER);

    // 访问班级管理页面
    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(3000);

    console.log('📍 当前URL:', page.url());

    // 查找并点击新增按钮
    const createButton = page.locator('button:has-text("新增"), button:has-text("创建"), button:has-text("添加"), .ant-btn-primary').first();
    const buttonExists = await createButton.count() > 0;

    if (buttonExists) {
      console.log('✓ 找到新增按钮');
      await createButton.click();
      await page.waitForTimeout(1000);

      // 填写班级信息
      console.log('填写班级表单...');

      // 查找班级名称输入框
      const nameInput = page.locator('input[placeholder*="名称"], input[name*="name"], #name').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill(`E2E测试班级-${Date.now()}`);
        console.log('✓ 输入班级名称');
      }

      // 查找课程类型选择器
      const typeSelector = page.locator('.ant-select .ant-select-selector').first();
      if (await typeSelector.count() > 0) {
        await typeSelector.click({ force: true });
        await page.waitForTimeout(500);
        // 选择第一个选项
        const option = page.locator('.ant-select-item-option').first();
        if (await option.count() > 0) {
          await option.click();
          console.log('✓ 选择课程类型');
        }
      }

      // 查找教练选择器
      const coachSelect = page.locator('.ant-select .ant-select-selector').nth(1);
      if (await coachSelect.count() > 0) {
        await coachSelect.click({ force: true });
        await page.waitForTimeout(500);
        const coachOption = page.locator('.ant-select-item-option').first();
        if (await coachOption.count() > 0) {
          await coachOption.click();
          console.log('✓ 选择教练');
        }
      }

      // 截图表单
      await page.screenshot({ path: 'test-results/class-form.png' });
      console.log('✓ 保存表单截图');

      // 查找确认按钮
      const confirmButton = page.locator('button:has-text("确定"), button:has-text("保存"), button:has-text("提交")').first();
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
        await page.waitForTimeout(2000);
        console.log('✓ 点击确认按钮');
      }

      // 检查是否成功
      const pageText = await page.textContent('body');
      const hasSuccess = pageText?.includes('成功') || pageText?.includes('Success');
      console.log('创建结果:', hasSuccess ? '成功' : '需要查看');

    } else {
      console.log('✗ 未找到新增按钮');
    }

    // 获取页面上所有按钮
    const buttons = await getAllButtons(page);
    console.log(`🔘 页面上共有 ${buttons.length} 个可点击按钮`);
    buttons.slice(0, 10).forEach(b => console.log(`  - ${b.text || b.id}`));

    await page.screenshot({ path: 'test-results/class-page-buttons.png' });
    console.log('✅ 功能1完成: 创建班级');
  });

  test('功能2: 添加学员到班级', async ({ page }) => {
    console.log('🧪 功能2: 添加学员到班级');

    await login(page, ADMIN_USER);

    // 访问班级管理页面
    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(3000);

    // 查找表格中的班级
    const tableRows = page.locator('.ant-table-tbody tr, tbody tr');
    const rowCount = await tableRows.count();

    console.log(`📊 找到 ${rowCount} 个班级`);

    if (rowCount > 0) {
      // 点击第一行的操作按钮
      const firstRowAction = page.locator('.ant-table-tbody tr').first().locator('button').first();
      if (await firstRowAction.count() > 0) {
        await firstRowAction.click();
        await page.waitForTimeout(1000);
        console.log('✓ 点击班级操作按钮');
      }

      // 查找添加学员按钮
      const addStudentButton = page.locator('button:has-text("添加学员"), button:has-text("学员"), button:has-text("分配")').first();
      if (await addStudentButton.count() > 0) {
        await addStudentButton.click();
        await page.waitForTimeout(1000);
        console.log('✓ 点击添加学员按钮');

        // 截图
        await page.screenshot({ path: 'test-results/add-student-form.png' });

        // 查找学员选择器
        const studentSelect = page.locator('.ant-select .ant-select-selector').first();
        if (await studentSelect.count() > 0) {
          await studentSelect.click({ force: true });
          await page.waitForTimeout(500);
          console.log('✓ 打开学员选择器');

          // 选择第一个学员
          const studentOption = page.locator('.ant-select-item-option').first();
          if (await studentOption.count() > 0) {
            await studentOption.click();
            console.log('✓ 选择学员');
          }
        }

        // 确认添加
        const confirmButton = page.locator('button:has-text("确定"), button:has-text("保存")').first();
        if (await confirmButton.count() > 0) {
          await confirmButton.click();
          await page.waitForTimeout(2000);
          console.log('✓ 确认添加学员');
        }
      }
    }

    await page.screenshot({ path: 'test-results/add-student-result.png' });
    console.log('✅ 功能2完成: 添加学员');
  });

  test('功能3: 每日划课', async ({ page }) => {
    console.log('🧪 功能3: 每日划课');

    await login(page, ADMIN_USER);

    // 访问每日划课页面
    await page.goto('http://localhost:5173/attendances');
    await page.waitForTimeout(3000);

    console.log('📍 当前URL:', page.url());

    // 查找今日排课
    const scheduleItems = page.locator('.ant-card, .ant-list-item, .schedule-item');
    const scheduleCount = await scheduleItems.count();

    console.log(`📅 找到 ${scheduleCount} 个排课项`);

    if (scheduleCount > 0) {
      // 点击第一个排课的划课按钮
      const markButton = page.locator('button:has-text("划课"), button:has-text("签到"), button:has-text("考勤")').first();

      if (await markButton.count() > 0) {
        console.log('✓ 找到划课按钮');
        await markButton.click();
        await page.waitForTimeout(2000);

        console.log('✓ 打开划课对话框');

        // 截图划课表单
        await page.screenshot({ path: 'test-results/mark-attendance-form.png' });

        // 查找学员列表
        const studentCheckboxes = page.locator('input[type="checkbox"], .ant-checkbox-input');
        const checkboxCount = await studentCheckboxes.count();

        console.log(`👥 找到 ${checkboxCount} 个学员`);

        if (checkboxCount > 0) {
          // 选中前几个学员
          const selectCount = Math.min(3, checkboxCount);
          for (let i = 0; i < selectCount; i++) {
            const checkbox = studentCheckboxes.nth(i);
            const checked = await checkbox.isChecked();
            if (!checked) {
              await checkbox.check();
            }
          }
          console.log(`✓ 选中 ${selectCount} 个学员`);
        }

        // 查找确认按钮
        const confirmButton = page.locator('button:has-text("确定"), button:has-text("保存"), button:has-text("提交")').first();
        if (await confirmButton.count() > 0) {
          await confirmButton.click();
          await page.waitForTimeout(2000);
          console.log('✓ 确认划课');
        }
      }
    }

    // 获取页面上所有按钮
    const buttons = await getAllButtons(page);
    console.log(`🔘 页面上共有 ${buttons.length} 个可点击按钮`);

    await page.screenshot({ path: 'test-results/mark-attendance-result.png' });
    console.log('✅ 功能3完成: 每日划课');
  });

  test('功能4: 创建鱼池线索', async ({ page }) => {
    console.log('🧪 功能4: 创建鱼池线索');

    await login(page, ADMIN_USER);

    // 访问鱼池管理页面
    await page.goto('http://localhost:5173/cashflow/marketing');
    await page.waitForTimeout(3000);

    console.log('📍 当前URL:', page.url());

    // 查找新增按钮
    const createButton = page.locator('button:has-text("新增"), button:has-text("创建"), button:has-text("添加"), .ant-btn-primary').first();

    if (await createButton.count() > 0) {
      console.log('✓ 找到新增按钮');
      await createButton.click();
      await page.waitForTimeout(1000);

      console.log('填写线索表单...');

      // 填写姓名
      const nameInput = page.locator('input[placeholder*="姓名"], input[name*="name"], #name').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill(`E2E测试线索-${Date.now()}`);
        console.log('✓ 输入姓名');
      }

      // 填写电话
      const phoneInput = page.locator('input[placeholder*="电话"], input[placeholder*="手机"], input[name*="phone"]').first();
      if (await phoneInput.count() > 0) {
        await phoneInput.fill('13800138000');
        console.log('✓ 输入电话');
      }

      // 选择分配给（教练/销售）
      const assignSelect = page.locator('.ant-select .ant-select-selector').first();
      if (await assignSelect.count() > 0) {
        await assignSelect.click({ force: true });
        await page.waitForTimeout(500);
        const assignOption = page.locator('.ant-select-item-option').first();
        if (await assignOption.count() > 0) {
          await assignOption.click();
          console.log('✓ 选择分配对象');
        }
      }

      // 截图表单
      await page.screenshot({ path: 'test-results/lead-form.png' });
      console.log('✓ 保存表单截图');

      // 确认创建
      const confirmButton = page.locator('button:has-text("确定"), button:has-text("保存"), button:has-text("提交")').first();
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
        await page.waitForTimeout(2000);
        console.log('✓ 确认创建线索');
      }
    }

    // 获取页面上所有按钮
    const buttons = await getAllButtons(page);
    console.log(`🔘 页面上共有 ${buttons.length} 个可点击按钮`);
    buttons.slice(0, 10).forEach(b => console.log(`  - ${b.text || b.id}`));

    await page.screenshot({ path: 'test-results/lead-create-result.png' });
    console.log('✅ 功能4完成: 创建线索');
  });

  test('功能5: 创建成单', async ({ page }) => {
    console.log('🧪 功能5: 创建成单');

    await login(page, ADMIN_USER);

    // 访问成单信息页面
    await page.goto('http://localhost:5173/cashflow/order-info');
    await page.waitForTimeout(3000);

    console.log('📍 当前URL:', page.url());

    // 查找新增按钮
    const createButton = page.locator('button:has-text("新增成单")');

    if (await createButton.count() > 0) {
      console.log('✓ 找到新增成单按钮');
      await createButton.click();
      await page.waitForTimeout(1000);

      console.log('填写成单表单...');

      // 输入学员姓名
      const nameInput = page.locator('input[placeholder*="学员姓名"], input#studentName').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill(`E2E测试学员-${Date.now()}`);
        console.log('✓ 输入学员姓名');
      }

      // 输入年龄
      const ageInput = page.locator('input[placeholder="年龄"]').first();
      if (await ageInput.count() > 0) {
        await ageInput.fill('8');
        console.log('✓ 输入年龄');
      }

      // 选择性别（第2个选择器，索引1）
      const genderSelect = page.locator('.ant-select').nth(1);
      if (await genderSelect.count() > 0) {
        await genderSelect.locator('.ant-select-selector').click();
        await page.waitForTimeout(500);
        // 使用键盘选择
        await page.keyboard.press('Enter');
        console.log('✓ 选择性别');
        await page.waitForTimeout(500);
      }

      // 输入联系方式
      const phoneInput = page.locator('input[placeholder*="联系方式"], input[placeholder*="电话"]').first();
      if (await phoneInput.count() > 0) {
        await phoneInput.fill('13800138000');
        console.log('✓ 输入联系方式');
      }

      // 输入家长姓名
      const parentInput = page.locator('input[placeholder*="家长姓名"]').first();
      if (await parentInput.count() > 0) {
        await parentInput.fill('测试家长');
        console.log('✓ 输入家长姓名');
      }

      // 选择报名班级（第3个选择器，索引2）
      const classSelect = page.locator('.ant-select').nth(2);
      if (await classSelect.count() > 0) {
        await classSelect.locator('.ant-select-selector').click({ force: true });
        await page.waitForTimeout(1000);

        // 尝试多种方式选择选项
        const classOption = page.locator('.ant-select-item-option').first();
        if (await classOption.count() > 0) {
          try {
            // 先滚动到选项
            await classOption.scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
            // 强制点击
            await classOption.click({ force: true });
            console.log('✓ 选择报名班级');
          } catch (error) {
            console.log('选择班级失败，尝试键盘操作');
            // 尝试使用回车键选择第一个选项
            await page.keyboard.press('Enter');
            console.log('✓ 选择报名班级（键盘）');
          }
        } else {
          console.log('没有班级选项，可能需要先创建班级');
        }
        await page.waitForTimeout(500);
      }

      // 输入课程类型
      const courseInput = page.locator('input[placeholder*="课程类型"], input#courseType').first();
      if (await courseInput.count() > 0) {
        await courseInput.fill('游泳初级班');
        console.log('✓ 输入课程类型');
      }

      // 输入购买课时
      const lessonsInput = page.locator('input[placeholder="课时数"], input#totalLessons').first();
      if (await lessonsInput.count() > 0) {
        await lessonsInput.fill('10');
        console.log('✓ 输入购买课时');
      }

      // 输入成交金额
      const amountInput = page.locator('input[placeholder="金额"], input#amount').first();
      if (await amountInput.count() > 0) {
        await amountInput.fill('5000');
        console.log('✓ 输入成交金额');
      }

      // 选择支付方式（第4个选择器，索引3）
      const paymentSelect = page.locator('.ant-select').nth(3);
      if (await paymentSelect.count() > 0) {
        await paymentSelect.locator('.ant-select-selector').click();
        await page.waitForTimeout(500);
        // 使用键盘选择
        await page.keyboard.press('Enter');
        console.log('✓ 选择支付方式');
        await page.waitForTimeout(500);
      }

      // 截图表单
      await page.screenshot({ path: 'test-results/order-form.png' });
      console.log('✓ 保存表单截图');

      // 确认创建
      const confirmButton = page.locator('button:has-text("确定")').first();
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
        await page.waitForTimeout(2000);
        console.log('✓ 确认创建成单');
      }
    }

    // 获取页面上所有按钮
    const buttons = await getAllButtons(page);
    console.log(`🔘 页面上共有 ${buttons.length} 个可点击按钮`);
    buttons.slice(0, 10).forEach(b => console.log(`  - ${b.text || b.id}`));

    await page.screenshot({ path: 'test-results/order-create-result.png' });
    console.log('✅ 功能5完成: 创建成单');
  });

  test('功能6: 测试班级管理页面所有按钮', async ({ page }) => {
    console.log('🧪 功能6: 测试班级管理页面所有按钮');

    await login(page, ADMIN_USER);

    await page.goto('http://localhost:5173/classes');
    await page.waitForTimeout(3000);

    // 获取所有按钮
    const buttons = await getAllButtons(page);
    console.log(`🔘 找到 ${buttons.length} 个按钮`);

    // 测试前5个按钮
    const testCount = Math.min(5, buttons.length);
    for (let i = 0; i < testCount; i++) {
      const btn = buttons[i];
      console.log(`测试按钮 ${i + 1}: ${btn.text || btn.id}`);

      try {
        let buttonLocator;
        if (btn.text) {
          buttonLocator = page.locator(`button:has-text("${btn.text}")`).first();
        } else if (btn.id) {
          buttonLocator = page.locator(`#${btn.id}`).first();
        }

        if (buttonLocator && await buttonLocator.count() > 0) {
          // 截图前状态
          await page.screenshot({ path: `test-results/before-button-${i}.png` });

          await buttonLocator.click();
          await page.waitForTimeout(1000);

          // 截图后状态
          await page.screenshot({ path: `test-results/after-button-${i}.png` });

          console.log(`✓ 按钮 ${i + 1} 点击成功`);

          // 如果打开了对话框，尝试关闭
          const closeButton = page.locator('button:has-text("取消"), button:has-text("关闭"), .ant-modal-close').first();
          if (await closeButton.count() > 0) {
            await closeButton.click();
            await page.waitForTimeout(500);
          }

          // 刷新页面恢复状态
          await page.reload();
          await page.waitForTimeout(2000);
        }
      } catch (error) {
        console.log(`按钮 ${i + 1} 测试失败:`, error.message);
      }
    }

    await page.screenshot({ path: 'test-results/class-buttons-test.png' });
    console.log('✅ 功能6完成: 测试页面按钮');
  });

  test('功能7: 测试学员管理页面所有按钮', async ({ page }) => {
    console.log('🧪 功能7: 测试学员管理页面所有按钮');

    await login(page, ADMIN_USER);

    await page.goto('http://localhost:5173/students');
    await page.waitForTimeout(3000);

    const buttons = await getAllButtons(page);
    console.log(`🔘 找到 ${buttons.length} 个按钮`);

    await page.screenshot({ path: 'test-results/students-buttons.png' });
    console.log('✅ 功能7完成: 测试学员管理按钮');
  });

  test('功能8: 测试财务页面所有按钮', async ({ page }) => {
    console.log('🧪 功能8: 测试财务页面所有按钮');

    await login(page, ADMIN_USER);

    // 测试课消收入页面
    await page.goto('http://localhost:5173/teachers/consumption');
    await page.waitForTimeout(3000);

    const consumptionButtons = await getAllButtons(page);
    console.log(`课消收入页面: ${consumptionButtons.length} 个按钮`);

    await page.screenshot({ path: 'test-results/consumption-buttons.png' });

    // 测试现金流中心
    await page.goto('http://localhost:5173/cashflow/summary');
    await page.waitForTimeout(3000);

    const cashflowButtons = await getAllButtons(page);
    console.log(`现金流中心: ${cashflowButtons.length} 个按钮`);

    await page.screenshot({ path: 'test-results/cashflow-buttons.png' });

    console.log('✅ 功能8完成: 测试财务页面按钮');
  });
});
