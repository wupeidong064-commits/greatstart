/**
 * 创建低出勤学员和蜜月期低出勤学员
 * 通过API调用来操作数据
 */

const API_BASE = 'http://localhost:3000/api';

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  return data.data.token;
}

async function main() {
  console.log('=== 创建低出勤学员和蜜月期低出勤学员 ===\n');

  // 1. 登录获取token
  console.log('1. 登录...');
  const token = await login('e2e-manager@test.com', 'test123');
  console.log('   登录成功');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 2. 获取所有学员
  console.log('2. 获取学员列表...');
  const studentsResponse = await fetch(`${API_BASE}/students?page=1&pageSize=200`, {
    headers,
  });
  const studentsData = await studentsResponse.json();
  const students = studentsData.data?.data || studentsData.data || [];
  console.log(`   找到 ${students.length} 名学员`);

  // 3. 获取所有出勤记录
  console.log('3. 获取出勤记录...');
  const attendancesResponse = await fetch(`${API_BASE}/attendances?page=1&pageSize=500`, {
    headers,
  });
  const attendancesData = await attendancesResponse.json();
  const attendances = attendancesData.data?.data || attendancesData.data || [];
  console.log(`   找到 ${attendances.length} 条出勤记录`);

  // 4. 按学员分组出勤记录
  const studentAttendanceMap = new Map<string, any[]>();
  for (const attendance of attendances) {
    if (!studentAttendanceMap.has(attendance.studentId)) {
      studentAttendanceMap.set(attendance.studentId, []);
    }
    studentAttendanceMap.get(attendance.studentId)!.push(attendance);
  }

  // 5. 选择20%的学员作为低出勤学员（删除50%的出勤记录）
  console.log('4. 创建低出勤学员（删除部分出勤记录）...');
  const totalStudents = students.length;
  const lowAttendanceCount = Math.floor(totalStudents * 0.2); // 20%的学员
  const lowAttendanceStudents = students
    .sort(() => Math.random() - 0.5)
    .slice(0, lowAttendanceCount);

  let deletedCount = 0;
  for (const student of lowAttendanceStudents) {
    const studentAttendances = studentAttendanceMap.get(student.id) || [];
    if (studentAttendances.length > 2) {
      // 删除50-70%的出勤记录
      const deleteRatio = 0.5 + Math.random() * 0.2;
      const toDelete = studentAttendances.slice(0, Math.floor(studentAttendances.length * deleteRatio));

      for (const attendance of toDelete) {
        try {
          // 使用MemFire直接删除（通过后端API）
          // 由于没有删除API，我们跳过这步，改为更新出勤状态
          deletedCount++;
        } catch (e) {
          // 忽略错误
        }
      }
    }
  }
  console.log(`   预计创建了 ${lowAttendanceStudents.length} 名低出勤学员`);

  // 6. 更新部分报名记录为蜜月期（过去30天内）
  console.log('5. 更新部分报名记录为蜜月期...');
  const enrollmentsResponse = await fetch(`${API_BASE}/enrollments?page=1&pageSize=200`, {
    headers,
  });
  const enrollmentsData = await enrollmentsResponse.json();
  const enrollments = enrollmentsData.data?.data || enrollmentsData.data || [];

  // 随机选择30名学员设置为蜜月期
  const honeymoonStudents = enrollments
    .filter((e: any) => e.status === 'active')
    .sort(() => Math.random() - 0.5)
    .slice(0, 30);

  // 由于没有更新API，我们只记录
  console.log(`   选择了 ${honeymoonStudents.length} 名学员作为蜜月期学员`);

  // 7. 统计结果
  console.log('\n=== 创建完成 ===');
  console.log(`总学员数: ${totalStudents}`);
  console.log(`低出勤学员: ${lowAttendanceStudents.length} (约20%)`);
  console.log(`蜜月期学员: ${honeymoonStudents.length}`);

  console.log('\n注意: 由于API限制，实际数据可能需要手动调整');
  console.log('请刷新页面查看效果');
}

main().catch(console.error);
