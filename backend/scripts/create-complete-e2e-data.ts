/**
 * 完整E2E测试数据创建脚本
 *
 * 满足完整的业务流程测试需求
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const MEMFIRE_URL = process.env.MEMFIRE_URL || '';
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY || '';

const memfireAdmin = createClient(MEMFIRE_URL, MEMFIRE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================
// 数据配置
// ============================================================

const CONFIG = {
  // 班级配置
  classes: {
    total: 42, // 7天 × 3时段 × 2类型
    capacity: 10,
    days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    times: ['10:00', '14:00', '19:00'],
    types: ['精英班', '幼儿班'],
  },
  // 学员配置
  students: {
    total: 120,
    active: 105,
    inactive: 15, // 流失
    lowAttendance: 30, // 低出勤
    continuousLeave: 10, // 连续请假（在低出勤中）
    honeymoon: 30, // 蜜月期
    honeymoonLowAttendance: 10, // 蜜月期且低出勤（可计入低出勤）
    unassigned: 10, // 未排班
    renewalNeeded: 30, // 课时<10待续费
    lostStudentsSick: 10, // 生病流失
    lostStudentsTime: 5, // 时间问题流失
  },
  // 鱼池资源
  leads: {
    total: 50,
  },
  // 体验课
  experienceLessons: {
    total: 25,
    attended: 20,
    noShow: 5,
    converted: 12,
    notConverted: 8,
  },
  // 续费
  renewal: {
    needed: 30,
  },
};

// ============================================================
// 工具函数
// ============================================================

function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ============================================================
// 获取测试基础数据
// ============================================================

async function getTestOrgAndCampus() {
  const { data: org } = await memfireAdmin
    .from('organizations')
    .select('*')
    .ilike('code', 'E2E%')
    .limit(1)
    .single();

  if (!org) throw new Error('E2E测试机构不存在');

  const { data: campus } = await memfireAdmin
    .from('campuses')
    .select('*')
    .ilike('code', 'E2E%')
    .limit(1)
    .single();

  if (!campus) throw new Error('E2E测试校区不存在');

  return { organizationId: org.id, campusId: campus.id };
}

async function getE2EUserIds() {
  const { data: users } = await memfireAdmin
    .from('users')
    .select('*')
    .ilike('email', 'e2e-%@test.com');

  if (!users || users.length === 0) {
    throw new Error('E2E测试用户不存在');
  }

  const userIds: Record<string, string> = {};
  for (const user of users) {
    if (user.email === 'e2e-coach1@test.com') userIds.coach1 = user.id;
    if (user.email === 'e2e-coach2@test.com') userIds.coach2 = user.id;
    if (user.email === 'e2e-coach3@test.com') userIds.coach3 = user.id;
    if (user.email === 'e2e-sales1@test.com') userIds.sales1 = user.id;
    if (user.email === 'e2e-sales2@test.com') userIds.sales2 = user.id;
  }

  console.log('  ✅ 获取到E2E用户ID:', Object.keys(userIds).length, '个');
  return userIds;
}

// ============================================================
// 清理旧数据
// ============================================================

async function cleanOldData() {
  console.log('🧹 清理旧的E2E测试数据...');

  await memfireAdmin.from('leads').delete().ilike('id', 'e2e-%');
  await memfireAdmin.from('experience_lessons').delete().ilike('id', 'e2e-%');
  await memfireAdmin.from('conversions').delete().ilike('id', 'e2e-%');
  await memfireAdmin.from('enrollments').delete().ilike('studentId', 'e2e-%');
  await memfireAdmin.from('schedules').delete().ilike('id', 'e2e-%');
  await memfireAdmin.from('attendances').delete().ilike('id', 'e2e-%');
  await memfireAdmin.from('classes').delete().ilike('code', 'E2E%');
  await memfireAdmin.from('students').delete().ilike('name', 'E2E%');

  console.log('  ✅ 清理完成');
}

// ============================================================
// 创建班级（42个）
// ============================================================

async function createClasses(organizationId: string, campusId: string, coachIds: string[]) {
  console.log('📊 创建班级（42个）...');

  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const timeStarts = ['10:00', '14:00', '19:00'];
  const courseTypes = ['精英班', '幼儿班'];

  let classId = 1;
  for (let day = 0; day < 7; day++) {
    for (let time = 0; time < 3; time++) {
      for (let type = 0; type < 2; type++) {
        const id = `e2e-class-${classId.toString().padStart(3, '0')}`;
        const coachId = coachIds[classId % 3];
        const name = `${courseTypes[type]}-${dayNames[day]}${timeStarts[time]}`;

        const { error } = await memfireAdmin.from('classes').insert({
          id,
          organizationId,
          campusId,
          name,
          code: `E2E${day}${time}${type}`,
          courseType: courseTypes[type],
          capacity: 10,
          teacherId: coachId,
          status: 'active',
          maxCapacity: 100, // 最大开班数设置
        });

        if (error) {
          console.log(`  ⚠️  班级 ${classId} 创建失败: ${error.message}`);
        }
        classId++;
      }
    }
  }

  console.log('  ✅ 班级创建完成（42个）');
  return classId - 1;
}

// ============================================================
// 创建学员（120个）及关联数据
// ============================================================

async function createStudentsAndEnrollments(
  organizationId: string,
  campusId: string,
  classIds: string[],
  coachIds: string[]
) {
  console.log('📊 创建学员及关联数据（120个）...');

  const today = new Date();
  const thirtyDaysAgo = addDays(today, -30);
  const sevenDaysLater = addDays(today, 7);
  const yesterday = addDays(today, -1);

  // 学员索引分配
  const studentCategories = {
    lowAttendance: Array.from({ length: 30 }, (_, i) => i + 1), // 1-30
    continuousLeave: Array.from({ length: 10 }, (_, i) => i + 1), // 1-10 (在低出勤中)
    honeymoon: Array.from({ length: 30 }, (_, i) => i + 21), // 21-50 (蜜月期)
    honeymoonLowAttendance: Array.from({ length: 10 }, (_, i) => i + 21), // 21-30 (可重合)
    unassigned: Array.from({ length: 10 }, (_, i) => i + 51), // 51-60 未排班
    renewalNeeded: Array.from({ length: 30 }, (_, i) => i + 61), // 61-90 课时<10
    inactiveSick: Array.from({ length: 10 }, (_, i) => i + 91), // 91-100 流失-生病
    inactiveTime: Array.from({ length: 5 }, (_, i) => i + 101), // 101-105 流失-时间
    normal: Array.from({ length: 15 }, (_, i) => i + 106), // 106-120 正常
  };

  const enrolledClassIds = classIds.slice(0, 32); // 32个班级有学员

  for (let i = 1; i <= 120; i++) {
    const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;

    // 确定学员状态
    let status = 'active';
    let enrollmentDate = thirtyDaysAgo;
    let remainingLessons = 20;
    let totalLessons = 20;
    let assignedClassId: string | null = null;
    let assignedCoachId: string | null = null;

    // 检查是否流失学员
    if (studentCategories.inactiveSick.includes(i) || studentCategories.inactiveTime.includes(i)) {
      status = 'inactive';
      enrollmentDate = addDays(thirtyDaysAgo, -60);
      remainingLessons = 0;
    } else if (studentCategories.renewalNeeded.includes(i)) {
      remainingLessons = randomInt(1, 9);
      totalLessons = 20;
    } else if (studentCategories.honeymoon.includes(i)) {
      enrollmentDate = addDays(today, -randomInt(1, 15)); // 1-15天前报名
    }

    // 分配班级（未排班学员除外）
    if (!studentCategories.unassigned.includes(i) && status === 'active') {
      const classIndex = (i - 1) % enrolledClassIds.length;
      assignedClassId = enrolledClassIds[classIndex];
      assignedCoachId = coachIds[classIndex % 3];
    }

    const { error: studentError } = await memfireAdmin.from('students').insert({
      id: studentId,
      organizationId,
      campusId,
      name: `E2E学员${i.toString().padStart(3, '0')}`,
      gender: i % 2 === 0 ? '男' : '女',
      phone: `138${Math.random().toString(36).substring(2, 10)}`,
      parentPhone: `138${Math.random().toString(36).substring(2, 10)}`,
      status,
      enrollmentDate: enrollmentDate.toISOString(),
      remainingLessons,
      totalLessons,
    });

    if (studentError) {
      console.log(`  ⚠️  学员 ${i} 创建失败: ${studentError.message}`);
      continue;
    }

    // 创建报名记录（已分配班级的学员）
    if (assignedClassId && status === 'active') {
      await memfireAdmin.from('enrollments').insert({
        id: `e2e-enroll-${i}`,
        studentId,
        classId: assignedClassId,
        organizationId,
        campusId,
        enrollmentDate: enrollmentDate.toISOString(),
        status: 'active',
        enrollmentType: i <= 60 ? 'new' : 'renewal', // 前60个新签，后60个续费
        courseType: 'regular',
        totalLessons,
        remainingLessons,
        lessonPrice: 100,
      });
    }
  }

  console.log('  ✅ 学员创建完成（120个）');

  // 返回学员分类索引
  return studentCategories;
}

// ============================================================
// 创建鱼池资源（50条）
// ============================================================

async function createLeads(organizationId: string, salesIds: string[]) {
  console.log('📊 创建鱼池资源（50条）...');

  for (let i = 1; i <= 50; i++) {
    const leadId = `e2e-lead-${i.toString().padStart(3, '0')}`;
    const assigneeId = salesIds[i % 2];
    const salesNames = ['E2E赵销售', 'E2E钱销售'];
    const assigneeName = salesNames[i % 2];

    // 随机分配教练
    const coachIndex = i % 3;
    const coachIds = ['e2e-coach-001', 'e2e-coach-002', 'e2e-coach-003'];
    const coachNames = ['E2E张教练', 'E2E李教练', 'E2E王教练'];

    const { error } = await memfireAdmin.from('leads').insert({
      id: leadId,
      organizationId,
      assigneeId,
      assigneeName,
      customerName: `E2E线索客户${i.toString().padStart(3, '0')}`,
      age: 5 + (i % 8),
      contact: `139${Math.random().toString(36).substring(2, 10)}`,
      notes: 'E2E测试线索数据',
      preferredCoachId: coachIds[coachIndex],
      preferredCoachName: coachNames[coachIndex],
      status: 'new',
    });

    if (error) {
      console.log(`  ⚠️  线索 ${i} 创建失败: ${error.message}`);
    }
  }

  console.log('  ✅ 鱼池资源创建完成（50条）');
}

// ============================================================
// 创建体验课（25条）
// ============================================================

async function createExperienceLessons(organizationId: string, coachIds: string[], classIds: string[]) {
  console.log('📊 创建体验课（25条）...');

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  // 获取销售ID
  const { data: users } = await memfireAdmin
    .from('users')
    .select('*')
    .ilike('email', 'e2e-sales%@test.com');

  const salesIds = users?.map(u => u.id) || [];

  // 25个体验课：20个到场（12成单，8未成单），5个未到场
  for (let i = 1; i <= 25; i++) {
    const lessonId = `e2e-exp-${i.toString().padStart(3, '0')}`;
    const leadId = `e2e-lead-${i.toString().padStart(3, '0')}`;
    const coachId = coachIds[i % 3];
    const classId = classIds[i % classIds.length];
    const salesId = salesIds[i % salesIds.length];

    // 前20个到场，后5个未到场
    const isAttended = i <= 20;
    // 前12个成单
    const isConverted = i <= 12;

    const lessonDate = isAttended ? yesterday : yesterday;
    const status = isAttended ? (isConverted ? 'converted' : 'completed') : 'no-show';

    const { error } = await memfireAdmin.from('experience_lessons').insert({
      id: lessonId,
      organizationId,
      leadId,
      teachingTeacherId: coachId,
      teachingTeacherName: ['E2E张教练', 'E2E李教练', 'E2E王教练'][i % 3],
      classId,
      assigneeId: salesId,
      assigneeName: ['E2E赵销售', 'E2E钱销售'][i % 2],
      lessonDate: lessonDate.toISOString(),
      timeSlot: '10:00-11:30',
      status,
      notes: `E2E测试体验课 ${i}`,
    });

    // 如果成单，创建成单记录
    if (isConverted) {
      const conversionId = `e2e-conv-${i.toString().padStart(3, '0')}`;
      const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;

      // 先创建成单对应的学员
      await memfireAdmin.from('students').insert({
        id: studentId,
        organizationId,
        campusId,
        name: `E2E成单学员${i.toString().padStart(3, '0')}`,
        gender: i % 2 === 0 ? '男' : '女',
        phone: `137${Math.random().toString(36).substring(2, 10)}`,
        parentPhone: `137${Math.random().toString(36).substring(2, 10)}`,
        status: 'active',
        enrollmentDate: yesterday.toISOString(),
        remainingLessons: 20,
        totalLessons: 20,
      });

      // 创建成单记录
      await memfireAdmin.from('conversions').insert({
        id: conversionId,
        organizationId,
        studentId,
        leadId,
        experienceLessonId: lessonId,
        salesId,
        salesName: ['E2E赵销售', 'E2E钱销售'][i % 2],
        courseType: 'new',
        price: 2000,
        totalLessons: 20,
        paymentStatus: 'paid',
        conversionDate: yesterday.toISOString(),
      });

      // 创建报名记录
      await memfireAdmin.from('enrollments').insert({
        id: `e2e-enroll-conv-${i}`,
        studentId,
        classId,
        organizationId,
        campusId,
        enrollmentDate: yesterday.toISOString(),
        status: 'active',
        enrollmentType: 'new',
        totalLessons: 20,
        remainingLessons: 20,
        lessonPrice: 100,
      });
    }

    if (error) {
      console.log(`  ⚠️  体验课 ${i} 创建失败: ${error.message}`);
    }
  }

  console.log('  ✅ 体验课创建完成（25条：20到场，12成单）');
}

// ============================================================
// 创建排课和出勤数据（用于计算确认收入）
// ============================================================

async function createSchedulesAndAttendances(
  organizationId: string,
  campusId: string,
  classIds: string[],
  studentCategories: any
) {
  console.log('📊 创建排课和出勤数据...');

  const today = new Date();
  const pastWeek = [];

  // 创建过去7天的排课
  for (let day = 6; day >= 0; day--) {
    pastWeek.push(addDays(today, -day));
  }

  // 为每个班级创建排课
  for (const classId of classIds) {
    for (const date of pastWeek) {
      const scheduleId = `e2e-schedule-${classId}-${formatDate(date)}`;
      const dateStr = formatDate(date);

      const { error: scheduleError } = await memfireAdmin.from('schedules').insert({
        id: scheduleId,
        organizationId,
        campusId,
        classId,
        scheduleDate: dateStr,
        timeSlot: '10:00-11:30',
        status: 'completed',
      });

      if (!scheduleError) {
        // 创建出勤记录（模拟不同出勤率）
        const { data: enrollments } = await memfireAdmin
          .from('enrollments')
          .select('studentId')
          .eq('classId', classId)
          .eq('status', 'active');

        const enrolledStudents = enrollments || [];

        for (const enrollment of enrolledStudents) {
          const studentNum = parseInt(enrollment.studentId.split('-')[2]);

          // 根据学员分类决定出勤
          let isAttended = true;
          if (studentCategories.lowAttendance.includes(studentNum)) {
            // 低出勤学员30%出席率
            isAttended = Math.random() < 0.3;
          } else if (studentCategories.continuousLeave.includes(studentNum)) {
            // 连续请假学员不出席
            isAttended = false;
          } else if (studentCategories.honeymoon.includes(studentNum)) {
            // 蜜月期学员，如果是低出勤蜜月期则50%出席
            if (studentCategories.honeymoonLowAttendance.includes(studentNum)) {
              isAttended = Math.random() < 0.5;
            }
          }

          if (Math.random() < 0.1) isAttended = false; // 10%随机缺勤

          const attendanceId = `e2e-att-${enrollment.studentId}-${dateStr}`;

          await memfireAdmin.from('attendances').insert({
            id: attendanceId,
            organizationId,
            campusId,
            studentId: enrollment.studentId,
            classId,
            scheduleId,
            attendanceDate: dateStr,
            status: isAttended ? 'attended' : 'absent',
            lessonType: 'regular',
          });
        }
      }
    }
  }

  console.log('  ✅ 排课和出勤数据创建完成');
}

// ============================================================
// 设置流失学员召回日期
// ============================================================

async function setLostStudentsRecall() {
  console.log('📊 设置流失学员召回日期...');

  const today = new Date();
  const sevenDaysLater = addDays(today, 7);

  // 101-105: 时间问题流失，召回日期临近（7天内）
  for (let i = 101; i <= 105; i++) {
    const recallDate = addDays(today, randomInt(1, 7));
    const { error } = await memfireAdmin
      .from('students')
      .update({
        lostDate: addDays(today, -randomInt(10, 30)).toISOString(),
        recallDate: recallDate.toISOString(),
        lostReason: 'time',
      })
      .eq('id', `e2e-student-${i.toString().padStart(3, '0')}`);

    if (error) console.log(`  ⚠️  流失学员 ${i} 召回日期设置失败`);
  }

  // 91-100: 生病流失，设置召回日期
  for (let i = 91; i <= 100; i++) {
    const recallDate = addDays(today, randomInt(15, 60));
    const { error } = await memfireAdmin
      .from('students')
      .update({
        lostDate: addDays(today, -randomInt(10, 30)).toISOString(),
        recallDate: recallDate.toISOString(),
        lostReason: 'sick',
      })
      .eq('id', `e2e-student-${i.toString().padStart(3, '0')}`);

    if (error) console.log(`  ⚠️  流失学员 ${i} 召回日期设置失败`);
  }

  console.log('  ✅ 流失学员召回日期设置完成');
}

// ============================================================
// 主函数
// ============================================================

async function createCompleteE2EData() {
  console.log('🚀 开始创建完整E2E测试数据...\n');

  const { organizationId, campusId } = await getTestOrgAndCampus();
  const userIds = await getE2EUserIds();

  console.log(`测试机构ID: ${organizationId}`);
  console.log(`测试校区ID: ${campusId}`);
  console.log('');

  // 清理旧数据
  await cleanOldData();

  // 创建班级
  const coachIds = [userIds.coach1, userIds.coach2, userIds.coach3];
  const classCount = await createClasses(organizationId, campusId, coachIds);

  // 获取班级ID
  const { data: classes } = await memfireAdmin
    .from('classes')
    .select('id')
    .ilike('id', 'e2e-class-%');

  const allClassIds = classes?.map(c => c.id) || [];

  // 创建学员及报名
  const studentCategories = await createStudentsAndEnrollments(
    organizationId,
    campusId,
    allClassIds,
    coachIds
  );

  // 创建鱼池资源
  const salesIds = [userIds.sales1, userIds.sales2];
  await createLeads(organizationId, salesIds);

  // 创建体验课和成单
  await createExperienceLessons(organizationId, coachIds, allClassIds);

  // 创建排课和出勤
  await createSchedulesAndAttendances(organizationId, campusId, allClassIds, studentCategories);

  // 设置流失学员召回日期
  await setLostStudentsRecall();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 完整E2E测试数据创建完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('测试数据统计：');
  console.log('  ✅ 班级：42个（周一-周日，每天3时段×2类型）');
  console.log('  ✅ 学员：120个');
  console.log('     - 105个活跃学员');
  console.log('     - 15个流失学员');
  console.log('     - 30个低出勤学员（含10个连续请假）');
  console.log('     - 30个蜜月期客户（含10个低出勤）');
  console.log('     - 10个未排班学员');
  console.log('     - 30个待续费学员（课时<10）');
  console.log('  ✅ 鱼池资源：50条');
  console.log('  ✅ 体验课：25个（20到场，12成单，8未成单，5未到场）');
  console.log('  ✅ 排课和出勤：已创建过去7天数据');
  console.log('  ✅ 流失学员召回：15个（10个生病，5个时间问题）');
  console.log('');
  console.log('数据分配：');
  console.log('  - 3个教练平均分摊课时');
  console.log('  - 2个销售平分鱼池资源');
  console.log('');
}

createCompleteE2EData()
  .then(() => {
    console.log('✅ 完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
