/**
 * E2E 测试数据创建脚本 - 收入验证版本
 *
 * 基于实际的数据库schema创建测试数据
 *
 * 使用方法：cd backend && npx tsx scripts/create-revenue-e2e-data.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const MEMFIRE_URL = process.env.MEMFIRE_URL!;
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY!;

const memfireAdmin = createClient(MEMFIRE_URL, MEMFIRE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ============================================================
// 工具函数
// ============================================================

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

  if (!org) throw new Error('E2E测试机构不存在，请先运行 create-e2e-users.ts');

  const { data: campus } = await memfireAdmin
    .from('campuses')
    .select('*')
    .ilike('code', 'E2E%')
    .limit(1)
    .single();

  if (!campus) throw new Error('E2E测试校区不存在，请先运行 create-e2e-users.ts');

  return { organizationId: org.id, campusId: campus.id };
}

async function getE2EUserIds() {
  const { data: users } = await memfireAdmin
    .from('users')
    .select('*')
    .ilike('email', 'e2e-%@test.com');

  if (!users || users.length === 0) {
    throw new Error('E2E测试用户不存在，请先运行 create-e2e-users.ts');
  }

  const userIds: Record<string, string> = {};
  const coachIds: string[] = [];
  const salesIds: string[] = [];

  for (const user of users) {
    if (user.email === 'e2e-coach1@test.com') { userIds.coach1 = user.id; coachIds.push(user.id); }
    if (user.email === 'e2e-coach2@test.com') { userIds.coach2 = user.id; coachIds.push(user.id); }
    if (user.email === 'e2e-coach3@test.com') { userIds.coach3 = user.id; coachIds.push(user.id); }
    if (user.email === 'e2e-sales1@test.com') { userIds.sales1 = user.id; salesIds.push(user.id); }
    if (user.email === 'e2e-sales2@test.com') { userIds.sales2 = user.id; salesIds.push(user.id); }
  }

  console.log('  ✅ 获取到E2E用户ID:', Object.keys(userIds).length, '个');
  return { userIds, coachIds, salesIds };
}

// ============================================================
// 清理旧数据
// ============================================================

async function cleanOldData() {
  console.log('🧹 清理旧的E2E测试数据...');

  await memfireAdmin.from('leads').delete().ilike('id', 'e2e-%');
  await memfireAdmin.from('experience_lessons').delete().ilike('id', 'e2e-%');
  await memfireAdmin.from('conversions').delete().ilike('id', 'e2e-%');
  await memfireAdmin.from('enrollments').delete().ilike('id', 'e2e-%');
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

  const classIds: string[] = [];

  let count = 0;
  for (let day = 0; day < 7; day++) {
    for (let time = 0; time < 3; time++) {
      for (let type = 0; type < 2; type++) {
        count++;
        const coachId = coachIds[count % 3];
        const classId = `e2e-class-${count}`;
        const className = `${courseTypes[type]}-${dayNames[day]}${timeStarts[time]}`;

        const { error } = await memfireAdmin.from('classes').insert({
          id: classId,
          organizationId,
          campusId,
          name: className,
          code: `E2E${day}${time}${type}`,
          courseType: courseTypes[type],
          capacity: 10,
          teacherId: coachId,
          status: 'active',
        });

        if (!error) {
          classIds.push(classId);
        } else {
          console.log(`  ⚠️  班级 ${count} 创建失败: ${error.message}`);
        }
      }
    }
  }

  console.log(`  ✅ 班级创建完成（${classIds.length}个）`);
  return classIds;
}

// ============================================================
// 创建学员（120个）
// ============================================================

async function createStudents(organizationId: string, campusId: string, classIds: string[]) {
  console.log('📊 创建学员（120个）...');

  const today = new Date();

  // 学员分类
  const categories = {
    lowAttendance: Array.from({ length: 30 }, (_, i) => i + 1), // 1-30 低出勤
    continuousLeave: Array.from({ length: 10 }, (_, i) => i + 1), // 1-10 连续请假
    honeymoon: Array.from({ length: 30 }, (_, i) => i + 21), // 21-50 蜜月期
    honeymoonLowAttendance: Array.from({ length: 10 }, (_, i) => i + 21), // 21-30 蜜月期且低出勤
    unassigned: Array.from({ length: 10 }, (_, i) => i + 51), // 51-60 未排班
    renewalNeeded: Array.from({ length: 30 }, (_, i) => i + 61), // 61-90 待续费
    inactiveSick: Array.from({ length: 10 }, (_, i) => i + 91), // 91-100 流失-生病
    inactiveTime: Array.from({ length: 5 }, (_, i) => i + 101), // 101-105 流失-时间
    normal: Array.from({ length: 15 }, (_, i) => i + 106), // 106-120 正常
  };

  const studentIds: string[] = [];

  for (let i = 1; i <= 120; i++) {
    const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;

    // 确定状态
    let status = 'active';
    if (categories.inactiveSick.includes(i) || categories.inactiveTime.includes(i)) {
      status = 'inactive';
    }

    const { error } = await memfireAdmin.from('students').insert({
      id: studentId,
      organizationId,
      campusId,
      name: status === 'inactive'
        ? `E2E流失学员${i > 100 ? i - 100 : i - 90}`
        : `E2E学员${i.toString().padStart(3, '0')}`,
      gender: i % 2 === 0 ? '男' : '女',
      phone: `138${Math.random().toString(36).substring(2, 10)}`,
      parentPhone: `138${Math.random().toString(36).substring(2, 10)}`,
      status,
    });

    if (!error) {
      studentIds.push(studentId);
    } else {
      console.log(`  ⚠️  学员 ${i} 创建失败: ${error.message}`);
    }
  }

  console.log('  ✅ 学员创建完成（120个）');
  return { studentIds, categories };
}

// ============================================================
// 创建鱼池资源（50条）
// ============================================================

async function createLeads(organizationId: string, salesIds: string[]) {
  console.log('📊 创建鱼池资源（50条）...');

  const salesNames = ['E2E赵销售', 'E2E钱销售'];

  for (let i = 1; i <= 50; i++) {
    const leadId = `e2e-lead-${i.toString().padStart(3, '0')}`;
    const assigneeId = salesIds[i % 2];
    const assigneeName = salesNames[i % 2];

    const { error } = await memfireAdmin.from('leads').insert({
      id: leadId,
      organizationId,
      assigneeId,
      assigneeName,
      customerName: `E2E线索客户${i.toString().padStart(3, '0')}`,
      age: 5 + (i % 8),
      contact: `139${Math.random().toString(36).substring(2, 10)}`,
      notes: 'E2E测试线索数据',
    });

    if (error) {
      console.log(`  ⚠️  线索 ${i} 创建失败: ${error.message}`);
    }
  }

  console.log('  ✅ 鱼池资源创建完成（50条）');
}

// ============================================================
// 创建体验课和成单（25个体验课，12个成单）
// ============================================================

async function createExperienceLessonsAndConversions(
  organizationId: string,
  campusId: string,
  coachIds: string[],
  salesIds: string[],
  classIds: string[]
) {
  console.log('📊 创建体验课和成单数据...');

  const coachNames = ['E2E张教练', 'E2E李教练', 'E2E王教练'];
  const salesNames = ['E2E赵销售', 'E2E钱销售'];
  const today = new Date();
  const yesterday = addDays(today, -1);

  let convertedCount = 0;
  let attendedCount = 0;

  for (let i = 1; i <= 25; i++) {
    const lessonId = `e2e-exp-${i.toString().padStart(3, '0')}`;
    const leadId = `e2e-lead-${i.toString().padStart(3, '0')}`;
    const coachId = coachIds[i % 3];
    const salesId = salesIds[i % 2];

    // 前20个到场，后5个未到场
    const isAttended = i <= 20;
    // 前12个成单
    const isConverted = i <= 12;

    if (isAttended) attendedCount++;
    if (isConverted) convertedCount++;

    const status = isAttended
      ? (isConverted ? 'converted' : 'completed')
      : 'no-show';

    const { error: expError } = await memfireAdmin.from('experience_lessons').insert({
      id: lessonId,
      organizationId,
      leadId,
      studentName: `E2E线索客户${i.toString().padStart(3, '0')}`,
      age: 5 + (i % 8),
      contact: `139${Math.random().toString(36).substring(2, 10)}`,
      source: 'E2E测试',
      classId: classIds[i % classIds.length],
      className: `E2E班级${i % classIds.length + 1}`,
      scheduleDate: formatDate(yesterday),
      startTime: '10:00',
      endTime: '11:30',
      teachingTeacherId: coachId,
      teachingTeacherName: coachNames[i % 3],
      assigneeId: salesId,
      assigneeName: salesNames[i % 2],
      status,
      notes: `E2E测试体验课 ${i}`,
    });

    // 如果成单，创建成单记录和对应学员
    if (isConverted) {
      const conversionId = `e2e-conv-${i.toString().padStart(3, '0')}`;
      const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;
      const classId = classIds[i % classIds.length];

      // 创建成单记录
      await memfireAdmin.from('conversions').insert({
        id: conversionId,
        organizationId,
        studentId,
        leadId,
        experienceLessonId: lessonId,
        salesId,
        salesName: salesNames[i % 2],
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
        notes: 'E2E测试成单报名',
      });
    }

    if (expError) {
      console.log(`  ⚠️  体验课 ${i} 创建失败: ${expError.message}`);
    }
  }

  console.log(`  ✅ 体验课创建完成（25条：${attendedCount}到场，${convertedCount}成单）`);
}

// ============================================================
// 创建报名记录（用于测试班级学员管理）
// ============================================================

async function createEnrollments(
  organizationId: string,
  studentIds: string[],
  classIds: string[],
  categories: any
) {
  console.log('📊 创建报名记录...');

  let enrollCount = 0;
  let errorCount = 0;

  // 为除了未排班学员外的所有学员创建报名记录
  for (let i = 1; i <= studentIds.length; i++) {
    // 跳过未排班学员 (51-60)
    if (categories.unassigned.includes(i)) continue;

    // 跳过流失学员
    if (categories.inactiveSick.includes(i) || categories.inactiveTime.includes(i)) continue;

    const studentId = studentIds[i - 1];
    const classId = classIds[(i - 1) % classIds.length];

    const { error } = await memfireAdmin.from('enrollments').insert({
      id: `e2e-enroll-${i}`,
      studentId,
      classId,
      organizationId,
      notes: 'E2E测试报名',
    });

    if (!error) {
      enrollCount++;
    } else {
      if (errorCount < 5) {
        console.log(`  ⚠️  报名 ${i} 创建失败: ${error.message}`);
      }
      errorCount++;
    }
  }

  if (errorCount > 5) {
    console.log(`  ⚠️  还有 ${errorCount - 5} 个报名创建失败`);
  }
  console.log(`  ✅ 报名记录创建完成（${enrollCount}条）`);

  // 返回创建成功的记录数量以便调试
  return enrollCount;
}

// ============================================================
// 创建排课和出勤数据（用于计算确认收入）
// ============================================================

async function createSchedulesAndAttendances(
  organizationId: string,
  campusId: string,
  classIds: string[],
  studentIds: string[],
  categories: any
) {
  console.log('📊 创建排课和出勤数据...');

  const today = new Date();
  const pastWeek = [];

  // 创建过去7天的排课
  for (let day = 6; day >= 0; day--) {
    pastWeek.push(addDays(today, -day));
  }

  let scheduleCount = 0;
  let attendanceCount = 0;

  // 首先获取所有报名记录
  const { data: allEnrollments } = await memfireAdmin
    .from('enrollments')
    .select('studentId, classId');

  // 按班级分组
  const enrollmentsByClass: Record<string, string[]> = {};
  for (const e of (allEnrollments || [])) {
    if (!enrollmentsByClass[e.classId]) {
      enrollmentsByClass[e.classId] = [];
    }
    enrollmentsByClass[e.classId].push(e.studentId);
  }

  // 为每个班级创建过去7天的排课
  for (const classId of classIds) {
    const enrolledStudents = enrollmentsByClass[classId] || [];
    if (enrolledStudents.length === 0) continue;

    // 获取班级信息以获取teacherId
    const { data: classData } = await memfireAdmin
      .from('classes')
      .select('teacherId')
      .eq('id', classId)
      .single();

    const teacherId = classData?.teacherId;

    for (const date of pastWeek) {
      // 创建时间：每天10:00
      const startTime = new Date(date);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(date);
      endTime.setHours(11, 30, 0, 0);

      const { error: scheduleError } = await memfireAdmin.from('schedules').insert({
        organizationId,
        campusId,
        classId,
        teacherId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        classroom: 'E2E测试教室',
      });

      if (!scheduleError) {
        scheduleCount++;

        // 为每个学员创建出勤记录
        for (const studentId of enrolledStudents) {
          const studentNum = parseInt(studentId.split('-')[2]);

          // 低出勤学员：30%出勤率
          if (categories.lowAttendance?.includes(studentNum)) {
            if (Math.random() < 0.3) {
              await memfireAdmin.from('attendances').insert({
                organizationId,
                classId,
                scheduleId: `e2e-schedule-${classId}-${formatDate(date)}`,
                studentId,
                status: 'present',
                notes: 'E2E测试出勤',
              });
              attendanceCount++;
            }
          }
          // 连续请假学员：不出勤
          else if (categories.continuousLeave?.includes(studentNum)) {
            // 不创建出勤记录
          }
          // 蜜月期低出勤学员：50%出勤率
          else if (categories.honeymoonLowAttendance?.includes(studentNum)) {
            if (Math.random() < 0.5) {
              await memfireAdmin.from('attendances').insert({
                organizationId,
                classId,
                scheduleId: `e2e-schedule-${classId}-${formatDate(date)}`,
                studentId,
                status: 'present',
                notes: 'E2E测试出勤',
              });
              attendanceCount++;
            }
          }
          // 正常学员：80%出勤率
          else {
            if (Math.random() < 0.8) {
              await memfireAdmin.from('attendances').insert({
                organizationId,
                classId,
                scheduleId: `e2e-schedule-${classId}-${formatDate(date)}`,
                studentId,
                status: 'present',
                notes: 'E2E测试出勤',
              });
              attendanceCount++;
            }
          }
        }
      }
    }
  }

  console.log(`  ✅ 排课创建完成（${scheduleCount}条）`);
  console.log(`  ✅ 出勤记录创建完成（${attendanceCount}条）`);
}

// ============================================================
// 主函数
// ============================================================

async function createRevenueE2EData() {
  console.log('🚀 开始创建收入验证E2E测试数据...\n');

  const { organizationId, campusId } = await getTestOrgAndCampus();
  const { userIds, coachIds, salesIds } = await getE2EUserIds();

  console.log(`测试机构ID: ${organizationId}`);
  console.log(`测试校区ID: ${campusId}`);
  console.log('');

  await cleanOldData();
  const classIds = await createClasses(organizationId, campusId, coachIds);
  const { studentIds, categories } = await createStudents(organizationId, campusId, classIds);
  await createLeads(organizationId, salesIds);
  await createExperienceLessonsAndConversions(organizationId, campusId, coachIds, salesIds, classIds);
  await createEnrollments(organizationId, studentIds, classIds, categories);
  await createSchedulesAndAttendances(organizationId, campusId, classIds, studentIds, categories);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 E2E 测试数据创建完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('测试数据统计：');
  console.log('  - 班级：42个（周一至周日，每天3时段 × 2类型）');
  console.log('  - 学员：120个');
  console.log('    * 低出勤学员：30个');
  console.log('    * 蜜月期客户：30个');
  console.log('    * 待续费学员：30个（课时<10）');
  console.log('    * 流失学员：15个');
  console.log('    * 未排班学员：10个');
  console.log('    * 正常学员：15个');
  console.log('  - 鱼池资源：50条');
  console.log('  - 体验课：25条（20到场，12成单）');
  console.log('  - 排课记录：过去7天');
  console.log('  - 出勤记录：按出勤率模拟');
  console.log('');
}

createRevenueE2EData()
  .then(() => {
    console.log('✅ 完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
