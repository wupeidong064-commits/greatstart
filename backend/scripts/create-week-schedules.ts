import { memfireAdmin } from '../src/config/memfire';

async function main() {
  console.log('=== 创建本周排课数据 ===\n');

  const ORG_ID = 'c1bebf13-1598-4921-b6fa-9d3a831af1b3';
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=周日, 4=周四

  // 计算本周一的日期
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  console.log(`今天: ${today.toISOString().split('T')[0]} (周${dayNames[dayOfWeek]})`);
  console.log(`本周一: ${monday.toISOString().split('T')[0]}`);

  // 获取所有班级
  const { data: classes } = await memfireAdmin
    .from('classes')
    .select('id, name, code, teacherId')
    .eq('organizationId', ORG_ID)
    .eq('status', 'active');

  console.log(`班级数: ${classes?.length || 0}`);

  // 获取活跃学员
  const { data: enrollments } = await memfireAdmin
    .from('enrollments')
    .select('studentId, classId')
    .eq('organizationId', ORG_ID)
    .eq('status', 'active');

  console.log(`报名记录数: ${enrollments?.length || 0}`);

  // 按班级分组学员
  const classStudentsMap = new Map<string, string[]>();
  for (const e of (enrollments || [])) {
    if (!classStudentsMap.has(e.classId)) {
      classStudentsMap.set(e.classId, []);
    }
    classStudentsMap.get(e.classId)!.push(e.studentId);
  }

  // 创建本周7天的排课（每个班级每天一节课）
  const schedules: any[] = [];
  const attendances: any[] = [];
  let scheduleIndex = 200;
  let attendanceIndex = 400;

  for (let i = 0; i < 7; i++) {
    const scheduleDate = new Date(monday);
    scheduleDate.setDate(monday.getDate() + i);

    for (const cls of (classes || [])) {
      const hour = 9 + Math.floor(Math.random() * 10); // 9:00 - 18:00
      const startTime = new Date(scheduleDate);
      startTime.setHours(hour, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 1);

      const scheduleId = `week-sch-${String(scheduleIndex).padStart(5, '0')}`;
      schedules.push({
        id: scheduleId,
        classId: cls.id,
        teacherId: cls.teacherId,
        organizationId: ORG_ID,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: startTime < today ? 'completed' : 'scheduled',
        notes: `${cls.name} 本周排课`,
      });

      // 为已完成的排课创建出勤记录
      const students = classStudentsMap.get(cls.id) || [];
      if (startTime < today && students.length > 0) {
        // 85% 出勤率
        const presentStudents = students.filter(() => Math.random() < 0.85);
        for (const studentId of presentStudents) {
          attendances.push({
            id: `week-att-${String(attendanceIndex).padStart(5, '0')}`,
            studentId,
            scheduleId,
            classId: cls.id,
            organizationId: ORG_ID,
            status: Math.random() < 0.95 ? 'present' : 'late',
            checkInTime: startTime.toISOString(),
          });
          attendanceIndex++;
        }
      }

      scheduleIndex++;
    }
  }

  // 插入排课
  const { error: scheduleError } = await memfireAdmin
    .from('schedules')
    .insert(schedules);

  if (scheduleError) {
    console.error('插入排课失败:', scheduleError);
    return;
  }
  console.log(`\n已创建 ${schedules.length} 条本周排课记录`);

  // 插入出勤
  if (attendances.length > 0) {
    const { error: attendanceError } = await memfireAdmin
      .from('attendances')
      .insert(attendances);

    if (attendanceError) {
      console.error('插入出勤失败:', attendanceError);
    } else {
      console.log(`已创建 ${attendances.length} 条出勤记录`);
    }
  }

  // 统计今天的排课
  const todayStr = today.toISOString().split('T')[0];
  const todaySchedules = schedules.filter(s => s.startTime.startsWith(todayStr));
  console.log(`\n今天 (${todayStr}) 的排课: ${todaySchedules.length} 条`);

  console.log('\n完成！');
}

main().catch(console.error);
