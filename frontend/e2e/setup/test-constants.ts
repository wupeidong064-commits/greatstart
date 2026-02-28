/**
 * E2E 测试常量定义
 *
 * 包含测试账号、测试数据、URL 等常量
 */

// ============================================================
// 测试账号
// ============================================================

export const TEST_USERS = {
  admin: {
    email: 'test-admin@buzzer.com',
    password: 'Test123456',
    name: '测试管理员',
    role: 'admin',
  },
  manager: {
    email: 'e2e-manager@test.com',
    password: 'test123',
    name: 'E2E测试管理者',
    role: 'manager',
  },
  coach1: {
    email: 'e2e-coach1@test.com',
    password: 'test123',
    name: 'E2E张教练',
    role: 'coach',
  },
  coach2: {
    email: 'e2e-coach2@test.com',
    password: 'test123',
    name: 'E2E李教练',
    role: 'coach',
  },
  coach3: {
    email: 'e2e-coach3@test.com',
    password: 'test123',
    name: 'E2E王教练',
    role: 'coach',
  },
  sales1: {
    email: 'e2e-sales1@test.com',
    password: 'test123',
    name: 'E2E赵销售',
    role: 'sales',
  },
  sales2: {
    email: 'e2e-sales2@test.com',
    password: 'test123',
    name: 'E2E钱销售',
    role: 'sales',
  },
} as const;

export type TestUserType = keyof typeof TEST_USERS;

// ============================================================
// 测试数据前缀
// ============================================================

export const TEST_PREFIX = {
  org: 'e2e-org-',
  campus: 'e2e-campus-',
  user: 'e2e-',
  class: 'e2e-class-',
  student: 'e2e-student-',
  lead: 'e2e-lead-',
  experience: 'e2e-exp-',
  conversion: 'e2e-conv-',
  enrollment: 'e2e-enroll-',
  schedule: 'e2e-schedule-',
  attendance: 'e2e-attendance-',
} as const;

// ============================================================
// 测试数据量
// ============================================================

export const TEST_DATA_COUNTS = {
  classes: 42,
  students: 120,
  activeStudents: 105,
  inactiveStudents: 15,
  unassignedStudents: 10,
  lowAttendanceStudents: 30,
  continuousLeaveStudents: 10,
  honeymoonStudents: 30,
  leads: 50,
  experienceLessons: 25,
  conversions: 12,
  renewalStudents: 30,
} as const;

// ============================================================
// 页面路径
// ============================================================

export const PAGE_PATHS = {
  // 认证
  login: '/login',

  // 核心业务
  classes: '/classes',
  weeklySchedule: '/weekly-schedule',
  classAttendance: '/class-attendance',
  students: '/students',
  schedules: '/schedules',

  // 销售转化
  marketingPool: '/cashflow/marketing',
  experienceSchedule: '/cashflow/experience-schedule',
  orderInfo: '/cashflow/order-info',

  // 学员管理
  renewalStudents: '/students/renewal',
  lostStudents: '/students/lost',
  continuousLeaveStudents: '/students/continuous-leave',
  honeymoonAttendance: '/students/honeymoon',

  // 财务统计
  consumptionAndRevenue: '/teachers/consumption',
  cashflowSummary: '/cashflow/summary',

  // 系统管理
  organizations: '/organizations',
  users: '/users',
  teachers: '/teachers',

  // 仪表盘
  dashboard: '/dashboard',
  statistics: '/statistics',
} as const;

// ============================================================
// API 端点
// ============================================================

export const API_ENDPOINTS = {
  // 认证
  login: '/api/auth/login',
  register: '/api/auth/register',

  // 核心业务
  classes: '/api/classes',
  students: '/api/students',
  schedules: '/api/schedules',
  attendances: '/api/attendances',
  enrollments: '/api/enrollments',

  // 销售转化
  leads: '/api/leads',
  experienceLessons: '/api/experience-lessons',
  conversions: '/api/conversions',

  // 统计
  statistics: '/api/statistics',
  honeymoon: '/api/honeymoon',
  cashflowSummary: '/api/cashflow-summary',
} as const;

// ============================================================
// 角色权限
// ============================================================

export const ROLE_PERMISSIONS = {
  admin: {
    canAccessAll: true,
    canManageUsers: true,
    canManageOrganizations: true,
  },
  manager: {
    canAccessAll: true,
    canManageUsers: false,
    canManageOrganizations: false,
  },
  coach: {
    canAccessAll: false,
    canViewOwnClassesOnly: true,
    canViewOwnStudentsOnly: true,
  },
  sales: {
    canAccessAll: false,
    canViewOwnLeadsOnly: true,
    canCreateConversions: true,
  },
} as const;

// ============================================================
// 业务规则
// ============================================================

export const BUSINESS_RULES = {
  // 划课限制
  deduction: {
    sameDayOnly: true,  // 只能当天划课
    nonAdminOncePerDay: true,  // 非管理员每天只能划一次课
  },

  // 蜜月期
  honeymoon: {
    days: 30,  // 30天
  },

  // 低出勤阈值
  lowAttendance: {
    threshold: 0.6,  // 60%
  },

  // 待续费课时阈值
  renewal: {
    threshold: 10,  // 10节课
  },

  // 班级容量
  classCapacity: {
    default: 10,
  },
} as const;

// ============================================================
// 等待时间
// ============================================================

export const WAIT_TIMES = {
  short: 100,
  medium: 500,
  long: 2000,
  pageLoad: 3000,
  apiResponse: 1000,
} as const;

// ============================================================
// 筛选条件
// ============================================================

export const FILTER_OPTIONS = {
  status: {
    active: 'active',
    inactive: 'inactive',
    pending: 'pending',
    completed: 'completed',
    cancelled: 'cancelled',
  },
  courseType: {
    elite: '精英班',
    preschool: '幼儿班',
  },
  enrollmentStatus: {
    new: '新签',
    renewal: '续费',
  },
} as const;

// ============================================================
// 测试数据验证规则
// ============================================================

export const VALIDATION_RULES = {
  // 班级验证
  class: {
    minCapacity: 1,
    maxCapacity: 30,
    nameRequired: true,
    codeRequired: true,
  },

  // 学员验证
  student: {
    nameRequired: true,
    phoneRequired: false,
    ageRange: { min: 1, max: 100 },
  },

  // 成单验证
  conversion: {
    amountMin: 0,
    lessonsMin: 1,
    paymentStatusRequired: true,
  },
} as const;

// ============================================================
// 错误消息
// ============================================================

export const ERROR_MESSAGES = {
  // 认证错误
  AUTH_REQUIRED: '请先登录',
  INVALID_CREDENTIALS: '邮箱或密码错误',

  // 权限错误
  FORBIDDEN: '无权访问',
  ADMIN_ONLY: '仅管理员可操作',

  // 业务规则错误
  NOT_TODAY_SCHEDULE: '排课划课只能在当天进行',
  ALREADY_DEDUCTED: '今天已划过此班级的课',
  INSUFFICIENT_LESSONS: '剩余课时不足',

  // 数据验证错误
  INVALID_EMAIL: '邮箱格式不正确',
  INVALID_PHONE: '手机号格式不正确',
  REQUIRED_FIELD: '此字段为必填项',
} as const;

// ============================================================
// 成功消息
// ============================================================

export const SUCCESS_MESSAGES = {
  LOGIN: '登录成功',
  CREATE_SUCCESS: '创建成功',
  UPDATE_SUCCESS: '更新成功',
  DELETE_SUCCESS: '删除成功',
  DEDUCTION_SUCCESS: '划课成功',
} as const;

// ============================================================
// 测试标签
// ============================================================

export const TEST_TAGS = {
  SMOKE: '@smoke',
  REGRESSION: '@regression',
  INTEGRATION: '@integration',
  SALES: '@sales',
  CLASS: '@class',
  ATTENDANCE: '@attendance',
  STUDENT: '@student',
  FINANCIAL: '@financial',
} as const;

// ============================================================
// 导出所有
// ============================================================

export const CONSTANTS = {
  TEST_USERS,
  TEST_PREFIX,
  TEST_DATA_COUNTS,
  PAGE_PATHS,
  API_ENDPOINTS,
  ROLE_PERMISSIONS,
  BUSINESS_RULES,
  WAIT_TIMES,
  FILTER_OPTIONS,
  VALIDATION_RULES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  TEST_TAGS,
} as const;
