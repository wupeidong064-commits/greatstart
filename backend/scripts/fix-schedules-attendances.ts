/**
 * 修复排课和出勤数据脚本
 *
 * 问题：原脚本创建排课时没有设置id，导致出勤记录的scheduleId不匹配
 *
 * 使用方法：cd backend && npx tsx scripts/fix-schedules-attendances.ts
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

// ============================================================
// 清理旧的排课和出勤数据
// ============================================================

async function cleanOldSchedulesAndAttendances() {
  console.log('🧹 清理旧的排课和出勤数据...');

  // 先删除出勤记录
  const { error: attendanceError } = await memfireAdmin
    .from('attendances')
    .delete()
    .like('id', 'e2e-att-%');

  if (attendanceError) {
    console.log('  ⚠️  清理出勤记录失败:', attendanceError.message);
  }

  // 删除排课记录
  const { error: scheduleError } = await memfireAdmin
    .from('schedules')
    .delete()
    .like('id', 'e2e-sch-%');

  if (scheduleError) {
    console.log('  ⚠️  清理排课记录失败:', scheduleError.message);
  }

  console.log('  ✅ 清理完成');
}

// ============================================================
// 获取班级和报名数据
// ============================================================

async function getClassesAndEnrollments(organizationId: string) {
  // 获取所有E2E班级
  const { data: classes, error: classError } = await memfireAdmin
    .from('classes')
    .select('*')
    .ilike('code', 'E2E%');

  if (classError || !classes) {
    throw new Error('获取班级失败: ' + (classError?.message || '无数据'));
  }

  console.log(`  📊 找到 ${classes.length} 个E2E班级`);

  // 获取所有E2E报名记录
  const { data: enrollments, error: enrollError } = await memfireAdmin
    .from('enrollments')
    .select('id, studentId, classId, students(name)')
    .ilike('id', 'e2e-%');

  if (enrollError) {
    throw new Error('获取报名记录失败: ' + enrollError.message);
  }

  console.log(`  📊 找到 ${enrollments?.length || 0} 个E2E报名记录`);

  // 按班级分组
  const enrollmentsByClass: Record<string, Array<{ studentId: string; studentName: string }>> = {};

  for (const e of (enrollments || [])) {
    if (!enrollmentsByClass[e.classId]) {
      enrollmentsByClass[e.classId] = [];
    }
    enrollmentsByClass[e.classId].push({
      studentId: e.studentId,
      studentName: (e.students as any)?.name || 'Unknown',
    });
  }

  return { classes, enrollmentsByClass };
}

// ============================================================
// 获取学员分类（用于模拟出勤率）
// ============================================================

async function getStudentCategories() {
  // 学员分类（与原脚本保持一致）
  return {
    lowAttendance: Array.from({ length: 30 }, (_, i) => i + 1), // 1-30 低出勤
    continuousLeave: Array.from({ length: 10 }, (_, i) => i + 1), // 1-10 连续请假
    honeymoonLowAttendance: Array.from({ length: 10 }, (_, i) => i + 21), // 21-30 蜜月期且低出勤
  };
}

// ============================================================
// 创建排课和出勤数据
// ============================================================

async function createSchedulesAndAttendances(
  organizationId: string,
  campusId: string,
  classes: any[],
  enrollmentsByClass: Record<string, Array<{ studentId: string; studentName: string }>>
) {
  console.log('📊 创建排课和出勤数据...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 创建过去14天 + 未来7天的排课
  const dates: Date[] = [];
  for (let day = 13; day >= 0; day--) {
    dates.push(addDays(today, -day));
  }
  for (let day = 1; day <= 7; day++) {
    dates.push(addDays(today, day));
  }

  const categories = await getStudentCategories();

  let scheduleCount = 0;
  let attendanceCount = 0;
  let scheduleId = 1;
  let attendanceId = 1;

  for (const classData of classes) {
    const classId = classData.id;
    const teacherId = classData.teacherId;
    const enrolledStudents = enrollmentsByClass[classId] || [];

    if (enrolledStudents.length === 0) {
      console.log(`  ⚠️  班级 ${classData.name} 没有学员，跳过`);
      continue;
    }

    // 解析班级名称获取时间
    // 格式: "精英班-周一10:00" 或 "幼儿班-周二14:00"
    const nameMatch = classData.name?.match(/周([一二三四五六日])(\d{2}:\d{2})/);
    const dayOfWeek = nameMatch ? ['一', '二', '三', '四', '五', '六', '日'].indexOf(nameMatch[1]) : 0;
    const timeStr = nameMatch ? nameMatch[2] : '10:00';
    const [hour, minute] = timeStr.split(':').map(Number);

    for (const date of dates) {
      // 只在班级对应的星期创建排课
      if (date.getDay() !== (dayOfWeek === 0 ? 1 : dayOfWeek + 1)) {
        // 简化：周一=1, 周二=2... 但JavaScript中周日=0
        // 映射关系：'一' -> 1, '二' -> 2 ...
        continue;
      }

      // 创建时间
      const startTime = new Date(date);
      startTime.setHours(hour, minute, 0, 0);
      const endTime = new Date(date);
      endTime.setHours(hour + 1, minute + 30, 0, 0);

      const scheduleIdStr = `e2e-sch-${scheduleId.toString().padStart(5, '0')}`;

      // 创建排课记录
      const { error: scheduleError } = await memfireAdmin.from('schedules').insert({
        id: scheduleIdStr,
        organizationId,
        campusId,
        classId,
        teacherId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        classroom: 'E2E测试教室',
      });

      if (scheduleError) {
        console.log(`  ⚠️  排课创建失败: ${scheduleError.message}`);
        continue;
      }

      scheduleCount++;
      scheduleId++;

      // 只为过去的排课创建出勤记录
      if (date >= today) continue;

      // 为每个学员创建出勤记录
      for (const student of enrolledStudents) {
        const studentNum = parseInt(student.studentId.split('-')[2]);
        let shouldAttend = false;
        let status = 'present';

        // 低出勤学员：30%出勤率
        if (categories.lowAttendance.includes(studentNum)) {
          shouldAttend = Math.random() < 0.3;
        }
        // 连续请假学员：不出勤
        else if (categories.continuousLeave.includes(studentNum)) {
          shouldAttend = false;
          if (Math.random() < 0.5) {
            status = 'leave'; // 请假
          }
        }
        // 蜜月期低出勤学员：50%出勤率
        else if (categories.honeymoonLowAttendance.includes(studentNum)) {
          shouldAttend = Math.random() < 0.5;
        }
        // 正常学员：85%出勤率
        else {
          shouldAttend = Math.random() < 0.85;
        }

        if (shouldAttend || status === 'leave') {
          const attendanceIdStr = `e2e-att-${attendanceId.toString().padStart(5, '0')}`;

          const { error: attError } = await memfireAdmin.from('attendances').insert({
            id: attendanceIdStr,
            organizationId,
            classId,
            scheduleId: scheduleIdStr,
            studentId: student.studentId,
            status: shouldAttend ? 'present' : status,
            notes: 'E2E测试出勤',
          });

          if (!attError) {
            attendanceCount++;
            attendanceId++;
          }
        }
      }
    }
  }

  console.log(`  ✅ 排课创建完成（${scheduleCount}条）`);
  console.log(`  ✅ 出勤记录创建完成（${attendanceCount}条）`);

  return { scheduleCount, attendanceCount };
}

// ============================================================
// 更新学员课时（基于出勤记录）
// ============================================================

async function updateStudentLessons(organizationId: string) {
  console.log('📊 更新学员课时...');

  // 获取所有E2E学员
  const { data: students, error: studentError } = await memfireAdmin
    .from('students')
    .select('id, name')
    .ilike('name', 'E2E%');

  if (studentError || !students) {
    console.log('  ⚠️  获取学员失败');
    return;
  }

  let updatedCount = 0;

  for (const student of students) {
    // 统计该学员的出勤记录数
    const { count: attendanceCount } = await memfireAdmin
      .from('attendances')
      .select('*', { count: 'exact', head: true })
      .eq('studentId', student.id)
      .eq('status', 'present');

    // 计算剩余课时（初始20课时 - 已上课次数）
    const initialLessons = 20;
    const remainingLessons = Math.max(0, initialLessons - (attendanceCount || 0));

    // 更新学员课时
    const { error: updateError } = await memfireAdmin
      .from('students')
      .update({
        remainingLessons,
        totalLessonsPurchased: initialLessons,
      })
      .eq('id', student.id);

    if (!updateError) {
      updatedCount++;
    }
  }

  console.log(`  ✅ 学员课时更新完成（${updatedCount}个）`);
}

// ============================================================
// 设置流失学员的召回日期
// ============================================================

async function setRecallDates(organizationId: string) {
  console.log('📊 设置流失学员召回日期...');

  const today = new Date();

  // 流失-生病（91-100）：召回日期为未来7-14天
  for (let i = 91; i <= 100; i++) {
    const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;
    const recallDate = addDays(today, 7 + Math.floor(Math.random() * 7));

    await memfireAdmin
      .from('students')
      .update({
        recallDate: formatDate(recallDate),
        inactiveReason: '生病',
      })
      .eq('id', studentId);
  }

  // 流失-时间（101-105）：召回日期为未来1-7天
  for (let i = 101; i <= 105; i++) {
    const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;
    const recallDate = addDays(today, 1 + Math.floor(Math.random() * 6));

    await memfireAdmin
      .from('students')
      .update({
        recallDate: formatDate(recallDate),
        inactiveReason: '时间冲突',
      })
      .eq('id', studentId);
  }

  // 待续费学员（61-90）：设置课时<10
  for (let i = 61; i <= 90; i++) {
    const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;
    const remainingLessons = Math.floor(Math.random() * 10); // 0-9

    await memfireAdmin
      .from('students')
      .update({ remainingLessons })
      .eq('id', studentId);
  }

  console.log('  ✅ 召回日期和课时设置完成');
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  console.log('🚀 开始修复排课和出勤数据...\n');

  const { organizationId, campusId } = await getTestOrgAndCampus();
  console.log(`测试机构ID: ${organizationId}`);
  console.log(`测试校区ID: ${campusId}`);
  console.log('');

  await cleanOldSchedulesAndAttendances();
  const { classes, enrollmentsByClass } = await getClassesAndEnrollments(organizationId);
  await createSchedulesAndAttendances(organizationId, campusId, classes, enrollmentsByClass);
  await updateStudentLessons(organizationId);
  await setRecallDates(organizationId);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 排课和出勤数据修复完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .then(() => {
    console.log('✅ 完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
