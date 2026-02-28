import { memfireAdmin } from '../src/config/memfire';

async function main() {
  console.log('=== 开始创建真实排课和划课数据 ===\n');

  const ORG_ID = 'c1bebf13-1598-4921-b6fa-9d3a831af1b3';

  // 1. 获取所有班级
  console.log('1. 获取班级数据...');
  const { data: classes, error: classesError } = await memfireAdmin
    .from('classes')
    .select('id, name, code, courseType, level, capacity, teacherId')
    .eq('organizationId', ORG_ID)
    .eq('status', 'active');

  if (classesError || !classes) {
    console.error('获取班级失败:', classesError);
    return;
  }
  console.log(`   找到 ${classes.length} 个班级`);

  // 2. 获取所有活跃学员报名记录
  console.log('2. 获取学员报名数据...');
  const { data: enrollments, error: enrollmentsError } = await memfireAdmin
    .from('enrollments')
    .select('id, studentId, classId, enrolledAt, student:students(id, name, phone)')
    .eq('organizationId', ORG_ID)
    .eq('status', 'active');

  if (enrollmentsError || !enrollments) {
    console.error('获取报名记录失败:', enrollmentsError);
    return;
  }
  console.log(`   找到 ${enrollments.length} 条报名记录`);

  // 3. 删除现有测试数据
  console.log('3. 清理现有测试数据...');
  await memfireAdmin.from('attendances').delete().like('id', 'e2e-att%');
  await memfireAdmin.from('schedules').delete().like('id', 'e2e-sch%');
  console.log('   已清理旧数据');

  // 4. 为每个班级创建4周的排课（每周1次课）
  console.log('4. 创建排课数据...');
  const schedules: any[] = [];
  let scheduleIndex = 1;

  // 生成过去4周的日期
  const today = new Date();
  const weeks: Date[] = [];
  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - (i * 7));
    weeks.push(weekStart);
  }

  for (const cls of classes) {
    // 每个班级每周固定时间上课
    const dayOfWeek = Math.floor(Math.random() * 7); // 随机选择一周的某一天
    const hour = 9 + Math.floor(Math.random() * 10); // 9:00 - 18:00

    for (const weekStart of weeks) {
      const scheduleDate = new Date(weekStart);
      scheduleDate.setDate(scheduleDate.getDate() + dayOfWeek);
      scheduleDate.setHours(hour, 0, 0, 0);

      const startTime = new Date(scheduleDate);
      const endTime = new Date(scheduleDate);
      endTime.setHours(endTime.getHours() + 1);

      schedules.push({
        id: `e2e-sch-real-${String(scheduleIndex).padStart(5, '0')}`,
        classId: cls.id,
        teacherId: cls.teacherId,
        organizationId: ORG_ID,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: 'completed',
        notes: `班级 ${cls.name} 的排课`,
      });
      scheduleIndex++;
    }
  }

  const { error: scheduleError } = await memfireAdmin
    .from('schedules')
    .insert(schedules);

  if (scheduleError) {
    console.error('插入排课失败:', scheduleError);
    return;
  }
  console.log(`   已创建 ${schedules.length} 条排课记录`);

  // 5. 为每个班级的学员创建出勤记录
  console.log('5. 创建出勤数据（设置部分低出勤学员）...');
  const attendances: any[] = [];
  let attendanceIndex = 1;

  // 按班级分组学员
  const classStudentsMap = new Map<string, any[]>();
  for (const enrollment of enrollments) {
    if (!classStudentsMap.has(enrollment.classId)) {
      classStudentsMap.set(enrollment.classId, []);
    }
    classStudentsMap.get(enrollment.classId)!.push(enrollment);
  }

  // 按班级分组排课
  const classSchedulesMap = new Map<string, any[]>();
  for (const schedule of schedules) {
    if (!classSchedulesMap.has(schedule.classId)) {
      classSchedulesMap.set(schedule.classId, []);
    }
    classSchedulesMap.get(schedule.classId)!.push(schedule);
  }

  // 全局低出勤学员列表（约20%的学员）
  const allStudentIds = [...new Set(enrollments.map(e => e.studentId))];
  const lowAttendanceStudentIds = new Set<string>();
  const lowAttendanceRate = 0.2;

  // 随机选择20%的学员作为低出勤学员
  const shuffledIds = [...allStudentIds].sort(() => Math.random() - 0.5);
  const lowAttendanceCount = Math.floor(shuffledIds.length * lowAttendanceRate);
  for (let i = 0; i < lowAttendanceCount; i++) {
    lowAttendanceStudentIds.add(shuffledIds[i]);
  }
  console.log(`   设置了 ${lowAttendanceStudentIds.size} 名低出勤学员（约20%）`);

  // 为每个班级创建出勤记录
  for (const [classId, classEnrollments] of classStudentsMap) {
    const classSchedules = classSchedulesMap.get(classId) || [];

    for (const enrollment of classEnrollments) {
      const isLowAttendance = lowAttendanceStudentIds.has(enrollment.studentId);
      // 低出勤学员：40%出勤率，正常学员：85%出勤率
      const attendanceRate = isLowAttendance ? 0.4 : 0.85;

      for (const schedule of classSchedules) {
        if (Math.random() < attendanceRate) {
          const status = Math.random() < 0.95 ? 'present' : 'late';
          attendances.push({
            id: `e2e-att-real-${String(attendanceIndex).padStart(5, '0')}`,
            studentId: enrollment.studentId,
            scheduleId: schedule.id,
            classId: classId,
            organizationId: ORG_ID,
            status: status,
            checkInTime: schedule.startTime,
            notes: isLowAttendance ? '低出勤学员测试数据' : '正常出勤',
          });
          attendanceIndex++;
        }
      }
    }
  }

  // 批量插入出勤记录（每次500条）
  console.log(`   正在插入 ${attendances.length} 条出勤记录...`);
  const batchSize = 500;
  for (let i = 0; i < attendances.length; i += batchSize) {
    const batch = attendances.slice(i, i + batchSize);
    const { error: attendanceError } = await memfireAdmin
      .from('attendances')
      .insert(batch);
    if (attendanceError) {
      console.error(`   插入出勤失败 (batch ${i}):`, attendanceError);
    }
  }
  console.log(`   已创建 ${attendances.length} 条出勤记录`);

  // 6. 创建蜜月期学员（新报名学员）
  console.log('6. 设置蜜月期学员...');
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 获取最近30天报名的学员
  const { data: recentEnrollments } = await memfireAdmin
    .from('enrollments')
    .select('id, studentId, classId, enrolledAt')
    .eq('organizationId', ORG_ID)
    .eq('status', 'active')
    .gte('enrolledAt', thirtyDaysAgo.toISOString())
    .limit(30);

  const honeymoonCount = recentEnrollments?.length || 0;
  console.log(`   当前蜜月期学员: ${honeymoonCount} 人`);

  // 如果蜜月期学员太少，更新一些报名记录的日期
  if (honeymoonCount < 15) {
    console.log('   更新部分报名记录为蜜月期...');
    const { data: allEnrollmentsToUpdate } = await memfireAdmin
      .from('enrollments')
      .select('id')
      .eq('organizationId', ORG_ID)
      .eq('status', 'active')
      .limit(30);

    if (allEnrollmentsToUpdate && allEnrollmentsToUpdate.length > 0) {
      // 随机选择15个学员设置为蜜月期
      const toUpdate = allEnrollmentsToUpdate
        .sort(() => Math.random() - 0.5)
        .slice(0, 15);

      for (const enrollment of toUpdate) {
        // 设置报名时间为过去10-25天内
        const daysAgo = 10 + Math.floor(Math.random() * 15);
        const newDate = new Date(now);
        newDate.setDate(newDate.getDate() - daysAgo);

        await memfireAdmin
          .from('enrollments')
          .update({ enrolledAt: newDate.toISOString() })
          .eq('id', enrollment.id);
      }
      console.log(`   已更新 ${toUpdate.length} 条报名记录为蜜月期`);
    }
  }

  // 7. 统计结果
  console.log('\n=== 创建完成 ===');
  console.log(`排课记录: ${schedules.length}`);
  console.log(`出勤记录: ${attendances.length}`);
  console.log(`班级数: ${classes.length}`);
  console.log(`学员报名数: ${enrollments.length}`);
  console.log(`低出勤学员: ${lowAttendanceStudentIds.size} 人`);

  // 统计出勤率
  const totalExpected = schedules.length * (enrollments.length / classes.length);
  const actualRate = totalExpected > 0 ? ((attendances.length / totalExpected) * 100).toFixed(1) : 0;
  console.log(`预估出勤率: ${actualRate}%`);
}

main().catch(console.error);
