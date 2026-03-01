/**
 * 批量导入数据验证器
 */

// 手机号正则（中国大陆）
const PHONE_REGEX = /^1[3-9]\d{9}$/;

// 邮箱正则
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 日期正则 YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface StudentImportRow {
  row: number;
  name?: string;
  gender?: string;
  birthDate?: string;
  phone?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  classCode?: string;
  cardOpenDate?: string;       // 开卡时间
  purchasedLessons?: string;   // 已购课时
  consumedLessons?: string;    // 消耗课时
  remainingLessons?: string;   // 剩余课时
  totalPayment?: string;       // 缴费金额
  salesName?: string;          // 销售姓名
  lastClassDate?: string;      // 最后上课日期
  notes?: string;
}

export interface ClassImportRow {
  row: number;
  name?: string;
  code?: string;
  courseType?: string;
  level?: string;
  capacity?: string;
  teacherName?: string;
  status?: string;
}

// 鱼池（线索）导入行
export interface LeadImportRow {
  row: number;
  customerName?: string;   // 客户姓名
  age?: string;            // 年龄
  contact?: string;        // 联系方式
  notes?: string;          // 备注
  lastContactAt?: string;  // 最近联系时间
  assigneeName?: string;   // 负责人姓名
}

// 体验课导入行
export interface ExperienceImportRow {
  row: number;
  studentName?: string;        // 学员姓名
  age?: string;                // 年龄
  contact?: string;            // 联系方式
  source?: string;             // 来源
  className?: string;          // 班级名称
  scheduleDate?: string;       // 预约日期
  teachingTeacherName?: string; // 授课教练
  assigneeName?: string;       // 负责人
  status?: string;             // 状态
  notes?: string;              // 备注
}

/**
 * 验证学员导入数据
 */
export function validateStudentRow(row: StudentImportRow): ValidationResult {
  const errors: string[] = [];

  // 必填字段：姓名
  if (!row.name || row.name.trim() === '') {
    errors.push('学员姓名不能为空');
  } else if (row.name.length > 50) {
    errors.push('学员姓名不能超过50个字符');
  }

  // 性别验证
  if (row.gender && !['M', 'F', '男', '女'].includes(row.gender.toUpperCase())) {
    errors.push('性别必须是 M（男）或 F（女）');
  }

  // 出生日期验证
  if (row.birthDate) {
    if (!DATE_REGEX.test(row.birthDate)) {
      errors.push('出生日期格式错误，应为 YYYY-MM-DD');
    } else {
      const date = new Date(row.birthDate);
      if (isNaN(date.getTime())) {
        errors.push('出生日期无效');
      } else if (date > new Date()) {
        errors.push('出生日期不能晚于今天');
      }
    }
  }

  // 联系电话验证
  if (row.phone && !PHONE_REGEX.test(row.phone)) {
    errors.push('联系电话格式错误');
  }

  // 家长电话验证
  if (row.parentPhone && !PHONE_REGEX.test(row.parentPhone)) {
    errors.push('家长电话格式错误');
  }

  // 家长邮箱验证
  if (row.parentEmail && !EMAIL_REGEX.test(row.parentEmail)) {
    errors.push('家长邮箱格式错误');
  }

  // 开卡时间验证
  if (row.cardOpenDate && !DATE_REGEX.test(row.cardOpenDate)) {
    errors.push('开卡时间格式错误，应为 YYYY-MM-DD');
  }

  // 已购课时验证
  if (row.purchasedLessons) {
    const lessons = parseInt(row.purchasedLessons, 10);
    if (isNaN(lessons) || lessons < 0) {
      errors.push('已购课时必须是非负整数');
    }
  }

  // 消耗课时验证
  if (row.consumedLessons) {
    const lessons = parseInt(row.consumedLessons, 10);
    if (isNaN(lessons) || lessons < 0) {
      errors.push('消耗课时必须是非负整数');
    }
  }

  // 剩余课时验证
  if (row.remainingLessons) {
    const lessons = parseInt(row.remainingLessons, 10);
    if (isNaN(lessons) || lessons < 0) {
      errors.push('剩余课时必须是非负整数');
    }
  }

  // 缴费金额验证
  if (row.totalPayment) {
    const amount = parseFloat(row.totalPayment);
    if (isNaN(amount) || amount < 0) {
      errors.push('缴费金额必须是非负数');
    }
  }

  // 最后上课日期验证
  if (row.lastClassDate && !DATE_REGEX.test(row.lastClassDate)) {
    errors.push('最后上课日期格式错误，应为 YYYY-MM-DD');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 验证班级导入数据
 */
export function validateClassRow(row: ClassImportRow): ValidationResult {
  const errors: string[] = [];

  // 必填字段：班级名称
  if (!row.name || row.name.trim() === '') {
    errors.push('班级名称不能为空');
  }

  // 必填字段：班级编码
  if (!row.code || row.code.trim() === '') {
    errors.push('班级编码不能为空');
  }

  // 必填字段：课程类型
  if (!row.courseType || row.courseType.trim() === '') {
    errors.push('课程类型不能为空');
  }

  // 容量验证
  if (row.capacity) {
    const capacity = parseInt(row.capacity, 10);
    if (isNaN(capacity) || capacity <= 0) {
      errors.push('班级容量必须是正整数');
    }
  }

  // 状态验证
  if (row.status && !['active', 'inactive', 'completed'].includes(row.status.toLowerCase())) {
    errors.push('状态必须是 active、inactive 或 completed');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 规范化学员数据（转换格式、处理默认值）
 */
export function normalizeStudentRow(row: StudentImportRow): Record<string, any> {
  const data: Record<string, any> = {};

  data.name = row.name?.trim();

  // 性别规范化
  if (row.gender) {
    const gender = row.gender.toUpperCase();
    data.gender = (gender === '男' ? 'M' : gender === '女' ? 'F' : gender);
  }

  // 出生日期
  if (row.birthDate && DATE_REGEX.test(row.birthDate)) {
    data.birthDate = row.birthDate;
  }

  // 联系电话
  if (row.phone) {
    data.phone = row.phone.trim();
  }

  // 家长信息
  if (row.parentName) {
    data.parentName = row.parentName.trim();
  }
  if (row.parentPhone) {
    data.parentPhone = row.parentPhone.trim();
  }
  if (row.parentEmail) {
    data.parentEmail = row.parentEmail.trim().toLowerCase();
  }

  // 班级编码
  if (row.classCode) {
    data.classCode = row.classCode.trim();
  }

  // 开卡时间
  if (row.cardOpenDate && DATE_REGEX.test(row.cardOpenDate)) {
    data.cardOpenDate = row.cardOpenDate;
  }

  // 已购课时
  if (row.purchasedLessons) {
    const lessons = parseInt(row.purchasedLessons, 10);
    if (!isNaN(lessons) && lessons >= 0) {
      data.purchasedLessons = lessons;
    }
  }

  // 消耗课时
  if (row.consumedLessons) {
    const lessons = parseInt(row.consumedLessons, 10);
    if (!isNaN(lessons) && lessons >= 0) {
      data.consumedLessons = lessons;
    }
  }

  // 剩余课时
  if (row.remainingLessons) {
    const lessons = parseInt(row.remainingLessons, 10);
    if (!isNaN(lessons) && lessons >= 0) {
      data.remainingLessons = lessons;
    }
  }

  // 缴费金额
  if (row.totalPayment) {
    const amount = parseFloat(row.totalPayment);
    if (!isNaN(amount) && amount >= 0) {
      data.totalPayment = amount;
    }
  }

  // 销售姓名
  if (row.salesName) {
    data.salesName = row.salesName.trim();
  }

  // 最后上课日期
  if (row.lastClassDate && DATE_REGEX.test(row.lastClassDate)) {
    data.lastClassDate = row.lastClassDate;
  }

  // 备注
  if (row.notes) {
    data.notes = row.notes.trim();
  }

  return data;
}

/**
 * 规范化班级数据（转换格式、处理默认值）
 */
export function normalizeClassRow(row: ClassImportRow): Record<string, any> {
  const data: Record<string, any> = {};

  data.name = row.name?.trim();
  data.code = row.code?.trim();
  data.courseType = row.courseType?.trim();

  // 班级水平
  if (row.level) {
    data.level = row.level.trim();
  }

  // 容量
  if (row.capacity) {
    const capacity = parseInt(row.capacity, 10);
    if (!isNaN(capacity) && capacity > 0) {
      data.capacity = capacity;
    }
  } else {
    data.capacity = 20; // 默认容量
  }

  // 教练姓名
  if (row.teacherName) {
    data.teacherName = row.teacherName.trim();
  }

  // 状态规范化
  if (row.status) {
    data.status = row.status.toLowerCase();
  } else {
    data.status = 'active'; // 默认状态
  }

  return data;
}

/**
 * Excel 列名映射（中文 -> 英文字段名）
 */
export const STUDENT_COLUMN_MAPPING: Record<string, string> = {
  '学员姓名': 'name',
  '姓名': 'name',
  '性别': 'gender',
  '出生日期': 'birthDate',
  '生日': 'birthDate',
  '联系电话': 'phone',
  '手机号': 'phone',
  '家长姓名': 'parentName',
  '家长电话': 'parentPhone',
  '家长手机': 'parentPhone',
  '家长邮箱': 'parentEmail',
  '所属班级编码': 'classCode',
  '班级编码': 'classCode',
  '开卡时间': 'cardOpenDate',
  '开卡日期': 'cardOpenDate',
  '已购课时': 'purchasedLessons',
  '购买课时': 'purchasedLessons',
  '消耗课时': 'consumedLessons',
  '已消课时': 'consumedLessons',
  '剩余课时': 'remainingLessons',
  '课时': 'remainingLessons',
  '缴费金额': 'totalPayment',
  '累计缴费': 'totalPayment',
  '销售': 'salesName',
  '销售姓名': 'salesName',
  '最后上课日期': 'lastClassDate',
  '最后上课': 'lastClassDate',
  '备注': 'notes',
};

export const CLASS_COLUMN_MAPPING: Record<string, string> = {
  '班级名称': 'name',
  '班级编码': 'code',
  '编码': 'code',
  '课程类型': 'courseType',
  '类型': 'courseType',
  '班级水平': 'level',
  '水平': 'level',
  '容量': 'capacity',
  '最大容量': 'capacity',
  '负责教练': 'teacherName',
  '教练': 'teacherName',
  '状态': 'status',
};

// 鱼池（线索）列名映射
export const LEAD_COLUMN_MAPPING: Record<string, string> = {
  '客户姓名': 'customerName',
  '姓名': 'customerName',
  '年龄': 'age',
  '联系方式': 'contact',
  '电话': 'contact',
  '手机号': 'contact',
  '备注': 'notes',
  '最近联系时间': 'lastContactAt',
  '最近联系': 'lastContactAt',
  '负责人': 'assigneeName',
  '销售': 'assigneeName',
};

// 体验课列名映射
export const EXPERIENCE_COLUMN_MAPPING: Record<string, string> = {
  '学员姓名': 'studentName',
  '姓名': 'studentName',
  '年龄': 'age',
  '联系方式': 'contact',
  '电话': 'contact',
  '手机号': 'contact',
  '来源': 'source',
  '班级名称': 'className',
  '班级': 'className',
  '预约日期': 'scheduleDate',
  '上课日期': 'scheduleDate',
  '日期': 'scheduleDate',
  '授课教练': 'teachingTeacherName',
  '教练': 'teachingTeacherName',
  '老师': 'teachingTeacherName',
  '负责人': 'assigneeName',
  '销售': 'assigneeName',
  '状态': 'status',
  '备注': 'notes',
};

/**
 * 验证鱼池（线索）导入数据
 */
export function validateLeadRow(row: LeadImportRow): ValidationResult {
  const errors: string[] = [];

  // 必填字段：客户姓名
  if (!row.customerName || row.customerName.trim() === '') {
    errors.push('客户姓名不能为空');
  }

  // 必填字段：联系方式
  if (!row.contact || row.contact.trim() === '') {
    errors.push('联系方式不能为空');
  } else if (!PHONE_REGEX.test(row.contact)) {
    errors.push('联系方式格式错误');
  }

  // 年龄验证
  if (row.age) {
    const age = parseInt(row.age, 10);
    if (isNaN(age) || age < 0 || age > 150) {
      errors.push('年龄必须是0-150之间的整数');
    }
  }

  // 最近联系时间验证
  if (row.lastContactAt && !DATE_REGEX.test(row.lastContactAt)) {
    errors.push('最近联系时间格式错误，应为 YYYY-MM-DD');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 验证体验课导入数据
 */
export function validateExperienceRow(row: ExperienceImportRow): ValidationResult {
  const errors: string[] = [];

  // 必填字段：学员姓名
  if (!row.studentName || row.studentName.trim() === '') {
    errors.push('学员姓名不能为空');
  }

  // 必填字段：联系方式
  if (!row.contact || row.contact.trim() === '') {
    errors.push('联系方式不能为空');
  } else if (!PHONE_REGEX.test(row.contact)) {
    errors.push('联系方式格式错误');
  }

  // 年龄验证
  if (row.age) {
    const age = parseInt(row.age, 10);
    if (isNaN(age) || age < 0 || age > 150) {
      errors.push('年龄必须是0-150之间的整数');
    }
  }

  // 预约日期验证
  if (row.scheduleDate && !DATE_REGEX.test(row.scheduleDate)) {
    errors.push('预约日期格式错误，应为 YYYY-MM-DD');
  }

  // 状态验证
  if (row.status && !['pending', 'completed', 'no-show', 'cancelled', 'converted'].includes(row.status.toLowerCase())) {
    errors.push('状态必须是 pending、completed、no-show、cancelled 或 converted');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 规范化鱼池（线索）数据
 */
export function normalizeLeadRow(row: LeadImportRow): Record<string, any> {
  const data: Record<string, any> = {};

  data.customerName = row.customerName?.trim();
  data.contact = row.contact?.trim();

  if (row.age) {
    const age = parseInt(row.age, 10);
    if (!isNaN(age) && age >= 0) {
      data.age = age;
    }
  }

  if (row.notes) {
    data.notes = row.notes.trim();
  }

  if (row.lastContactAt && DATE_REGEX.test(row.lastContactAt)) {
    data.lastContactAt = row.lastContactAt;
  }

  if (row.assigneeName) {
    data.assigneeName = row.assigneeName.trim();
  }

  return data;
}

/**
 * 规范化体验课数据
 */
export function normalizeExperienceRow(row: ExperienceImportRow): Record<string, any> {
  const data: Record<string, any> = {};

  data.studentName = row.studentName?.trim();
  data.contact = row.contact?.trim();

  if (row.age) {
    const age = parseInt(row.age, 10);
    if (!isNaN(age) && age >= 0) {
      data.age = age;
    }
  }

  if (row.source) {
    data.source = row.source.trim();
  }

  if (row.className) {
    data.className = row.className.trim();
  }

  if (row.scheduleDate && DATE_REGEX.test(row.scheduleDate)) {
    data.scheduleDate = row.scheduleDate;
  }

  if (row.teachingTeacherName) {
    data.teachingTeacherName = row.teachingTeacherName.trim();
  }

  if (row.assigneeName) {
    data.assigneeName = row.assigneeName.trim();
  }

  if (row.status) {
    data.status = row.status.toLowerCase();
  } else {
    data.status = 'pending';
  }

  if (row.notes) {
    data.notes = row.notes.trim();
  }

  return data;
}

/**
 * 将 Excel 行数据映射到字段名
 */
export function mapRowToFields(
  row: Record<string, any>,
  mapping: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(row)) {
    // 尝试直接匹配
    let fieldName = mapping[key];

    // 如果没有匹配，尝试忽略空格和大小写
    if (!fieldName) {
      const normalizedKey = key.trim();
      for (const [mapKey, mapValue] of Object.entries(mapping)) {
        if (mapKey.trim() === normalizedKey) {
          fieldName = mapValue;
          break;
        }
      }
    }

    if (fieldName && value !== undefined && value !== null && value !== '') {
      result[fieldName] = String(value);
    }
  }

  return result;
}
