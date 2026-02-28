/**
 * E2E 测试账号创建脚本
 *
 * 使用方法：
 * 1. 确保 backend/.env 中配置了 MEMFIRE_URL 和 MEMFIRE_SERVICE_ROLE_KEY
 * 2. 运行: cd backend && npx tsx scripts/create-e2e-users.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const MEMFIRE_URL = process.env.MEMFIRE_URL!;
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY!;

if (!MEMFIRE_URL || !MEMFIRE_SERVICE_ROLE_KEY) {
  console.error('❌ 缺少环境变量: MEMFIRE_URL 或 MEMFIRE_SERVICE_ROLE_KEY');
  console.error('请在 backend/.env 中配置这些变量');
  process.exit(1);
}

// 创建 MemFire Admin 客户端
const memfireAdmin = createClient(MEMFIRE_URL, MEMFIRE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// E2E 测试用户列表
const E2E_USERS = [
  { id: 'e2e-admin-001', email: 'e2e-admin@test.com', password: 'test123', name: 'E2E测试管理员', role: 'admin' },
  { id: 'e2e-manager-001', email: 'e2e-manager@test.com', password: 'test123', name: 'E2E测试管理者', role: 'manager' },
  { id: 'e2e-coach-001', email: 'e2e-coach1@test.com', password: 'test123', name: 'E2E张教练', role: 'coach' },
  { id: 'e2e-coach-002', email: 'e2e-coach2@test.com', password: 'test123', name: 'E2E李教练', role: 'coach' },
  { id: 'e2e-coach-003', email: 'e2e-coach3@test.com', password: 'test123', name: 'E2E王教练', role: 'coach' },
  { id: 'e2e-sales-001', email: 'e2e-sales1@test.com', password: 'test123', name: 'E2E赵销售', role: 'sales' },
  { id: 'e2e-sales-002', email: 'e2e-sales2@test.com', password: 'test123', name: 'E2E钱销售', role: 'sales' },
];

// 获取或创建测试机构
async function getOrCreateOrganization() {
  // 先检查是否已存在旧的E2E机构
  const { data: oldOrg } = await memfireAdmin
    .from('organizations')
    .select('*')
    .ilike('code', 'E2E%')
    .limit(1)
    .single();

  if (oldOrg) {
    console.log(`  ℹ️  找到旧的E2E机构: ${oldOrg.id}，删除后重建...`);
    // 删除旧的E2E机构数据
    await memfireAdmin.from('users').delete().ilike('email', 'e2e-%@test.com');
    await new Promise(resolve => setTimeout(resolve, 500));
    await memfireAdmin.from('campuses').delete().eq('organizationId', oldOrg.id);
    await new Promise(resolve => setTimeout(resolve, 500));
    await memfireAdmin.from('organizations').delete().eq('id', oldOrg.id);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 使用标准UUID格式创建新机构
  const { data: newOrg } = await memfireAdmin
    .from('organizations')
    .insert({
      id: randomUUID(), // 使用标准UUID
      name: 'E2E测试机构',
      code: 'E2E-TEST-ORG',
    })
    .select()
    .single();

  console.log(`  ✅ 创建测试机构: ${newOrg?.id}`);
  return newOrg?.id;
}

// 获取或创建测试校区
async function getOrCreateCampus(organizationId: string) {
  const { data: newCamp } = await memfireAdmin
    .from('campuses')
    .insert({
      id: randomUUID(), // 使用标准UUID
      organizationId,
      name: 'E2E测试校区',
      code: 'E2E-CAMPUS',
    })
    .select()
    .single();

  console.log(`  ✅ 创建测试校区: ${newCamp?.id}`);
  return newCamp?.id;
}

// 创建用户数据库记录
async function createUserRecord(authUserId: string, user: any, organizationId: string, campusId: string) {
  const { error } = await memfireAdmin
    .from('users')
    .insert({
      id: authUserId,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId,
      campusId,
    });

  if (error) {
    throw new Error(`数据库插入失败: ${error.message}`);
  }
  console.log(`  ✅ 数据库用户创建成功`);
}

async function createE2EUsers() {
  console.log('🚀 开始创建 E2E 测试用户...\n');

  // 首先获取或创建测试机构和校区
  const organizationId = await getOrCreateOrganization();
  const campusId = await getOrCreateCampus(organizationId);

  console.log('');
  console.log(`测试机构ID: ${organizationId}`);
  console.log(`测试校区ID: ${campusId}`);
  console.log('');

  for (const user of E2E_USERS) {
    try {
      console.log(`📧 处理用户: ${user.email} (${user.role})`);

      // 1. 在 MemFire Auth 中创建或获取用户
      let authUserId = user.id;
      let authError: any = null;

      // 尝试创建用户
      const { data: authData, error: createError } = await memfireAdmin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          name: user.name,
          role: user.role,
        },
      });

      authError = createError;

      if (authError) {
        if (authError.message.includes('already') || authError.message.includes('taken')) {
          // 用户已存在，获取现有用户
          console.log(`  ℹ️  Auth 用户已存在，获取ID...`);
          const { data: { users } } = await memfireAdmin.auth.admin.listUsers();
          const existingUser = users?.find((u: any) => u.email === user.email);
          if (existingUser) {
            authUserId = existingUser.id;
            console.log(`  ✅ Auth 用户ID: ${authUserId}`);
          }
        } else {
          throw new Error(`Auth 创建失败: ${authError.message}`);
        }
      } else {
        authUserId = authData.user.id;
        console.log(`  ✅ Auth 用户创建成功 (ID: ${authUserId})`);
      }

      // 2. 处理数据库用户记录
      const { data: existingUser, error: fetchError } = await memfireAdmin
        .from('users')
        .select('*')
        .eq('email', user.email)
        .single();

      if (existingUser) {
        // 用户已存在，检查 ID 是否匹配
        if (existingUser.id !== authUserId) {
          console.log(`  ℹ️  数据库用户ID不匹配，删除旧记录并重建...`);
          // 删除旧记录
          await memfireAdmin.from('users').delete().eq('email', user.email);
          await new Promise(resolve => setTimeout(resolve, 500));
          // 创建新记录
          await createUserRecord(authUserId, user, organizationId, campusId);
        } else {
          console.log(`  ℹ️  数据库用户已存在，更新角色`);
          await memfireAdmin
            .from('users')
            .update({ role: user.role, organizationId, campusId })
            .eq('email', user.email);
          console.log(`  ✅ 数据库用户更新成功`);
        }
      } else {
        // 创建新用户
        await createUserRecord(authUserId, user, organizationId, campusId);
      }

      console.log('');

    } catch (error: any) {
      console.error(`❌ 处理用户 ${user.email} 时出错:`, error.message);
      console.log('');
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 E2E 测试账号创建完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('测试账号信息：');
  E2E_USERS.forEach(user => {
    console.log(`  👤 ${user.name}`);
    console.log(`     邮箱: ${user.email}`);
    console.log(`     密码: ${user.password}`);
    console.log(`     角色: ${user.role}`);
    console.log('');
  });
}

createE2EUsers()
  .then(() => {
    console.log('✅ 完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
