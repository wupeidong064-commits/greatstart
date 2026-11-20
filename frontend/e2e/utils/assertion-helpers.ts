/**
 * E2E 测试断言辅助函数
 *
 * 提供常用的断言函数，简化测试代码
 */

import { Page, Locator } from '@playwright/test';
import { CONSTANTS } from '../setup/test-constants';
import { DataHelpers } from './data-helpers';

// ============================================================
// 页面状态断言
// ============================================================

/**
 * 断言页面标题
 */
export async function assertPageTitle(page: Page, expectedTitle: string): Promise<void> {
  const title = await page.title();
  if (!title.includes(expectedTitle)) {
    throw new Error(`页面标题不匹配。预期包含: "${expectedTitle}", 实际: "${title}"`);
  }
}

/**
 * 断言当前 URL 路径
 */
export async function assertPathname(page: Page, expectedPath: string): Promise<void> {
  const pathname = page.url().split('?')[0];
  if (!pathname.endsWith(expectedPath)) {
    throw new Error(`URL 路径不匹配。预期: "${expectedPath}", 实际: "${pathname}"`);
  }
}

/**
 * 断言页面包含特定文本
 */
export async function assertPageContains(page: Page, text: string): Promise<void> {
  const content = await page.textContent('body');
  if (!content?.includes(text)) {
    throw new Error(`页面不包含预期文本: "${text}"`);
  }
}

/**
 * 断言元素可见
 */
export async function assertElementVisible(
  page: Page,
  selector: string,
  timeout: number = CONSTANTS.WAIT_TIMES.medium
): Promise<void> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
  } catch {
    throw new Error(`元素不可见: ${selector}`);
  }
}

/**
 * 断言元素隐藏
 */
export async function assertElementHidden(
  page: Page,
  selector: string,
  timeout: number = CONSTANTS.WAIT_TIMES.medium
): Promise<void> {
  try {
    await page.waitForSelector(selector, { state: 'hidden', timeout });
  } catch {
    throw new Error(`元素未隐藏: ${selector}`);
  }
}

// ============================================================
// 表格断言
// ============================================================

/**
 * 断言表格行数
 */
export async function assertTableRowCount(
  page: Page,
  tableSelector: string,
  expectedCount: number
): Promise<void> {
  const actualCount = await DataHelpers.getTableRowCount(page, tableSelector);
  if (actualCount !== expectedCount) {
    throw new Error(
      `表格行数不匹配。预期: ${expectedCount}, 实际: ${actualCount}`
    );
  }
}

/**
 * 断言表格包含特定数据
 */
export async function assertTableContains(
  page: Page,
  tableSelector: string,
  expectedData: string[]
): Promise<void> {
  const contains = await DataHelpers.verifyTableContains(page, tableSelector, expectedData);
  if (!contains) {
    throw new Error(`表格不包含预期数据: ${expectedData.join(', ')}`);
  }
}

/**
 * 断言表格不包含特定数据
 */
export async function assertTableNotContains(
  page: Page,
  tableSelector: string,
  unexpectedData: string[]
): Promise<void> {
  const table = await DataHelpers.extractTableData(page, tableSelector);

  for (const unexpected of unexpectedData) {
    const found = table.rows.some(row =>
      row.some(cell => cell.includes(unexpected))
    );
    if (found) {
      throw new Error(`表格不应包含数据: ${unexpected}`);
    }
  }
}

// ============================================================
// 表单断言
// ============================================================

/**
 * 断言表单字段值
 */
export async function assertFieldValue(
  page: Page,
  selector: string,
  expectedValue: string
): Promise<void> {
  const actualValue = await DataHelpers.getFormFieldValue(page, selector);
  if (actualValue !== expectedValue) {
    throw new Error(
      `字段值不匹配 (${selector})。预期: "${expectedValue}", 实际: "${actualValue}"`
    );
  }
}

/**
 * 断言表单字段为空
 */
export async function assertFieldEmpty(page: Page, selector: string): Promise<void> {
  const actualValue = await DataHelpers.getFormFieldValue(page, selector);
  if (actualValue !== '') {
    throw new Error(`字段应为空但包含值: "${actualValue}" (${selector})`);
  }
}

/**
 * 断言必填字段错误提示
 */
export async function assertRequiredFieldError(
  page: Page,
  selector: string
): Promise<void> {
  const errorElement = page.locator(`${selector} + [data-testid="field-error"]`);
  if (!(await errorElement.isVisible())) {
    throw new Error(`未显示必填字段错误提示: ${selector}`);
  }
}

// ============================================================
// 按钮断言
// ============================================================

/**
 * 断言按钮启用
 */
export async function assertButtonEnabled(page: Page, buttonSelector: string): Promise<void> {
  const button = page.locator(buttonSelector);
  const isDisabled = await button.isDisabled();

  if (isDisabled) {
    throw new Error(`按钮应为启用状态但为禁用: ${buttonSelector}`);
  }
}

/**
 * 断言按钮禁用
 */
export async function assertButtonDisabled(page: Page, buttonSelector: string): Promise<void> {
  const button = page.locator(buttonSelector);
  const isDisabled = await button.isDisabled();

  if (!isDisabled) {
    throw new Error(`按钮应为禁用状态但为启用: ${buttonSelector}`);
  }
}

// ============================================================
// 权限断言
// ============================================================

/**
 * 断言无权访问（重定向到错误页）
 */
export async function assertAccessDenied(page: Page): Promise<void> {
  // 检查是否显示错误提示或被重定向
  const hasError = await page.locator('[data-testid="access-denied"]').isVisible();
  const hasForbiddenMessage = await page.textContent('body')?.then(text =>
    text?.includes('无权访问') || text?.includes('FORBIDDEN')
  );

  if (!hasError && !hasForbiddenMessage) {
    throw new Error('未检测到访问拒绝提示');
  }
}

/**
 * 断言菜单项可见
 */
export async function assertMenuItemVisible(page: Page, itemText: string): Promise<void> {
  const menuItem = page.locator(`[data-testid="menu-item"]:has-text("${itemText}")`);
  if (!(await menuItem.isVisible())) {
    throw new Error(`菜单项不可见: ${itemText}`);
  }
}

/**
 * 断言菜单项隐藏
 */
export async function assertMenuItemHidden(page: Page, itemText: string): Promise<void> {
  const menuItem = page.locator(`[data-testid="menu-item"]:has-text("${itemText}")`);
  if (await menuItem.isVisible()) {
    throw new Error(`菜单项应为隐藏: ${itemText}`);
  }
}

// ============================================================
// 消息断言
// ============================================================

/**
 * 断言成功消息显示
 */
export async function assertSuccessMessage(
  page: Page,
  expectedMessage?: string
): Promise<void> {
  const hasMessage = await DataHelpers.verifySuccessMessage(page, expectedMessage);
  if (!hasMessage) {
    throw new Error(`未显示成功消息: ${expectedMessage || '任意成功消息'}`);
  }
}

/**
 * 断言错误消息显示
 */
export async function assertErrorMessage(
  page: Page,
  expectedMessage?: string
): Promise<void> {
  const hasMessage = await DataHelpers.verifyErrorMessage(page, expectedMessage);
  if (!hasMessage) {
    throw new Error(`未显示错误消息: ${expectedMessage || '任意错误消息'}`);
  }
}

/**
 * 断言特定错误消息
 */
export async function assertSpecificErrorMessage(
  page: Page,
  expectedMessage: string
): Promise<void> {
  const errorElement = page.locator(`[role="alert"]:has-text("${expectedMessage}")`);
  if (!(await errorElement.isVisible())) {
    throw new Error(`未显示特定错误消息: ${expectedMessage}`);
  }
}

// ============================================================
// 业务规则断言
// ============================================================

/**
 * 断言划课限制：非当日排课不能划课
 */
export async function assertNotTodayScheduleError(page: Page): Promise<void> {
  await assertErrorMessage(page, CONSTANTS.ERROR_MESSAGES.NOT_TODAY_SCHEDULE);
}

/**
 * 断言划课限制：非管理员今天已划过课
 */
export async function assertAlreadyDeductedError(page: Page): Promise<void> {
  await assertErrorMessage(page, CONSTANTS.ERROR_MESSAGES.ALREADY_DEDUCTED);
}

/**
 * 断言课时不足
 */
export async function assertInsufficientLessonsError(page: Page): Promise<void> {
  await assertErrorMessage(page, CONSTANTS.ERROR_MESSAGES.INSUFFICIENT_LESSONS);
}

// ============================================================
// 数据一致性断言
// ============================================================

/**
 * 断言两个页面的统计数据一致
 */
export async function assertStatisticsMatch(
  page1: Page,
  stats1Selector: string,
  page2: Page,
  stats2Selector: string
): Promise<void> {
  const stats1 = await page1.locator(stats1Selector).textContent();
  const stats2 = await page2.locator(stats2Selector).textContent();

  if (stats1 !== stats2) {
    throw new Error(
      `统计数据不一致。页面1: "${stats1}", 页面2: "${stats2}"`
    );
  }
}

/**
 * 断言学员在两个列表中都能找到
 */
export async function assertStudentInBothLists(
  page: Page,
  list1Selector: string,
  list2Selector: string,
  studentName: string
): Promise<void> {
  const inList1 = await DataHelpers.verifyTableContains(page, list1Selector, [studentName]);
  const inList2 = await DataHelpers.verifyTableContains(page, list2Selector, [studentName]);

  if (!inList1 || !inList2) {
    throw new Error(`学员 "${studentName}" 未在两个列表中都找到`);
  }
}

// ============================================================
// 数值断言
// ============================================================

/**
 * 断言数值范围
 */
export function assertNumberInRange(
  actual: number,
  min: number,
  max: number,
  context?: string
): void {
  if (actual < min || actual > max) {
    throw new Error(
      `数值超出范围${context ? ` (${context})` : ''}。预期: ${min}-${max}, 实际: ${actual}`
    );
  }
}

/**
 * 断言数值相等（允许误差）
 */
export function assertNumberEqual(
  actual: number,
  expected: number,
  tolerance: number = 0,
  context?: string
): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `数值不相等${context ? ` (${context})` : ''}。预期: ${expected}, 实际: ${actual}, 差异: ${diff}`
    );
  }
}

/**
 * 断言数值递增
 */
export function assertNumberIncreased(
  oldValue: number,
  newValue: number,
  context?: string
): void {
  if (newValue <= oldValue) {
    throw new Error(
      `数值未增加${context ? ` (${context})` : ''}。旧值: ${oldValue}, 新值: ${newValue}`
    );
  }
}

/**
 * 断言数值递减
 */
export function assertNumberDecreased(
  oldValue: number,
  newValue: number,
  context?: string
): void {
  if (newValue >= oldValue) {
    throw new Error(
      `数值未减少${context ? ` (${context})` : ''}。旧值: ${oldValue}, 新值: ${newValue}`
    );
  }
}

// ============================================================
// 时间断言
// ============================================================

/**
 * 断言时间在范围内
 */
export function assertTimeInRange(
  actualTime: Date,
  startTime: Date,
  endTime: Date,
  context?: string
): void {
  if (actualTime < startTime || actualTime > endTime) {
    throw new Error(
      `时间不在范围内${context ? ` (${context})` : ''}。` +
      `预期: ${startTime.toISOString()} - ${endTime.toISOString()}, ` +
      `实际: ${actualTime.toISOString()}`
    );
  }
}

// ============================================================
// 导出
// ============================================================

export const AssertionHelpers = {
  // 页面状态
  assertPageTitle,
  assertPathname,
  assertPageContains,
  assertElementVisible,
  assertElementHidden,

  // 表格断言
  assertTableRowCount,
  assertTableContains,
  assertTableNotContains,

  // 表单断言
  assertFieldValue,
  assertFieldEmpty,
  assertRequiredFieldError,

  // 按钮断言
  assertButtonEnabled,
  assertButtonDisabled,

  // 权限断言
  assertAccessDenied,
  assertMenuItemVisible,
  assertMenuItemHidden,

  // 消息断言
  assertSuccessMessage,
  assertErrorMessage,
  assertSpecificErrorMessage,

  // 业务规则断言
  assertNotTodayScheduleError,
  assertAlreadyDeductedError,
  assertInsufficientLessonsError,

  // 数据一致性断言
  assertStatisticsMatch,
  assertStudentInBothLists,

  // 数值断言
  assertNumberInRange,
  assertNumberEqual,
  assertNumberIncreased,
  assertNumberDecreased,

  // 时间断言
  assertTimeInRange,
};
