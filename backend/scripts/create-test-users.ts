/**
 * 开发环境创建测试用户脚本
 * 运行: npx tsx scripts/create-test-users.ts
 */

import { createClient } from '@supabase/supabase-js';

// MemFire 配置 - 从环境变量获取
const MEMFIRE_URL = process.env.MEMFIRE_URL || 'https://d4r9c60g91htqli3v480.baseapi.memfiredb.com';
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY || '';

if (!MEMFIRE_SERVICE_ROLE_KEY) {
  console.error('错误: 请设置 MEMFIRE_SERVICE_ROLE_KEY 环境变量');
  process.exit(1);
}

const supabase = createClient(MEMFIRE_URL, MEMFIRE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestUser {
  email: string;
  password: string;
  name: string;
  role: string;
  organizationId?: string;
}

async function createTestUser(user: TestUser) {
  console.log(`\n创建用户: ${user.email}`);

  // 1. 检查 Auth 用户是否已存在
  const { data: existingAuthUser } = await supabase.auth.admin.listUsers();
  const found = existingAuthUser.users.find(u => u.email === user.email);

  let authUserId: string;

  if (found) {
    console.log(`  Auth 用户已存在: ${found.id}`);
    authUserId = found.id;
  } else {
    // 创建 Auth 用户
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        name: user.name,
      },
    });

    if (authError) {
      console.error(`  创建 Auth 用户失败: ${authError.message}`);
      return null;
    }

    authUserId = authData.user.id;
    console.log(`  Auth 用户创建成功: ${authUserId}`);
  }

  // 2. 检查 users 表是否有记录
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUserId)
    .maybeSingle();

  if (existingUser) {
    console.log(`  users 表记录已存在`);
    return authUserId;
  }

  // 3. 在 users 表创建记录
  const { error: userError } = await supabase
    .from('users')
    .insert({
      id: authUserId,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId || null,
      isActive: true,
    });

  if (userError) {
    console.error(`  创建 users 表记录失败: ${userError.message}`);
    return null;
  }

  console.log(`  users 表记录创建成功`);
  return authUserId;
}

async function main() {
  console.log('====================================');
  console.log('创建测试用户');
  console.log('====================================');

  // 首先获取第一个组织ID
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .limit(1);

  const organizationId = orgs?.[0]?.id;
  console.log(`\n使用组织: ${orgs?.[0]?.name || '无'} (${organizationId || '无ID'})`);

  const testUsers: TestUser[] = [
    {
      email: 'e2e-admin@test.com',
      password: 'test123',
      name: 'E2E测试管理员',
      role: 'admin',
    },
    {
      email: 'e2e-manager@test.com',
      password: 'test123',
      name: 'E2E测试经理',
      role: 'manager',
      organizationId,
    },
    {
      email: 'e2e-coach@test.com',
      password: 'test123',
      name: 'E2E测试教练',
      role: 'coach',
      organizationId,
    },
    {
      email: 'e2e-sales@test.com',
      password: 'test123',
      name: 'E2E测试销售',
      role: 'sales',
      organizationId,
    },
  ];

  let successCount = 0;
  for (const user of testUsers) {
    const result = await createTestUser(user);
    if (result) successCount++;
  }

  console.log('\n====================================');
  console.log(`完成! 成功创建/更新 ${successCount}/${testUsers.length} 个用户`);
  console.log('====================================');
  console.log('\n测试账号:');
  testUsers.forEach(u => {
    console.log(`  ${u.email} / ${u.password} (${u.role})`);
  });
}

main().catch(console.error);
