/**
 * E2E 测试数据创建脚本
 *
 * 使用方法：cd backend && npx tsx scripts/create-e2e-data.ts
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

// 获取测试机构和校区ID
async function getTestOrgAndCampus() {
  const { data: org } = await memfireAdmin
    .from('organizations')
    .select('*')
    .ilike('code', 'E2E%')
    .limit(1)
    .single();

  if (!org) {
    throw new Error('E2E测试机构不存在，请先运行 create-e2e-users.ts');
  }

  const { data: campus } = await memfireAdmin
    .from('campuses')
    .select('*')
    .ilike('code', 'E2E%')
    .limit(1)
    .single();

  if (!campus) {
    throw new Error('E2E测试校区不存在，请先运行 create-e2e-users.ts');
  }

  return { organizationId: org.id, campusId: campus.id };
}

// 获取E2E测试用户的真实ID
async function getE2EUserIds() {
  const { data: users } = await memfireAdmin
    .from('users')
    .select('*')
    .ilike('email', 'e2e-%@test.com');

  if (!users || users.length === 0) {
    throw new Error('E2E测试用户不存在，请先运行 create-e2e-users.ts');
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

// 创建鱼池资源（50条）
async function createLeads(organizationId: string, salesIds: string[]) {
  console.log('📊 创建鱼池资源（50条）...');

  for (let i = 1; i <= 50; i++) {
    const leadId = `e2e-lead-${i.toString().padStart(3, '0')}`;
    // 轮流分配给两个销售
    const assigneeId = salesIds[i % salesIds.length];
    const salesNames = ['E2E赵销售', 'E2E钱销售'];
    const assigneeName = salesNames[i % salesIds.length];
    const { error } = await memfireAdmin.from('leads').insert({
      id: leadId,
      organizationId,
      assigneeId,  // 关联销售ID
      assigneeName,  // 销售姓名
      customerName: `E2E线索客户${i.toString().padStart(3, '0')}`,
      age: 5 + (i % 8),
      contact: `139${Math.random().toString(36).substring(2, 10)}`,
      notes: 'E2E测试线索数据',
    });

    if (error) {
      console.log(`  ⚠️  线索 ${i} 创建失败或已存在: ${error.message}`);
    }
  }

  console.log('  ✅ 鱼池资源创建完成');
}

// 创建班级（42个）
async function createClasses(organizationId: string, campusId: string) {
  console.log('📊 创建班级（42个）...');

  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const timeStarts = ['10:00', '14:00', '19:00'];
  const courseTypes = ['精英班', '幼儿班'];
  const coaches = [
    { id: '7116045a-119d-4c95-86a7-30c089b97647', name: '张教练' },
    { id: '32e705b5-eac8-4821-8b1d-5241a5a2ed43', name: '李教练' },
    { id: '95f08ab1-f49a-4418-975e-967d3eee46ca', name: '王教练' },
  ];

  let count = 0;
  for (let day = 0; day < 7; day++) {
    for (let time = 0; time < 3; time++) {
      for (let type = 0; type < 2; type++) {
        count++;
        const coach = coaches[count % 3];
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
          teacherId: coach.id,
          status: 'active',
        });

        if (error) {
          console.log(`  ⚠️  班级 ${count} 创建失败或已存在`);
        }
      }
    }
  }

  console.log(`  ✅ 班级创建完成（${count}个）`);
}

// 创建学员（120个）
async function createStudents(organizationId: string, campusId: string) {
  console.log('📊 创建学员（120个）...');

  for (let i = 1; i <= 105; i++) {
    const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;
    const { error } = await memfireAdmin.from('students').insert({
      id: studentId,
      organizationId,
      campusId,
      name: `E2E学员${i.toString().padStart(3, '0')}`,
      gender: i % 2 === 0 ? '男' : '女',
      phone: `138${Math.random().toString(36).substring(2, 10)}`,
      parentPhone: `138${Math.random().toString(36).substring(2, 10)}`,
      status: 'active',
    });

    if (error) {
      console.log(`  ⚠️  学员 ${i} 创建失败或已存在`);
    }
  }

  // 创建15个流失学员
  for (let i = 106; i <= 120; i++) {
    const studentId = `e2e-student-${i.toString().padStart(3, '0')}`;
    const { error } = await memfireAdmin.from('students').insert({
      id: studentId,
      organizationId,
      campusId,
      name: `E2E流失学员${i - 105}`,
      gender: i % 2 === 0 ? '男' : '女',
      phone: `138${Math.random().toString(36).substring(2, 10)}`,
      parentPhone: `138${Math.random().toString(36).substring(2, 10)}`,
      status: 'inactive',
    });

    if (error) {
      console.log(`  ⚠️  流失学员 ${i} 创建失败或已存在`);
    }
  }

  console.log('  ✅ 学员创建完成（120个）');
}

// 主函数
async function createE2EData() {
  console.log('🚀 开始创建 E2E 测试数据...\n');

  const { organizationId, campusId } = await getTestOrgAndCampus();
  const userIds = await getE2EUserIds();

  console.log(`测试机构ID: ${organizationId}`);
  console.log(`测试校区ID: ${campusId}`);
  console.log('');

  // 准备销售ID列表
  const salesIds = [userIds.sales1, userIds.sales2].filter(Boolean);

  await createLeads(organizationId, salesIds);
  await createClasses(organizationId, campusId);
  await createStudents(organizationId, campusId);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 E2E 测试数据创建完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('测试数据统计：');
  console.log('  - 鱼池资源：50条');
  console.log('  - 班级：42个');
  console.log('  - 学员：120个（105个活跃 + 15个流失）');
  console.log('');
}

createE2EData()
  .then(() => {
    console.log('✅ 完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
