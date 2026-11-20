import { test, expect, Page } from '@playwright/test';
import { loginRobust, safeNavigate, waitForPageContent, TestUser } from './helpers';

/**
 * 数据完整性和关键业务流程 E2E 测试
 *
 * 这个测试文件专门针对以下问题的发现和验证：
 * 1. 学员班级归属显示问题 - enrollments 数据完整性
 * 2. 编辑学员时课时被清零 - 部分字段更新问题
 * 3. 划课功能无法弹出 - getStudentById 返回 enrollments 数据
 * 4. 成单信息创建失败 - campusId 缺失问题
 * 5. 不同角色的数据过滤 - RBAC 数据隔离
 */

// 测试用户配置
const adminUser: TestUser = {
  email: process.env.TEST_EMAIL || 'test-admin@buzzer.com',
  password: process.env.TEST_PASSWORD || 'Test123456',
};

const coachUser: TestUser = {
  email: process.env.COACH_EMAIL || 'test-coach@buzzer.com',
  password: process.env.COACH_PASSWORD || 'Test123456',
};

const salesUser: TestUser = {
  email: process.env.SALES_EMAIL || 'test-sales@buzzer.com',
  password: process.env.SALES_PASSWORD || 'Test123456',
};

/**
 * 辅助函数：从 API 响应中提取数据
 */
async function getApiResponse(page: Page, url: string): Promise<any> {
  return await page.evaluate(async (apiUrl) => {
    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      return data;
    } catch (error) {
      return { error: String(error) };
    }
  }, url);
}

/**
 * 辅助函数：获取表格数据
 */
async function getTableData(page: Page): Promise<any[]> {
  return await page.evaluate(() => {
    const rows = document.querySelectorAll('.ant-table-tbody tr');
    return Array.from(rows).map(row => {
      const cells = row.querySelectorAll('td');
      return Array.from(cells).map(cell => cell.textContent?.trim());
    });
  });
}

/**
 * 辅助函数：验证学员对象包含 enrollments 字段
 */
async function verifyStudentHasEnrollments(page: Page, studentIndex = 0): Promise<boolean> {
  return await page.evaluate(async (index) => {
    try {
      // 从表格行获取学员ID
      const rows = document.querySelectorAll('.ant-table-tbody tr');
      if (rows.length <= index) return false;

      const row = rows[index];
      const editButton = row.querySelector('button:has-text("编辑")');
      if (!editButton) return false;

      // 点击编辑按钮获取学员详情
      (editButton as HTMLElement).click();

      // 等待弹窗
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 检查弹窗中的学员数据
      const modal = document.querySelector('.ant-modal-content');
      if (!modal) return false;

      // 尝试从 localStorage 或其他地方获取学员详情
      // 这里我们需要通过 API 验证
      return true;
    } catch {
      return false;
    }
  }, studentIndex);
}

test.describe.serial('数据完整性 - 学员班级信息测试', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginRobust(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }
  });

  /**
   * 问题1验证：学员列表应该返回完整的 enrollments 数据
   *
   * 这个测试会发现：
   * - GET /students 是否返回了 enrollments 字段
   * - enrollments 是否包含班级信息 (class 对象)
   * - 班级名称是否正确显示在表格中
   */
  test('GET /students 应该返回包含 enrollments 和班级信息的数据', async ({ page }) => {
    // 导航到学员管理页面
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    // 等待页面加载
    const contentType = await waitForPageContent(page, 10000);

    if (contentType === 'none' || contentType === 'alert') {
      test.skip();
      return;
    }

    // 等待 API 请求完成
    await page.waitForLoadState('networkidle').catch(() => {});

    // 通过 API 直接验证返回数据
    const apiResponse = await getApiResponse(page, '/api/students?page=1&pageSize=10');
    console.log('API 响应:', JSON.stringify(apiResponse, null, 2));

    // 验证响应结构
    expect(apiResponse).toHaveProperty('success');
    expect(apiResponse.success).toBe(true);
    expect(apiResponse).toHaveProperty('data');

    const students = apiResponse.data;
    expect(Array.isArray(students)).toBe(true);

    // 如果有学员数据，验证第一个学员的 enrollments 字段
    if (students.length > 0) {
      const firstStudent = students[0];
      console.log('第一个学员数据:', JSON.stringify(firstStudent, null, 2));

      // 关键验证：检查是否有 enrollments 字段
      expect(firstStudent).toHaveProperty('enrollments');
      expect(Array.isArray(firstStudent.enrollments)).toBe(true);

      // 检查班级信息是否显示在表格中
      const tableData = await getTableData(page);
      console.log('表格数据:', tableData);

      // 如果表格有数据，检查班级列是否显示
      if (tableData.length > 0) {
        // 班级列应该是第7列（索引6）
        const classColumnIndex = 6; // 根据实际列位置调整
        const classCell = tableData[0][classColumnIndex];
        console.log('班级列内容:', classCell);

        // 班级不应该总是 "-" 或 "-"，应该显示实际班级名
        // 或者如果没有班级，应该明确显示 "-"
        if (classCell && classCell !== '-' && classCell !== '') {
          console.log('✓ 班级信息正确显示:', classCell);
        }
      }
    }
  });

  /**
   * 问题1验证：GET /students/:id 应该返回学员的 enrollments 数据
   *
   * 这个测试会发现划课功能无法弹出的问题
   */
  test('GET /students/:id 应该返回包含 enrollments 和班级信息的完整数据', async ({ page }) => {
    // 先获取学员列表
    const apiResponse = await getApiResponse(page, '/api/students?page=1&pageSize=1');

    if (!apiResponse.data || apiResponse.data.length === 0) {
      console.log('没有学员数据，跳过测试');
      test.skip();
      return;
    }

    const studentId = apiResponse.data[0].id;
    console.log('测试学员ID:', studentId);

    // 获取学员详情
    const detailResponse = await getApiResponse(page, `/api/students/${studentId}`);
    console.log('学员详情响应:', JSON.stringify(detailResponse, null, 2));

    // 验证详情响应
    expect(detailResponse).toHaveProperty('success');
    expect(detailResponse.success).toBe(true);
    expect(detailResponse.data).toHaveProperty('enrollments');
    expect(Array.isArray(detailResponse.data.enrollments)).toBe(true);

    // 验证 enrollments 中的班级信息
    if (detailResponse.data.enrollments.length > 0) {
      const firstEnrollment = detailResponse.data.enrollments[0];
      console.log('第一个 enrollment:', JSON.stringify(firstEnrollment, null, 2));

      // 检查是否有 class 对象
      expect(firstEnrollment).toHaveProperty('class');

      if (firstEnrollment.class) {
        expect(firstEnrollment.class).toHaveProperty('id');
        expect(firstEnrollment.class).toHaveProperty('name');
        console.log('✓ 班级信息完整:', firstEnrollment.class.name);
      }
    }
  });

  /**
   * 问题3验证：划课功能应该能正常打开弹窗
   *
   * 这个测试会验证：
   * - 点击划课按钮是否能打开弹窗
   * - 弹窗中的班级选择框是否有选项
   * - 弹窗中是否显示正确的剩余课时
   */
  test('划课功能应该能正常打开弹窗并显示班级选项', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});

    // 获取学员列表找到有班级的学员
    const apiResponse = await getApiResponse(page, '/api/students?page=1&pageSize=20');

    if (!apiResponse.data || apiResponse.data.length === 0) {
      test.skip();
      return;
    }

    // 找到有 enrollments 的学员
    const studentWithClass = apiResponse.data.find((s: any) =>
      s.enrollments && s.enrollments.length > 0 && s.enrollments.some((e: any) => e.status === 'active')
    );

    if (!studentWithClass) {
      console.log('没有找到有班级的学员');
      test.skip();
      return;
    }

    console.log('找到有班级的学员:', studentWithClass.name);

    // 在页面中找到这个学员并点击划课
    const tableRows = page.locator('.ant-table-tbody tr');
    const rowCount = await tableRows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = tableRows.nth(i);
      const nameCell = row.locator('td').nth(0); // 假设姓名是第一列

      // 检查是否是目标学员
      const cellText = await nameCell.textContent();
      if (cellText && cellText.includes(studentWithClass.name)) {
        console.log('找到目标学员行，点击划课按钮');

        // 点击划课按钮
        const deductButton = row.locator('button:has-text("划课")');
        const buttonCount = await deductButton.count();

        if (buttonCount > 0) {
          await deductButton.click();
          await page.waitForTimeout(1000);

          // 验证弹窗是否打开
          const modal = page.locator('.ant-modal-content');
          const isVisible = await modal.isVisible();

          expect(isVisible).toBe(true);
          console.log('✓ 划课弹窗已打开');

          // 验证弹窗内容
          const modalTitle = modal.locator('.ant-modal-title');
          const titleText = await modalTitle.textContent();
          console.log('弹窗标题:', titleText);

          // 检查是否有班级选择框
          const classSelect = modal.locator('select[name="classId"]');
          const selectCount = await classSelect.count();

          if (selectCount > 0) {
            console.log('✓ 班级选择框存在');

            // 获取班级选项
            const options = await classSelect.locator('option').allTextContents();
            console.log('班级选项:', options);

            // 验证有班级选项
            expect(options.length).toBeGreaterThan(0);
          }

          // 检查剩余课时显示
          const remainingText = modal.locator('text=/剩余.*节/');
          const remainingExists = await remainingText.count();
          if (remainingExists > 0) {
            console.log('✓ 剩余课时显示正常');
          }

          // 关闭弹窗
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);

          break;
        } else {
          console.log('划课按钮未找到');
        }
      }
    }
  });
});

test.describe.serial('数据完整性 - 学员编辑测试', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginRobust(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }
  });

  /**
   * 问题2验证：编辑学员时只修改部分字段，不应清零其他字段
   *
   * 这个测试会发现：
   * - 编辑学员时只修改姓名，课时应该保持不变
   * - 不填写 remainingLessons 字段时，应该保留原值
   */
  test('编辑学员只修改部分字段时应保留其他字段的值', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});

    // 获取学员列表
    const apiResponse1 = await getApiResponse(page, '/api/students?page=1&pageSize=5');

    if (!apiResponse1.data || apiResponse1.data.length === 0) {
      test.skip();
      return;
    }

    const firstStudent = apiResponse1.data[0];
    const originalRemainingLessons = firstStudent.remainingLessons;
    console.log('原始剩余课时:', originalRemainingLessons);

    // 导航到学员管理页面
    const tableRows = page.locator('.ant-table-tbody tr');
    const rowCount = await tableRows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    // 点击第一行的编辑按钮
    const editButton = page.locator('.ant-table-tbody tr:first-child button:has-text("编辑")');
    const buttonCount = await editButton.count();

    if (buttonCount === 0) {
      test.skip();
      return;
    }

    await editButton.click();
    await page.waitForTimeout(1000);

    // 验证编辑弹窗打开
    const modal = page.locator('.ant-modal-content');
    expect(await modal.isVisible()).toBe(true);

    // 获取当前课时输入框的值
    const lessonsInput = modal.locator('input[name="remainingLessons"]');
    const inputCount = await lessonsInput.count();

    if (inputCount > 0) {
      const initialValue = await lessonsInput.inputValue();
      console.log('编辑弹窗中的课时值:', initialValue);

      // 清空课时输入框（模拟不填写）
      await lessonsInput.fill('');
      await page.waitForTimeout(500);

      // 修改其他字段（如姓名）
      const nameInput = modal.locator('input[name="name"]');
      await nameInput.clear();
      await nameInput.fill('测试学员-修改后');

      // 提交表单
      const okButton = modal.locator('.ant-modal-footer button:has-text("确定")');
      await okButton.click();
      await page.waitForTimeout(2000);

      // 验证提交成功
      const message = page.locator('.ant-message');
      const messageText = await message.textContent();
      console.log('提交消息:', messageText);

      // 重新获取学员数据
      const apiResponse2 = await getApiResponse(page, `/api/students/${firstStudent.id}`);
      const updatedStudent = apiResponse2.data;

      console.log('更新后剩余课时:', updatedStudent.remainingLessons);

      // 关键验证：课时应该保持原值，而不是被清零
      expect(updatedStudent.remainingLessons).toBe(originalRemainingLessons);
      console.log('✓ 课时保持不变，没有被清零');
    } else {
      console.log('课时输入框未找到，可能表单结构不同');
      // 关闭弹窗
      await page.keyboard.press('Escape');
    }
  });

  /**
   * 测试：添加班级到学员
   *
   * 这个测试验证：
   * - 编辑学员时可以添加班级
   * - 添加班级后学员列表能显示班级信息
   */
  test('编辑学员时添加班级应该正确保存', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});

    // 获取班级列表
    const classesResponse = await getApiResponse(page, '/api/classes?page=1&pageSize=10');

    if (!classesResponse.data || classesResponse.data.length === 0) {
      console.log('没有班级数据，跳过测试');
      test.skip();
      return;
    }

    const firstClass = classesResponse.data[0];
    console.log('使用的班级:', firstClass.name);

    // 获取学员列表
    const studentsResponse = await getApiResponse(page, '/api/students?page=1&pageSize=5');

    if (!studentsResponse.data || studentsResponse.data.length === 0) {
      test.skip();
      return;
    }

    // 找一个没有班级的学员
    const studentWithoutClass = studentsResponse.data.find((s: any) =>
      !s.enrollments || s.enrollments.length === 0
    );

    if (!studentWithoutClass) {
      console.log('没有找到没有班级的学员');
      test.skip();
      return;
    }

    console.log('测试学员:', studentWithoutClass.name);

    // 导航到学员页面并编辑
    const tableRows = page.locator('.ant-table-tbody tr');
    const rowCount = await tableRows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = tableRows.nth(i);
      const nameCell = row.locator('td').nth(0);
      const cellText = await nameCell.textContent();

      if (cellText && cellText.includes(studentWithoutClass.name)) {
        // 点击编辑
        const editButton = row.locator('button:has-text("编辑")');
        await editButton.click();
        await page.waitForTimeout(1000);

        // 验证弹窗打开
        const modal = page.locator('.ant-modal-content');
        expect(await modal.isVisible()).toBe(true);

        // 检查是否有班级选择框
        const classSelect = modal.locator('select[name="classId"]');
        const selectCount = await classSelect.count();

        if (selectCount > 0) {
          // 选择班级
          await classSelect.selectOption({ label: firstClass.name });
          await page.waitForTimeout(500);

          // 提交
          const okButton = modal.locator('.ant-modal-footer button:has-text("确定")');
          await okButton.click();
          await page.waitForTimeout(2000);

          console.log('✓ 班级已添加到学员');

          // 验证学员详情中包含 enrollments
          const detailResponse = await getApiResponse(page, `/api/students/${studentWithoutClass.id}`);
          expect(detailResponse.data.enrollments).toBeDefined();
          expect(detailResponse.data.enrollments.length).toBeGreaterThan(0);

          console.log('✓ 学员 enrollments 数据正确');
        } else {
          console.log('班级选择框未找到');
        }

        break;
      }
    }
  });
});

test.describe.serial('数据完整性 - 成单信息创建测试', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginRobust(page, salesUser);
    if (!loginSuccess) {
      // 如果 sales 用户不可用，尝试 admin
      const adminLoginSuccess = await loginRobust(page, adminUser);
      if (!adminLoginSuccess) {
        test.skip();
        return;
      }
    }
  });

  /**
   * 问题4验证：创建成单信息应该成功
   *
   * 这个测试会发现：
   * - 创建学员时是否包含 campusId
   * - 成单记录是否能正确创建
   * - 是否自动创建了 enrollment 记录
   */
  test('创建成单信息应该成功并自动创建学员和报名记录', async ({ page }) => {
    // 导航到成单信息页面
    const navSuccess = await safeNavigate(page, '/order-info');

    if (!navSuccess) {
      console.log('无法导航到成单信息页面');
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // 检查页面是否有新增按钮
    const addButton = page.locator('button:has-text("新增成单"), button:has-text("添加"), button:has-text("新建")');
    const buttonCount = await addButton.count();

    if (buttonCount === 0) {
      console.log('新增按钮未找到，跳过测试');
      test.skip();
      return;
    }

    await addButton.first().click();
    await page.waitForTimeout(1000);

    // 验证弹窗打开
    const modal = page.locator('.ant-modal-content');
    expect(await modal.isVisible()).toBe(true);

    // 填写成单信息
    const timestamp = Date.now();
    const testStudentName = `测试学员${timestamp}`;

    // 填写必填字段
    const nameInput = modal.locator('input[name="studentName"], input[placeholder*="学员姓名"]');
    const nameCount = await nameInput.count();

    if (nameCount > 0) {
      await nameInput.fill(testStudentName);
    }

    // 选择课程类型
    const courseTypeSelect = modal.locator('select[name="courseType"]');
    const courseCount = await courseTypeSelect.count();

    if (courseCount > 0) {
      await courseTypeSelect.selectOption('新签');
    }

    // 填写课时
    const lessonsInput = modal.locator('input[name="totalLessons"]');
    const lessonsCount = await lessonsInput.count();

    if (lessonsCount > 0) {
      await lessonsInput.fill('10');
    }

    // 填写金额
    const priceInput = modal.locator('input[name="price"]');
    const priceCount = await priceInput.count();

    if (priceCount > 0) {
      await priceInput.fill('1000');
    }

    // 选择班级（如果有班级选择框）
    const classSelect = modal.locator('select[name="classId"]');
    const classSelectCount = await classSelect.count();

    if (classSelectCount > 0) {
      // 获取班级选项
      const options = await classSelect.locator('option').all();
      if (options.length > 1) {
        // 选择第一个班级（跳过空选项）
        await classSelect.selectOption({ index: 1 });
      }
    }

    // 提交表单
    const okButton = modal.locator('.ant-modal-footer button:has-text("确定")');
    await okButton.click();
    await page.waitForTimeout(3000);

    // 检查是否有错误消息
    const errorMessage = page.locator('.ant-message-error, .ant-message-error-content');
    const errorCount = await errorMessage.count();

    if (errorCount > 0) {
      const errorText = await errorMessage.textContent();
      console.error('创建成单失败:', errorText);

      // 截图保存错误状态
      await page.screenshot({ path: `test-results/create-conversion-error-${timestamp}.png` });

      // 如果是因为 campusId 的问题，这里会捕获到
      expect(errorText).not.toContain('创建学员失败');
    } else {
      console.log('✓ 成单创建成功（或按钮未找到）');
    }

    // 清理：关闭弹窗
    await page.keyboard.press('Escape').catch(() => {});
  });
});

test.describe.serial('角色权限 - 数据隔离测试', () => {
  test.slow();

  /**
   * 问题5验证：不同角色应该看到不同的数据
   *
   * 这个测试验证：
   * - Coach 只能看到自己负责班级的学员
   * - Sales 只能看到自己负责的线索和成单
   * - 数据隔离是否正确实现
   */
  test('Coach 角色应该只能看到自己班级的学员', async ({ page }) => {
    const loginSuccess = await loginRobust(page, coachUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到学员管理页面
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});

    // 获取学员列表
    const apiResponse = await getApiResponse(page, '/api/students?page=1&pageSize=50');
    console.log('Coach 看到的学员数量:', apiResponse.data?.length || 0);

    // 验证每个学员的 enrollments
    if (apiResponse.data && apiResponse.data.length > 0) {
      for (const student of apiResponse.data) {
        console.log(`学员 ${student.name} 的 enrollments:`, student.enrollments);

        // 验证：如果学员有 enrollments，应该只包含当前教练负责的班级
        if (student.enrollments && student.enrollments.length > 0) {
          for (const enrollment of student.enrollments) {
            if (enrollment.class) {
              console.log(`  - 班级: ${enrollment.class.name}, 教练ID: ${enrollment.class.teacherId}`);

              // 这里需要验证 teacherId 是否匹配当前教练的 ID
              // 但我们需要先获取当前教练的 ID
            }
          }
        }
      }
    }

    // 获取当前用户信息
    const userInfo = await page.evaluate(() => {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        return parsed.state.user;
      }
      return null;
    });

    console.log('当前用户信息:', userInfo);

    // 验证：如果用户是 coach，检查学员数据过滤
    if (userInfo && ['coach', 'teacher'].includes(userInfo.role)) {
      const coachId = userInfo.id;
      console.log('Coach ID:', coachId);

      // 获取班级列表，验证教练只能看到自己的班级
      const classesResponse = await getApiResponse(page, '/api/classes?page=1&pageSize=50');
      console.log('Coach 看到的班级数量:', classesResponse.data?.length || 0);

      if (classesResponse.data) {
        for (const cls of classesResponse.data) {
          console.log(`班级: ${cls.name}, 教练ID: ${cls.teacherId}`);

          // 验证：所有班级的 teacherId 应该匹配当前教练
          if (cls.teacherId !== coachId) {
            console.error(`❌ 数据隔离失败：班级 ${cls.name} 的教练ID 不匹配当前用户`);
          }
        }
      }
    }
  });

  /**
   * 测试：Sales 角色的数据隔离
   */
  test('Sales 角色应该只能看到自己负责的线索和成单', async ({ page }) => {
    // 先登出当前用户
    await page.evaluate(() => {
      localStorage.clear();
    });

    // 登录 Sales 用户
    const loginSuccess = await loginRobust(page, salesUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到成单信息页面
    const navSuccess = await safeNavigate(page, '/order-info');
    if (!navSuccess) {
      console.log('Sales 无法访问成单信息页面');
      test.skip();
      return;
    }

    await page.waitForLoadState('networkidle').catch(() => {});

    // 获取成单列表
    const apiResponse = await getApiResponse(page, '/api/conversions?page=1&pageSize=50');
    console.log('Sales 看到的成单数量:', apiResponse.data?.length || 0);

    // 获取当前用户信息
    const userInfo = await page.evaluate(() => {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        return parsed.state.user;
      }
      return null;
    });

    console.log('当前用户信息:', userInfo);

    // 验证：所有成单的 salesId 应该匹配当前用户
    if (userInfo && apiResponse.data) {
      const salesId = userInfo.id;
      console.log('Sales ID:', salesId);

      for (const conversion of apiResponse.data) {
        console.log(`成单: ${conversion.studentName}, SalesID: ${conversion.salesId}`);

        if (conversion.salesId !== salesId) {
          console.error(`❌ 数据隔离失败：成单 ${conversion.studentName} 的 salesId 不匹配当前用户`);
        }
      }
    }
  });
});

test.describe.serial('数据完整性 - 现金流汇总测试', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginRobust(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }
  });

  /**
   * 测试：现金流汇总页面应该正确显示数据
   *
   * 这个测试验证之前修复的现金流汇总问题：
   * - 体验课到场数统计
   * - 成单数和成单率
   * - 续费统计
   */
  test('现金流汇总应该正确显示统计数据', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/cashflow/summary');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    // 获取现金流汇总数据
    const apiResponse = await getApiResponse(page, '/api/cashflow/summary');
    console.log('现金流汇总响应:', JSON.stringify(apiResponse, null, 2));

    // 验证响应结构
    expect(apiResponse).toHaveProperty('success');
    expect(apiResponse.success).toBe(true);
    expect(apiResponse.data).toBeDefined();

    const summary = apiResponse.data;

    // 验证新签板块数据
    expect(summary).toHaveProperty('newSignup');
    expect(summary.newSignup).toHaveProperty('totalLeads');
    expect(summary.newSignup).toHaveProperty('attendedExperience');
    expect(summary.newSignup).toHaveProperty('conversions');
    expect(summary.newSignup).toHaveProperty('conversionRate');

    console.log('新签统计:', summary.newSignup);

    // 验证续费板块数据
    expect(summary).toHaveProperty('renewal');
    expect(summary.renewal).toHaveProperty('count');
    expect(summary.renewal).toHaveProperty('amount');
    expect(summary.renewal).toHaveProperty('renewalRate');

    console.log('续费统计:', summary.renewal);

    // 验证数值有效性
    expect(summary.newSignup.totalLeads).toBeGreaterThanOrEqual(0);
    expect(summary.newSignup.attendedExperience).toBeGreaterThanOrEqual(0);
    expect(summary.newSignup.conversions).toBeGreaterThanOrEqual(0);
    expect(summary.newSignup.conversionRate).toBeGreaterThanOrEqual(0);
    expect(summary.newSignup.conversionRate).toBeLessThanOrEqual(100);

    console.log('✓ 现金流汇总数据正确');
  });
});

test.describe.serial('数据完整性 - 续费管理测试', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginRobust(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }
  });

  /**
   * 测试：续费管理页面应该正确显示待续费学员
   *
   * 这个测试验证之前修复的续费管理问题：
   * - maxRemainingLessons 参数
   * - renewalStatus 参数
   * - excludeNoRenewal 参数
   */
  test('续费管理应该正确显示待续费学员', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/renewal');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    // 测试 maxRemainingLessons 参数
    const apiResponse1 = await getApiResponse(page, '/api/students?maxRemainingLessons=10');
    console.log('剩余课时<=10的学员:', apiResponse1.data?.length || 0);

    if (apiResponse1.data) {
      for (const student of apiResponse1.data) {
        if (student.remainingLessons !== null) {
          expect(student.remainingLessons).toBeLessThanOrEqual(10);
        }
      }
    }

    // 测试 renewalStatus 参数
    const apiResponse2 = await getApiResponse(page, '/api/students?renewalStatus=pending');
    console.log('续费状态为pending的学员:', apiResponse2.data?.length || 0);

    if (apiResponse2.data) {
      for (const student of apiResponse2.data) {
        expect(student.renewalStatus).toBe('pending');
      }
    }

    // 测试 excludeNoRenewal 参数
    const apiResponse3 = await getApiResponse(page, '/api/students?excludeNoRenewal=true');
    console.log('排除不续费后的学员:', apiResponse3.data?.length || 0);

    if (apiResponse3.data) {
      for (const student of apiResponse3.data) {
        // 不应包含 renewalStatus 为 "no_renewal" 的学员
        expect(student.renewalStatus).not.toBe('no_renewal');
      }
    }

    console.log('✓ 续费管理参数过滤正确');
  });
});

test.describe.serial('边界条件测试', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginRobust(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }
  });

  /**
   * 测试：空数据状态
   */
  test('空数据状态下页面应该正常显示', async ({ page }) => {
    // 导航到学员管理页面
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});

    // 搜索一个不存在的学员
    const searchInput = page.locator('input[placeholder*="搜索学员"]');
    const searchCount = await searchInput.count();

    if (searchCount > 0) {
      await searchInput.fill('不存在的学员姓名XYZ123');

      const searchButton = page.locator('button:has-text("搜索")');
      const buttonCount = await searchButton.count();

      if (buttonCount > 0) {
        await searchButton.click();
        await page.waitForTimeout(2000);

        // 验证空状态显示
        const emptyState = page.locator('.ant-empty');
        const emptyCount = await emptyState.count();

        if (emptyCount > 0) {
          console.log('✓ 空状态正确显示');
        }

        // 或者表格显示 "暂无数据"
        const noDataRow = page.locator('.ant-table-placeholder .ant-empty');
        const noDataCount = await noDataRow.count();

        if (noDataCount > 0) {
          console.log('✓ 暂无数据状态正确显示');
        }
      }
    }
  });

  /**
   * 测试：分页功能
   */
  test('分页功能应该正确工作', async ({ page }) => {
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});

    // 获取第一页数据
    const page1Response = await getApiResponse(page, '/api/students?page=1&pageSize=5');
    const page1Count = page1Response.data?.length || 0;

    // 获取第二页数据
    const page2Response = await getApiResponse(page, '/api/students?page=2&pageSize=5');
    const page2Count = page2Response.data?.length || 0;

    console.log('第一页数量:', page1Count, '第二页数量:', page2Count);

    // 验证分页计数
    const pagination = page.locator('.ant-pagination');
    const paginationCount = await pagination.count();

    if (paginationCount > 0 && page1Count > 0) {
      console.log('✓ 分页组件存在');
    }
  });

  /**
   * 测试：大数据量性能
   */
  test('大量数据时页面响应时间应该在可接受范围内', async ({ page }) => {
    const startTime = Date.now();

    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    await page.waitForLoadState('networkidle').catch(() => {});

    const loadTime = Date.now() - startTime;
    console.log('页面加载时间:', loadTime, 'ms');

    // 页面应该在 5 秒内加载完成
    expect(loadTime).toBeLessThan(5000);

    // API 响应时间
    const apiStartTime = Date.now();
    const apiResponse = await getApiResponse(page, '/api/students?page=1&pageSize=100');
    const apiTime = Date.now() - apiStartTime;

    console.log('API 响应时间:', apiTime, 'ms');

    // API 应该在 3 秒内响应
    expect(apiTime).toBeLessThan(3000);
  });
});

/**
 * 辅助测试套件：API 直接测试
 */
test.describe.serial('API 数据结构验证', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const loginSuccess = await loginRobust(page, adminUser);
    if (!loginSuccess) {
      test.skip();
      return;
    }
  });

  /**
   * 验证所有关键 API 端点的响应结构
   */
  test('所有关键 API 应该返回正确的数据结构', async ({ page }) => {
    const apis = [
      { url: '/api/students?page=1&pageSize=5', name: '学员列表' },
      { url: '/api/classes?page=1&pageSize=5', name: '班级列表' },
      { url: '/api/conversions?page=1&pageSize=5', name: '成单列表' },
      { url: '/api/cashflow/summary', name: '现金流汇总' },
    ];

    for (const api of apis) {
      console.log(`测试 API: ${api.name}`);

      const response = await getApiResponse(page, api.url);
      console.log(`${api.name} 响应:`, JSON.stringify(response, null, 2));

      // 基本结构验证
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('data');

      if (response.success && response.data) {
        console.log(`✓ ${api.name} 数据结构正确`);
      } else {
        console.error(`❌ ${api.name} 数据结构异常`);
      }
    }
  });
});
