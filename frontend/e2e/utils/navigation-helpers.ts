/**
 * E2E 测试导航辅助函数
 *
 * 提供页面导航和路由操作的辅助函数
 */

import { Page } from '@playwright/test';
import { PAGE_PATHS, CONSTANTS, TEST_USERS, TestUserType } from '../setup/test-constants';
import { AssertionHelpers } from './assertion-helpers';

// ============================================================
// 页面导航
// ============================================================

/**
 * 导航到指定页面
 */
export async function navigateTo(
  page: Page,
  path: string,
  waitForSelector?: string
): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');

  if (waitForSelector) {
    // 尝试等待指定选择器
    try {
      await page.waitForSelector(waitForSelector, { timeout: CONSTANTS.WAIT_TIMES.pageLoad });
    } catch {
      // 如果指定选择器不存在，等待通用页面元素
      await page.waitForFunction(() => {
        const body = document.body;
        return body &&
          (body.querySelector('.ant-table') !== null ||
           body.querySelector('.ant-card') !== null ||
           body.querySelector('.ant-page-header') !== null ||
           body.querySelector('.ant-layout-content') !== null ||
           body.querySelector('.layout') !== null ||
           body.innerHTML.length > 2000);
      }, { timeout: CONSTANTS.WAIT_TIMES.pageLoad });
    }
  }
}

/**
 * 导航并等待特定元素
 */
export async function navigateToAndWaitFor(
  page: Page,
  path: string,
  selector: string
): Promise<void> {
  await page.goto(path);
  await page.waitForSelector(selector, { state: 'visible', timeout: CONSTANTS.WAIT_TIMES.pageLoad });
}

/**
 * 通过侧边栏导航到页面
 */
export async function navigateViaSidebar(
  page: Page,
  menuItemText: string,
  expectedPath?: string
): Promise<void> {
  // 确保侧边栏展开
  const sidebar = page.locator('[data-testid="sidebar"]');
  if (!(await sidebar.isVisible())) {
    await page.click('[data-testid="sidebar-toggle"]');
  }

  // 点击菜单项
  const menuItem = page.locator(`[data-testid="menu-item"]:has-text("${menuItemText}")`);
  await menuItem.click();

  // 等待导航完成
  await page.waitForLoadState('networkidle');

  // 验证路径（可选）
  if (expectedPath) {
    await AssertionHelpers.assertPathname(page, expectedPath);
  }
}

/**
 * 返回上一页
 */
export async function goBack(page: Page): Promise<void> {
  await page.goBack();
  await page.waitForLoadState('networkidle');
}

/**
 * 刷新页面
 */
export async function refresh(page: Page): Promise<void> {
  await page.reload();
  await page.waitForLoadState('networkidle');
}

// ============================================================
// 特定页面导航快捷方式
// ============================================================

/**
 * 导航到登录页
 */
export async function navigateToLogin(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.login);
}

/**
 * 导航到仪表盘
 */
export async function navigateToDashboard(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.dashboard);
}

/**
 * 导航到班级管理
 */
export async function navigateToClasses(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.classes);
}

/**
 * 导航到每周排课
 */
export async function navigateToWeeklySchedule(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.weeklySchedule);
}

/**
 * 导航到班级出勤
 */
export async function navigateToClassAttendance(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.classAttendance);
}

/**
 * 导航到学员管理
 */
export async function navigateToStudents(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.students);
}

/**
 * 导航到鱼池（营销池）
 */
export async function navigateToMarketingPool(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.marketingPool);
}

/**
 * 导航到体验课安排
 */
export async function navigateToExperienceSchedule(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.experienceSchedule);
}

/**
 * 导航到成单信息
 */
export async function navigateToOrderInfo(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.orderInfo);
}

/**
 * 导航到续费管理
 */
export async function navigateToRenewalStudents(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.renewalStudents);
}

/**
 * 导航到流失学员
 */
export async function navigateToLostStudents(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.lostStudents);
}

/**
 * 导航到低出勤学员
 */
export async function navigateToLowAttendanceStudents(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.continuousLeaveStudents);
}

/**
 * 导航到蜜月期客户
 */
export async function navigateToHoneymoonAttendance(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.honeymoonAttendance);
}

/**
 * 导航到课消收入
 */
export async function navigateToConsumptionAndRevenue(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.consumptionAndRevenue);
}

/**
 * 导航到现金流中心
 */
export async function navigateToCashflowSummary(page: Page): Promise<void> {
  await navigateTo(page, PAGE_PATHS.cashflowSummary);
}

// ============================================================
// 认证导航
// ============================================================

/**
 * 登录并导航到指定页面
 */
export async function loginAndNavigateTo(
  page: Page,
  userType: TestUserType,
  targetPath: string
): Promise<void> {
  const user = TEST_USERS[userType];

  // 先导航到登录页
  await navigateToLogin(page);

  // 填写登录信息
  await page.fill('[data-testid="email-input"]', user.email);
  await page.fill('[data-testid="password-input"]', user.password);

  // 点击登录按钮
  await page.click('[data-testid="login-button"]');

  // 等待登录成功
  await page.waitForURL(/\/(dashboard|organizations|classes)/, {
    timeout: CONSTANTS.WAIT_TIMES.apiResponse,
  });

  // 导航到目标页面
  if (targetPath !== PAGE_PATHS.login) {
    await navigateTo(page, targetPath);
  }
}

/**
 * 快速登录（使用预设用户）
 */
export async function quickLogin(
  page: Page,
  userType: TestUserType = 'admin'
): Promise<void> {
  await loginAndNavigateTo(page, userType, PAGE_PATHS.dashboard);
}

/**
 * 登出
 */
export async function logout(page: Page): Promise<void> {
  // 点击用户菜单
  await page.click('[data-testid="user-menu-button"]');

  // 点击登出按钮
  await page.click('[data-testid="logout-button"]');

  // 等待重定向到登录页
  await page.waitForURL(PAGE_PATHS.login, {
    timeout: CONSTANTS.WAIT_TIMES.apiResponse,
  });
}

// ============================================================
// Modal/Dialog 导航
// ============================================================

/**
 * 打开详情 Modal
 */
export async function openDetailModal(
  page: Page,
  listSelector: string,
  itemIndex: number
): Promise<void> {
  const item = page.locator(listSelector).locator('[data-testid="list-item"]').nth(itemIndex);
  await item.click('[data-testid="detail-button"]');

  await page.waitForSelector('[role="dialog"]', { state: 'visible' });
}

/**
 * 打开编辑 Modal
 */
export async function openEditModal(
  page: Page,
  listSelector: string,
  itemIndex: number
): Promise<void> {
  const item = page.locator(listSelector).locator('[data-testid="list-item"]').nth(itemIndex);
  await item.click('[data-testid="edit-button"]');

  await page.waitForSelector('[role="dialog"]', { state: 'visible' });
}

/**
 * 打开新增 Modal
 */
export async function openCreateModal(page: Page, createButtonSelector?: string): Promise<void> {
  const selector = createButtonSelector || '[data-testid="create-button"]';
  await page.click(selector);

  await page.waitForSelector('[role="dialog"]', { state: 'visible' });
}

// ============================================================
// Tab 切换
// ============================================================

/**
 * 切换到指定 Tab
 */
export async function switchTab(page: Page, tabText: string): Promise<void> {
  const tab = page.locator(`[role="tab"]:has-text("${tabText}")`);
  await tab.click();

  // 等待内容加载
  await page.waitForTimeout(CONSTANTS.WAIT_TIMES.short);
}

/**
 * 获取当前激活的 Tab
 */
export async function getActiveTab(page: Page): Promise<string | null> {
  const activeTab = page.locator('[role="tab"][aria-selected="true"]');
  if (!(await activeTab.isVisible())) {
    return null;
  }
  return await activeTab.textContent();
}

// ============================================================
// 面包屑导航
// ============================================================

/**
 * 通过面包屑导航
 */
export async function navigateViaBreadcrumb(
  page: Page,
  breadcrumbText: string
): Promise<void> {
  const breadcrumb = page.locator(`[data-testid="breadcrumb"] a:has-text("${breadcrumbText}")`);
  await breadcrumb.click();

  await page.waitForLoadState('networkidle');
}

/**
 * 获取面包屑路径
 */
export async function getBreadcrumbPath(page: Page): Promise<string[]> {
  const breadcrumbs = await page
    .locator('[data-testid="breadcrumb"] a')
    .allTextContents();

  return breadcrumbs;
}

// ============================================================
// 分页导航
// ============================================================

/**
 * 下一页
 */
export async function goToNextPage(page: Page): Promise<void> {
  await page.click('[data-testid="next-page-button"]');
  await page.waitForLoadState('networkidle');
}

/**
 * 上一页
 */
export async function goToPreviousPage(page: Page): Promise<void> {
  await page.click('[data-testid="prev-page-button"]');
  await page.waitForLoadState('networkidle');
}

/**
 * 跳转到指定页
 */
export async function goToPage(page: Page, pageNumber: number): Promise<void> {
  await page.fill('[data-testid="page-input"]', String(pageNumber));
  await page.press('[data-testid="page-input"]', 'Enter');

  await page.waitForLoadState('networkidle');
}

/**
 * 获取当前页码
 */
export async function getCurrentPage(page: Page): Promise<number> {
  const pageText = await page.locator('[data-testid="current-page"]').textContent();
  return parseInt(pageText || '1', 10);
}

/**
 * 获取总页数
 */
export async function getTotalPages(page: Page): Promise<number> {
  const totalText = await page.locator('[data-testid="total-pages"]').textContent();
  return parseInt(totalText || '1', 10);
}

// ============================================================
// 筛选和排序
// ============================================================

/**
 * 打开筛选面板
 */
export async function openFilterPanel(page: Page): Promise<void> {
  const filterButton = page.locator('[data-testid="filter-button"]');
  await filterButton.click();

  await page.waitForSelector('[data-testid="filter-panel"]', { state: 'visible' });
}

/**
 * 应用筛选
 */
export async function applyFilter(page: Page): Promise<void> {
  await page.click('[data-testid="apply-filter-button"]');
  await page.waitForLoadState('networkidle');
}

/**
 * 清除筛选
 */
export async function clearFilter(page: Page): Promise<void> {
  await page.click('[data-testid="clear-filter-button"]');
  await page.waitForLoadState('networkidle');
}

/**
 * 切换排序
 */
export async function toggleSort(page: Page, columnName: string): Promise<void> {
  const sortButton = page.locator(`th:has-text("${columnName}") [data-testid="sort-button"]`);
  await sortButton.click();

  await page.waitForLoadState('networkidle');
}

// ============================================================
// URL 参数操作
// ============================================================

/**
 * 获取 URL 参数
 */
export function getUrlParam(page: Page, paramName: string): string | null {
  const url = new URL(page.url());
  return url.searchParams.get(paramName);
}

/**
 * 设置 URL 参数
 */
export async function setUrlParam(
  page: Page,
  paramName: string,
  paramValue: string
): Promise<void> {
  const url = new URL(page.url());
  url.searchParams.set(paramName, paramValue);

  await page.goto(url.toString());
  await page.waitForLoadState('networkidle');
}

/**
 * 删除 URL 参数
 */
export async function removeUrlParam(page: Page, paramName: string): Promise<void> {
  const url = new URL(page.url());
  url.searchParams.delete(paramName);

  await page.goto(url.toString());
  await page.waitForLoadState('networkidle');
}

// ============================================================
// 等待条件
// ============================================================

/**
 * 等待页面加载完成
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="page-loaded"]', {
    state: 'attached',
    timeout: CONSTANTS.WAIT_TIMES.pageLoad,
  });
}

/**
 * 等待数据加载
 */
export async function waitForDataLoad(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="data-loading"]', {
    state: 'hidden',
    timeout: CONSTANTS.WAIT_TIMES.apiResponse,
  });
}

/**
 * 等待搜索结果
 */
export async function waitForSearchResults(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="search-results"]', {
    state: 'visible',
    timeout: CONSTANTS.WAIT_TIMES.apiResponse,
  });
}

// ============================================================
// 导出
// ============================================================

export const NavigationHelpers = {
  // 页面导航
  navigateTo,
  navigateToAndWaitFor,
  navigateViaSidebar,
  goBack,
  refresh,

  // 特定页面导航
  navigateToLogin,
  navigateToDashboard,
  navigateToClasses,
  navigateToWeeklySchedule,
  navigateToClassAttendance,
  navigateToStudents,
  navigateToMarketingPool,
  navigateToExperienceSchedule,
  navigateToOrderInfo,
  navigateToRenewalStudents,
  navigateToLostStudents,
  navigateToLowAttendanceStudents,
  navigateToHoneymoonAttendance,
  navigateToConsumptionAndRevenue,
  navigateToCashflowSummary,

  // 认证导航
  loginAndNavigateTo,
  quickLogin,
  logout,

  // Modal 导航
  openDetailModal,
  openEditModal,
  openCreateModal,

  // Tab 切换
  switchTab,
  getActiveTab,

  // 面包屑导航
  navigateViaBreadcrumb,
  getBreadcrumbPath,

  // 分页导航
  goToNextPage,
  goToPreviousPage,
  goToPage,
  getCurrentPage,
  getTotalPages,

  // 筛选和排序
  openFilterPanel,
  applyFilter,
  clearFilter,
  toggleSort,

  // URL 参数
  getUrlParam,
  setUrlParam,
  removeUrlParam,

  // 等待条件
  waitForPageLoad,
  waitForDataLoad,
  waitForSearchResults,
};
