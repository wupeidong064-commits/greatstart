/**
 * 测试 MemFire RLS 策略
 *
 * 使用方法：
 * cd backend && npm run test-rls
 *
 * 注意：需要在 .env 中配置 MEMFIRE_ANON_KEY
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

// 同时加载 .env 和 .env.local
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const memfireUrl = process.env.MEMFIRE_URL;
const anonKey = process.env.MEMFIRE_ANON_KEY || process.env.VITE_MEMFIRE_ANON_KEY;
const serviceKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;

if (!memfireUrl || !anonKey) {
  console.error('❌ 缺少环境变量: MEMFIRE_URL 和 MEMFIRE_ANON_KEY');
  console.log('\n请在 .env 文件中添加 MEMFIRE_ANON_KEY（从 MemFire 控制台获取）');
  process.exit(1);
}

// 创建不同角色的客户端
const createAnonClient = () => createClient(memfireUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const serviceClient = createClient(memfireUrl, serviceKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 测试账号
const TEST_ACCOUNTS = {
  admin: { email: 'buzzerwupeidong@qq.com', password: '123456' },
  manager: { email: '1@qq.com', password: '123456' },
  coach: { email: '2@qq.com', password: '123456' },
  sales: { email: '3@qq.com', password: '123456' },
};

async function signInAs(role: keyof typeof TEST_ACCOUNTS) {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: TEST_ACCOUNTS[role].email,
    password: TEST_ACCOUNTS[role].password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // 创建带用户 token 的客户端
  const authClient = createClient(memfireUrl, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${data.session?.access_token}`,
      },
    },
  });

  return { success: true, client: authClient, user: data.user };
}

async function testTableAccess(client: any, tableName: string, expectedBehavior: string) {
  try {
    const { data, error, count } = await client
      .from(tableName)
      .select('id', { count: 'exact' })
      .limit(10);

    if (error) {
      return { success: false, count: 0, error: error.message };
    }

    return { success: true, count: count || 0, behavior: expectedBehavior };
  } catch (e: any) {
    return { success: false, count: 0, error: e.message };
  }
}

async function main() {
  console.log('========================================');
  console.log('  测试 MemFire RLS 策略');
  console.log('========================================\n');

  // 1. 使用 service_role 验证数据量（绕过 RLS）
  console.log('📊 使用 service_role 查询数据总量（绕过 RLS）...\n');

  const tables = ['users', 'classes', 'students', 'leads', 'schedules', 'attendances', 'enrollments', 'organizations', 'campuses'];

  for (const table of tables) {
    const { count, error } = await serviceClient
      .from(table)
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.log(`  ${table}: 查询失败 - ${error.message}`);
    } else {
      console.log(`  ${table}: ${count} 条记录`);
    }
  }

  // 2. 测试不同角色的数据访问
  console.log('\n🔐 测试不同角色的 RLS 策略...\n');

  for (const role of ['admin', 'manager', 'coach', 'sales'] as const) {
    console.log(`\n--- ${role.toUpperCase()} 角色 ---`);

    const result = await signInAs(role);

    if (!result.success) {
      console.log(`  ❌ 登录失败: ${result.error}`);
      continue;
    }

    console.log(`  ✓ 登录成功: ${TEST_ACCOUNTS[role].email}`);

    const { client } = result;

    // 测试 users 表
    const usersResult = await testTableAccess(client, 'users', 'admin/manager 看全部，其他只看自己');
    console.log(`  users: ${usersResult.success ? `✓ ${usersResult.count} 条` : `✗ ${usersResult.error}`}`);

    // 测试 classes 表
    const classesResult = await testTableAccess(client, 'classes', '按角色/校区/教师过滤');
    console.log(`  classes: ${classesResult.success ? `✓ ${classesResult.count} 条` : `✗ ${classesResult.error}`}`);

    // 测试 students 表
    const studentsResult = await testTableAccess(client, 'students', '按角色/校区/教师过滤');
    console.log(`  students: ${studentsResult.success ? `✓ ${studentsResult.count} 条` : `✗ ${studentsResult.error}`}`);

    // 测试 leads 表
    const leadsResult = await testTableAccess(client, 'leads', '按机构过滤');
    console.log(`  leads: ${leadsResult.success ? `✓ ${leadsResult.count} 条` : `✗ ${leadsResult.error}`}`);

    // 测试 schedules 表
    const schedulesResult = await testTableAccess(client, 'schedules', '按角色/校区/教师过滤');
    console.log(`  schedules: ${schedulesResult.success ? `✓ ${schedulesResult.count} 条` : `✗ ${schedulesResult.error}`}`);

    // 登出
    await client.auth.signOut();
  }

  console.log('\n========================================');
  console.log('  测试完成！');
  console.log('========================================\n');

  console.log('📝 结果说明：');
  console.log('  - 如果 RLS 正常工作，不同角色看到的数据量应该不同');
  console.log('  - admin/manager 应该能看到更多数据');
  console.log('  - coach/sales 应该只能看到与自己相关的数据\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  });
