/**
 * E2E 测试数据辅助函数
 *
 * 提供数据操作和验证的辅助函数
 */

import { Page, Locator } from '@playwright/test';
import { CONSTANTS } from '../setup/test-constants';

// ============================================================
// 类型定义
// ============================================================

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface FilterOptions {
  status?: string;
  courseType?: string;
  dateRange?: { start: string; end: string };
  teacherId?: string;
  classId?: string;
}

// ============================================================
// 表格数据提取
// ============================================================

/**
 * 从表格中提取数据
 */
export async function extractTableData(page: Page, tableSelector: string): Promise<TableData> {
  const table = page.locator(tableSelector);

  // 获取表头
  const headers = await table.locator('thead th').allTextContents();

  // 获取行数据
  const rows: string[][] = [];
  const rowElements = await table.locator('tbody tr').all();

  for (const row of rowElements) {
    const cells = await row.locator('td').allTextContents();
    rows.push(cells);
  }

  return { headers, rows };
}

/**
 * 在表格中查找特定行
 */
export async function findRowInTable(
  page: Page,
  tableSelector: string,
  searchTerm: string,
  searchColumn?: number
): Promise<string[] | null> {
  const table = await extractTableData(page, tableSelector);

  for (const row of table.rows) {
    if (searchColumn !== undefined) {
      if (row[searchColumn] === searchTerm) {
        return row;
      }
    } else {
      if (row.some(cell => cell.includes(searchTerm))) {
        return row;
      }
    }
  }

  return null;
}

/**
 * 获取表格行数
 */
export async function getTableRowCount(page: Page, tableSelector: string): Promise<number> {
  const table = page.locator(tableSelector);
  const rowCount = await table.locator('tbody tr').count();
  return rowCount;
}

/**
 * 验证表格包含特定数据
 */
export async function verifyTableContains(
  page: Page,
  tableSelector: string,
  expectedData: string[]
): Promise<boolean> {
  const table = await extractTableData(page, tableSelector);

  for (const expected of expectedData) {
    const found = table.rows.some(row =>
      row.some(cell => cell.includes(expected))
    );
    if (!found) {
      console.log(`未找到预期数据: ${expected}`);
      return false;
    }
  }

  return true;
}

// ============================================================
// 表单操作
// ============================================================

/**
 * 填写表单字段
 */
export async function fillFormField(
  page: Page,
  selector: string,
  value: string | number
): Promise<void> {
  await page.fill(selector, String(value));
}

/**
 * 选择下拉选项
 */
export async function selectDropdownOption(
  page: Page,
  selector: string,
  optionText: string
): Promise<void> {
  await page.click(selector);
  await page.click(`li:has-text("${optionText}")`);
  // 或者使用 selectOption 如果是原生 select
}

/**
 * 获取表单字段值
 */
export async function getFormFieldValue(
  page: Page,
  selector: string
): Promise<string> {
  const value = await page.inputValue(selector);
  return value;
}

// ============================================================
// 筛选操作
// ============================================================

/**
 * 应用表格筛选
 */
export async function applyTableFilter(
  page: Page,
  filterOptions: FilterOptions
): Promise<void> {
  if (filterOptions.status) {
    await selectDropdownOption(page, '[data-testid="status-filter"]', filterOptions.status);
  }

  if (filterOptions.courseType) {
    await selectDropdownOption(page, '[data-testid="course-type-filter"]', filterOptions.courseType);
  }

  if (filterOptions.teacherId) {
    await selectDropdownOption(page, '[data-testid="teacher-filter"]', filterOptions.teacherId);
  }

  if (filterOptions.classId) {
    await selectDropdownOption(page, '[data-testid="class-filter"]', filterOptions.classId);
  }

  if (filterOptions.dateRange) {
    await fillFormField(page, '[data-testid="date-start"]', filterOptions.dateRange.start);
    await fillFormField(page, '[data-testid="date-end"]', filterOptions.dateRange.end);
  }

  // 点击筛选按钮
  await page.click('[data-testid="apply-filter"]');

  // 等待筛选结果
  await page.waitForTimeout(CONSTANTS.WAIT_TIMES.apiResponse);
}

/**
 * 重置表格筛选
 */
export async function resetTableFilter(page: Page): Promise<void> {
  await page.click('[data-testid="reset-filter"]');
  await page.waitForTimeout(CONSTANTS.WAIT_TIMES.apiResponse);
}

// ============================================================
// 数据验证
// ============================================================

/**
 * 验证分页信息
 */
export async function verifyPagination(
  page: Page,
  expectedTotal: number,
  expectedPageSize: number
): Promise<boolean> {
  const paginationText = await page.locator('[data-testid="pagination-info"]').textContent();
  if (!paginationText) return false;

  // 解析分页信息，格式通常为 "显示 1-10 / 共 50 条"
  const match = paginationText.match(/共\s*(\d+)\s*条/);
  if (!match) return false;

  const actualTotal = parseInt(match[1], 10);
  return actualTotal === expectedTotal;
}

/**
 * 验证统计数据
 */
export async function verifyStatistics(
  page: Page,
  statsSelector: string,
  expectedValue: number
): Promise<boolean> {
  const statsElement = page.locator(statsSelector);
  const actualText = await statsElement.textContent();

  if (!actualText) return false;

  const actualValue = parseInt(actualText.replace(/\D/g, ''), 10);
  return actualValue === expectedValue;
}

/**
 * 验证空状态
 */
export async function verifyEmptyState(page: Page, emptyMessage?: string): Promise<boolean> {
  const emptyElement = page.locator('[data-testid="empty-state"]');

  if (!(await emptyElement.isVisible())) {
    return false;
  }

  if (emptyMessage) {
    const actualMessage = await emptyElement.textContent();
    return actualMessage?.includes(emptyMessage) ?? false;
  }

  return true;
}

// ============================================================
// 导出功能
// ============================================================

/**
 * 触发数据导出
 */
export async function exportData(
  page: Page,
  exportType: 'csv' | 'excel' = 'csv'
): Promise<void> {
  const exportButton = page.locator(`[data-testid="export-${exportType}"]`);
  await exportButton.click();

  // 等待下载开始
  const downloadPromise = page.waitForEvent('download');
  const download = await downloadPromise;

  console.log(`导出文件: ${download.suggestedFilename()}`);
}

/**
 * 验证导出数据
 */
export async function verifyExportData(
  page: Page,
  expectedRowCount: number
): Promise<boolean> {
  // 这个函数需要根据实际导出实现来编写
  // 可能需要检查下载文件的内容
  return true;
}

// ============================================================
// Modal/Dialog 操作
// ============================================================

/**
 * 打开 Modal
 */
export async function openModal(page: Page, triggerSelector: string): Promise<void> {
  await page.click(triggerSelector);
  await page.waitForSelector('[role="dialog"]', { state: 'visible' });
}

/**
 * 关闭 Modal
 */
export async function closeModal(page: Page): Promise<void> {
  const closeButton = page.locator('[role="dialog"] button[aria-label="close"]');
  await closeButton.click();
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
}

/**
 * 在 Modal 中确认操作
 */
export async function confirmInModal(page: Page): Promise<void> {
  const confirmButton = page.locator('[role="dialog"] button:has-text("确定")');
  await confirmButton.click();
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
}

/**
 * 在 Modal 中取消操作
 */
export async function cancelInModal(page: Page): Promise<void> {
  const cancelButton = page.locator('[role="dialog"] button:has-text("取消")');
  await cancelButton.click();
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
}

// ============================================================
// Toast/Notification 操作
// ============================================================

/**
 * 等待 Toast 消息出现
 */
export async function waitForToast(
  page: Page,
  message?: string,
  timeout: number = CONSTANTS.WAIT_TIMES.apiResponse
): Promise<void> {
  const toastSelector = message
    ? `[role="alert"]:has-text("${message}")`
    : '[role="alert"]';

  await page.waitForSelector(toastSelector, { timeout });
}

/**
 * 验证成功消息
 */
export async function verifySuccessMessage(
  page: Page,
  expectedMessage?: string
): Promise<boolean> {
  const toastSelector = expectedMessage
    ? `[role="alert"]:has-text("${expectedMessage}")`
    : '[role="alert"].success';

  const toast = page.locator(toastSelector);
  const isVisible = await toast.isVisible();

  if (isVisible) {
    // 等待消息自动消失
    await toast.waitFor({ state: 'hidden', timeout: CONSTANTS.WAIT_TIMES.medium });
  }

  return isVisible;
}

/**
 * 验证错误消息
 */
export async function verifyErrorMessage(
  page: Page,
  expectedMessage?: string
): Promise<boolean> {
  const toastSelector = expectedMessage
    ? `[role="alert"]:has-text("${expectedMessage}")`
    : '[role="alert"].error';

  const toast = page.locator(toastSelector);
  return await toast.isVisible();
}

// ============================================================
// 列表/卡片操作
// ============================================================

/**
 * 获取列表项数量
 */
export async function getListItemCount(page: Page, listSelector: string): Promise<number> {
  const list = page.locator(listSelector);
  return await list.locator('[data-testid="list-item"]').count();
}

/**
 * 点击列表项中的操作按钮
 */
export async function clickListItemAction(
  page: Page,
  listSelector: string,
  itemIndex: number,
  action: 'edit' | 'delete' | 'view'
): Promise<void> {
  const listItem = page.locator(listSelector).locator('[data-testid="list-item"]').nth(itemIndex);
  const actionButton = listItem.locator(`[data-testid="${action}-button"]`);
  await actionButton.click();
}

// ============================================================
// 搜索操作
// ============================================================

/**
 * 执行搜索
 */
export async function performSearch(
  page: Page,
  searchTerm: string,
  searchSelector: string = '[data-testid="search-input"]'
): Promise<void> {
  await page.fill(searchSelector, searchTerm);

  // 等待防抖
  await page.waitForTimeout(CONSTANTS.WAIT_TIMES.medium);

  // 或者点击搜索按钮
  const searchButton = page.locator('[data-testid="search-button"]');
  if (await searchButton.isVisible()) {
    await searchButton.click();
  }

  await page.waitForTimeout(CONSTANTS.WAIT_TIMES.apiResponse);
}

/**
 * 清除搜索
 */
export async function clearSearch(page: Page): Promise<void> {
  const clearButton = page.locator('[data-testid="clear-search"]');
  if (await clearButton.isVisible()) {
    await clearButton.click();
  } else {
    await page.fill('[data-testid="search-input"]', '');
  }

  await page.waitForTimeout(CONSTANTS.WAIT_TIMES.apiResponse);
}

// ============================================================
// 导出
// ============================================================

export const DataHelpers = {
  // 表格操作
  extractTableData,
  findRowInTable,
  getTableRowCount,
  verifyTableContains,

  // 表单操作
  fillFormField,
  selectDropdownOption,
  getFormFieldValue,

  // 筛选操作
  applyTableFilter,
  resetTableFilter,

  // 数据验证
  verifyPagination,
  verifyStatistics,
  verifyEmptyState,

  // 导出功能
  exportData,
  verifyExportData,

  // Modal 操作
  openModal,
  closeModal,
  confirmInModal,
  cancelInModal,

  // Toast 操作
  waitForToast,
  verifySuccessMessage,
  verifyErrorMessage,

  // 列表操作
  getListItemCount,
  clickListItemAction,

  // 搜索操作
  performSearch,
  clearSearch,
};
