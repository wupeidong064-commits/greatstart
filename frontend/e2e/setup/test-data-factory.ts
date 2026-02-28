/**
 * E2E 测试数据工厂
 *
 * 提供创建和管理测试数据的辅助函数
 */

import { CONSTANTS, TEST_PREFIX, TEST_DATA_COUNTS } from './test-constants';

// ============================================================
// 类型定义
// ============================================================

export interface TestStudent {
  id: string;
  name: string;
  status: string;
  enrollmentClassId?: string;
}

export interface TestClass {
  id: string;
  name: string;
  code: string;
  courseType: string;
  teacherId: string;
  capacity: number;
}

export interface TestLead {
  id: string;
  customerName: string;
  contact: string;
  assigneeId: string;
  status: string;
}

// ============================================================
// 数据 ID 生成器
// ============================================================

/**
 * 生成测试数据 ID
 */
export function generateTestId(prefix: string, suffix: string | number): string {
  return `${TEST_PREFIX[prefix as keyof typeof TEST_PREFIX]}${suffix}`;
}

/**
 * 批量生成测试 ID
 */
export function generateTestIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    generateTestId(prefix, String(i + 1).padStart(3, '0'))
  );
}

// ============================================================
// 测试数据查询辅助
// ============================================================

/**
 * 获取所有测试班级 ID
 */
export function getAllTestClassIds(): string[] {
  return generateTestIds('class', TEST_DATA_COUNTS.classes);
}

/**
 * 获取精英班 ID 列表
 */
export function getEliteClassIds(): string[] {
  // 班级命名规则：E2E-{星期}{时间}{类型序号}
  // 类型序号：1=精英班, 2=幼儿班
  return getAllTestClassIds().filter(id => id.endsWith('1'));
}

/**
 * 获取幼儿班 ID 列表
 */
export function getPreschoolClassIds(): string[] {
  return getAllTestClassIds().filter(id => id.endsWith('2'));
}

/**
 * 获取所有测试学员 ID
 */
export function getAllTestStudentIds(): string[] {
  return generateTestIds('student', TEST_DATA_COUNTS.students);
}

/**
 * 获取活跃学员 ID
 */
export function getActiveStudentIds(): string[] {
  return getAllTestStudentIds().slice(0, TEST_DATA_COUNTS.activeStudents);
}

/**
 * 获取流失学员 ID
 */
export function getInactiveStudentIds(): string[] {
  return getAllTestStudentIds().slice(
    TEST_DATA_COUNTS.activeStudents,
    TEST_DATA_COUNTS.activeStudents + TEST_DATA_COUNTS.inactiveStudents
  );
}

/**
 * 获取未排班学员 ID
 */
export function getUnassignedStudentIds(): string[] {
  return getAllTestStudentIds().slice(
    TEST_DATA_COUNTS.activeStudents + TEST_DATA_COUNTS.inactiveStudents
  );
}

/**
 * 获取所有测试线索 ID
 */
export function getAllTestLeadIds(): string[] {
  return generateTestIds('lead', TEST_DATA_COUNTS.leads);
}

/**
 * 获取所有体验课 ID
 */
export function getAllTestExperienceIds(): string[] {
  return generateTestIds('experience', TEST_DATA_COUNTS.experienceLessons);
}

/**
 * 获取已到场体验课 ID（状态为 completed）
 */
export function getCompletedExperienceIds(): string[] {
  // 前20个为到场（completed），后5个为未到场（cancelled）
  return getAllTestExperienceIds().slice(0, 20);
}

/**
 * 获取未到场体验课 ID（状态为 cancelled）
 */
export function getCancelledExperienceIds(): string[] {
  return getAllTestExperienceIds().slice(20);
}

// ============================================================
// 测试数据验证辅助
// ============================================================

/**
 * 验证测试数据是否已准备
 */
export async function verifyTestDataReady(): Promise<{
  ready: boolean;
  details: {
    organization: boolean;
    campus: boolean;
    users: boolean;
    classes: boolean;
    students: boolean;
    leads: boolean;
  };
}> {
  // 这里可以通过 API 调用来验证数据是否存在
  // 暂时返回假设数据已准备
  return {
    ready: true,
    details: {
      organization: true,
      campus: true,
      users: true,
      classes: true,
      students: true,
      leads: true,
    },
  };
}

/**
 * 计算预期出勤率
 */
export function calculateExpectedAttendanceRate(
  totalClasses: number,
  attendedClasses: number
): number {
  if (totalClasses === 0) return 0;
  return Math.round((attendedClasses / totalClasses) * 100);
}

/**
 * 判断是否为低出勤学员
 */
export function isLowAttendanceStudent(
  totalClasses: number,
  attendedClasses: number
): boolean {
  const rate = calculateExpectedAttendanceRate(totalClasses, attendedClasses);
  return rate < CONSTANTS.BUSINESS_RULES.lowAttendance.threshold * 100;
}

/**
 * 判断是否为待续费学员
 */
export function isRenewalStudent(remainingLessons: number): boolean {
  return remainingLessons < CONSTANTS.BUSINESS_RULES.renewal.threshold;
}

/**
 * 判断是否为蜜月期学员
 */
export function isHoneymoonStudent(enrolledDate: Date): boolean {
  const daysSinceEnrollment = Math.floor(
    (Date.now() - enrolledDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceEnrollment <= CONSTANTS.BUSINESS_RULES.honeymoon.days;
}

// ============================================================
// 测试数据清理辅助
// ============================================================

/**
 * 清理测试数据（仅用于独立测试环境）
 */
export async function cleanupTestData(): Promise<void> {
  // 注意：这个函数应该只在独立测试环境中使用
  // 在共用开发数据库中不应该执行

  console.warn('⚠️ 数据清理功能仅在独立测试环境中可用');
  console.warn('⚠️ 共用开发数据库请手动清理或使用特定前缀筛选');
}

/**
 * 获取测试数据统计
 */
export async function getTestDataStats(): Promise<{
  classes: number;
  students: number;
  leads: number;
  experienceLessons: number;
  conversions: number;
}> {
  // 这里可以通过 API 调用来获取实际数据统计
  // 暂时返回预期值
  return {
    classes: TEST_DATA_COUNTS.classes,
    students: TEST_DATA_COUNTS.students,
    leads: TEST_DATA_COUNTS.leads,
    experienceLessons: TEST_DATA_COUNTS.experienceLessons,
    conversions: TEST_DATA_COUNTS.conversions,
  };
}

// ============================================================
// Mock 数据生成器（用于独立测试）
// ============================================================

/**
 * 生成 Mock 学员数据
 */
export function generateMockStudent(overrides: Partial<TestStudent> = {}): TestStudent {
  const id = generateTestId('student', Math.random().toString(36).substring(7));
  return {
    id,
    name: `测试学员${id.substring(-3)}`,
    status: 'active',
    ...overrides,
  };
}

/**
 * 生成 Mock 班级数据
 */
export function generateMockClass(overrides: Partial<TestClass> = {}): TestClass {
  const id = generateTestId('class', Math.random().toString(36).substring(7));
  return {
    id,
    name: `测试班级${id.substring(-3)}`,
    code: `TEST-${id.substring(-3)}`,
    courseType: '精英班',
    teacherId: 'test-teacher-id',
    capacity: 10,
    ...overrides,
  };
}

/**
 * 生成多个 Mock 学员
 */
export function generateMockStudents(count: number): TestStudent[] {
  return Array.from({ length: count }, () => generateMockStudent());
}

/**
 * 生成多个 Mock 班级
 */
export function generateMockClasses(count: number): TestClass[] {
  return Array.from({ length: count }, () => generateMockClass());
}

// ============================================================
// 导出
// ============================================================

export const TestDataFactory = {
  // ID 生成
  generateTestId,
  generateTestIds,

  // 查询
  getAllTestClassIds,
  getEliteClassIds,
  getPreschoolClassIds,
  getAllTestStudentIds,
  getActiveStudentIds,
  getInactiveStudentIds,
  getUnassignedStudentIds,
  getAllTestLeadIds,
  getAllTestExperienceIds,
  getCompletedExperienceIds,
  getCancelledExperienceIds,

  // 验证
  verifyTestDataReady,
  calculateExpectedAttendanceRate,
  isLowAttendanceStudent,
  isRenewalStudent,
  isHoneymoonStudent,

  // 清理
  cleanupTestData,
  getTestDataStats,

  // Mock 生成
  generateMockStudent,
  generateMockClass,
  generateMockStudents,
  generateMockClasses,
};
