import { test, expect, type Page } from '@playwright/test';

const parent = {
  id: 'parent-fixture',
  name: '家长',
  role: 'parent',
  email: 'parent@fixture.test',
  organizationId: 'fixture-org',
  campusId: 'fixture-scope',
};
const schoolClass = { id: 'art-class', name: '创意美术一班', code: 'MS201', courseType: '美术' };
const children = [
  { id: 'child-a', name: '小林', enrollments: [{ class: schoolClass }] },
  { id: 'child-b', name: '小周', enrollments: [] },
];
const statistics = { present: 21, late: 0, absent: 0, leave: 0, attendanceRate: 100 };
const paymentSummary = { totalAmount: 1428, paymentByType: { tuition: 1428 } };
const attendance = (i: number) => ({
  id: 'attendance-' + i,
  status: 'present',
  checkInTime: '2026-11-06T09:00:00+08:00',
  class: schoolClass,
  schedule: {
    startTime: '2026-11-05T10:00:00+08:00',
    endTime: '2026-11-05T11:00:00+08:00',
    classroom: '美术教室',
  },
});
const payment = (i: number) => ({
  id: 'payment-' + i,
  amount: '68.00',
  paidAt: '2026-11-06',
  paymentType: 'tuition',
  paymentMethod: 'cash',
  enrollment: { class: schoolClass },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (user) =>
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { token: 'fixture-token', user, isAuthenticated: true }, version: 0 })
      ),
    parent
  );
  // Intercept every API request. Fixtures never mutate the live database or call a provider.
  await page.route('**/api/**', async (route) => {
    expect(route.request().method()).toBe('GET');
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: {
        success: true,
        data: path === '/api/auth/me' ? parent : path === '/api/parent/students' ? children : [],
      },
    });
  });
});
function noPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return () => expect(errors).toEqual([]);
}

for (const kind of ['attendances', 'payments'] as const) {
  test(kind + ' reads nested rows and statistics, and fetches server page two', async ({ page }) => {
    const verifyErrors = noPageErrors(page),
      requested: string[] = [];
    await page.route('**/api/parent/' + kind + '/*', async (route) => {
      const second = new URL(route.request().url()).searchParams.get('page') === '2';
      requested.push(new URL(route.request().url()).searchParams.get('page') || '');
      const row = kind === 'attendances' ? attendance : payment;
      await route.fulfill({
        json: {
          success: true,
          data: {
            data: second ? [row(21)] : Array.from({ length: 20 }, (_, i) => row(i)),
            pagination: { page: second ? 2 : 1, pageSize: 20, total: 21 },
            stats: statistics,
            summary: paymentSummary,
          },
        },
      });
    });
    await page.goto('/student/' + kind);
    await expect(page.getByText('共 21 条记录', { exact: true })).toBeVisible();
    await expect(page.locator('tbody tr[data-row-key]')).toHaveCount(20);
    if (kind === 'attendances') {
      await expect(page.locator('tbody').getByText('2026-11-05', { exact: true }).first()).toBeVisible();
      await expect(page.locator('tbody').getByText('2026-11-06', { exact: true })).toHaveCount(0);
      await expect(page.locator('.ant-statistic').filter({ hasText: '出勤率' })).toContainText('100.0%');
    } else
      await expect(page.locator('.ant-statistic').filter({ hasText: '总缴费金额' })).toContainText(
        '1,428.00'
      );
    await page.locator('.ant-pagination-item-2').click();
    await expect(page.locator('tbody tr[data-row-key]')).toHaveCount(1);
    await expect(
      page.locator('tr[data-row-key="' + (kind === 'attendances' ? 'attendance-21' : 'payment-21') + '"]')
    ).toBeVisible();
    expect(requested).toContain('2');
    verifyErrors();
  });
}

test('empty nested rows do not crash and request errors support retry', async ({ page }) => {
  const verifyErrors = noPageErrors(page);
  let unavailable = true;
  await page.route('**/api/parent/payments/*', async (route) => {
    if (unavailable)
      return route.fulfill({ status: 503, json: { success: false, error: { message: '服务暂不可用' } } });
    await route.fulfill({
      json: {
        success: true,
        data: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0 },
          summary: { totalAmount: 0, paymentByType: {} },
        },
      },
    });
  });
  await page.goto('/student/payments');
  await expect(page.getByRole('alert')).toContainText('服务暂不可用');
  await expect(page.getByText('记录加载失败，请重试', { exact: true })).toBeVisible();
  unavailable = false;
  await page.getByRole('button', { name: /^重\s*试$/ }).click();
  await expect(page.getByText('所选时间内暂无缴费记录', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.route('**/api/parent/attendances/*', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0 },
          stats: { present: 0, late: 0, absent: 0, leave: 0, attendanceRate: null },
        },
      },
    })
  );
  await page.goto('/student/attendances');
  await expect(page.getByText('所选时间内暂无出勤记录', { exact: true })).toBeVisible();
  const rate = page.locator('.ant-statistic').filter({ hasText: '出勤率' });
  await expect(rate).toContainText('—');
  await expect(rate).not.toContainText('%');
  verifyErrors();
});

test('a delayed response for the previous child cannot overwrite the selected child', async ({ page }) => {
  const verifyErrors = noPageErrors(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/parent/payments/*', async (route) => {
    const oldChild = new URL(route.request().url()).pathname.endsWith('/child-a');
    if (oldChild) await hold;
    await route.fulfill({
      json: {
        success: true,
        data: {
          data: [{ ...payment(1), id: oldChild ? 'old-child' : 'current-child' }],
          pagination: { page: 1, pageSize: 20, total: 1 },
          summary: { totalAmount: oldChild ? 111 : 222, paymentByType: {} },
        },
      },
    });
  });
  await page.goto('/student/payments');
  await page.locator('.ant-select[aria-label="选择学员"]').click();
  await page.getByTitle('小周', { exact: true }).click();
  await expect(page.locator('tr[data-row-key="current-child"]')).toBeVisible();
  const oldFinished = page.waitForResponse((response) => response.url().includes('/parent/payments/child-a'));
  release();
  await oldFinished;
  await expect(page.locator('tr[data-row-key="old-child"]')).toHaveCount(0);
  await expect(page.locator('.ant-statistic').filter({ hasText: '总缴费金额' })).toContainText('222.00');
  verifyErrors();
});

test('enrolled class is visible before lessons are published and schedules use server pagination', async ({
  page,
}) => {
  const verifyErrors = noPageErrors(page);
  let published = false;
  await page.route('**/api/parent/schedules/*', async (route) => {
    const second = new URL(route.request().url()).searchParams.get('page') === '2';
    const lesson = (i: number) => ({
      id: 'lesson-' + i,
      status: 'scheduled',
      startTime: '2026-11-07T10:00:00+08:00',
      endTime: '2026-11-07T11:00:00+08:00',
      class: schoolClass,
      teacher: { name: '林老师' },
      classroom: '美术教室',
    });
    await route.fulfill({
      json: {
        success: true,
        data: published ? (second ? [lesson(21)] : Array.from({ length: 20 }, (_, i) => lesson(i))) : [],
        pagination: { page: second ? 2 : 1, pageSize: 20, total: published ? 21 : 0 },
      },
    });
  });
  await page.goto('/student/schedules');
  await expect(page.getByText('已加入：创意美术一班', { exact: true })).toBeVisible();
  await expect(page.getByText('所选时间内暂无排课，请联系老师确认上课时间', { exact: true })).toBeVisible();
  published = true;
  await page.reload();
  await expect(page.getByText('共 21 节课', { exact: true })).toBeVisible();
  await expect(page.locator('tbody').getByText('林老师', { exact: true }).first()).toBeVisible();
  await page.locator('.ant-pagination-item-2').click();
  await expect(page.locator('tr[data-row-key="lesson-21"]')).toBeVisible();
  verifyErrors();
});
