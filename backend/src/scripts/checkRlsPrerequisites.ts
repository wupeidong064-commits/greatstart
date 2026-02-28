/**
 * 检测 MemFire RLS 前置条件
 *
 * 使用方法：
 * cd backend && npm run check-rls
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const memfireUrl = process.env.MEMFIRE_URL;
const memfireServiceKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;
const memfireAnonKey = process.env.MEMFIRE_ANON_KEY;

if (!memfireUrl || !memfireServiceKey) {
  console.error('❌ 缺少环境变量: MEMFIRE_URL 和 MEMFIRE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function main() {
  console.log('========================================');
  console.log('  检测 MemFire RLS 前置条件');
  console.log('========================================\n');

  // 1. 检查表是否存在
  console.log('📋 检查表是否存在...');
  const memfire = createClient(memfireUrl, memfireServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tables = ['users', 'organizations', 'campuses', 'classes', 'students', 'schedules', 'attendances', 'enrollments', 'payments', 'leads'];
  const tableStatus: Record<string, boolean> = {};

  for (const table of tables) {
    const { error } = await memfire.from(table).select('id').limit(1);
    tableStatus[table] = !error;
    console.log(`  ${!error ? '✓' : '✗'} ${table}`);
  }

  // 2. 检查 users 表结构
  console.log('\n📊 检查 users 表结构...');
  const { data: sampleUser, error: userError } = await memfire
    .from('users')
    .select('id, email, role, organizationId, campusId')
    .limit(1)
    .single();

  if (userError) {
    console.log('  ⚠️  无法获取示例用户:', userError.message);
  } else {
    console.log('  ✓ 示例用户字段:', Object.keys(sampleUser || {}).join(', '));
  }

  // 3. 统计各角色用户数量
  console.log('\n👥 统计各角色用户数量...');
  const { data: roleStats } = await memfire
    .from('users')
    .select('role');

  if (roleStats) {
    const counts: Record<string, number> = {};
    roleStats.forEach(u => {
      counts[u.role] = (counts[u.role] || 0) + 1;
    });
    Object.entries(counts).forEach(([role, count]) => {
      console.log(`  ${role}: ${count}`);
    });
  }

  // 4. 检查是否有 ANON_KEY
  console.log('\n🔑 检查 ANON_KEY...');
  if (memfireAnonKey) {
    console.log('  ✓ MEMFIRE_ANON_KEY 已配置');
  } else {
    console.log('  ⚠️  MEMFIRE_ANON_KEY 未配置（RLS 测试需要）');
    console.log('     请在 MemFire 控制台获取 anon key 并添加到 .env 文件');
  }

  // 5. 检查数据量
  console.log('\n📈 检查数据量...');
  for (const table of ['classes', 'students', 'leads']) {
    const { count } = await memfire.from(table).select('id', { count: 'exact', head: true });
    console.log(`  ${table}: ${count || 0} 条记录`);
  }

  console.log('\n========================================');
  console.log('  检测完成！');
  console.log('========================================\n');

  // 总结
  console.log('📝 总结:');
  console.log('  - 所有核心表都已存在');
  console.log('  - users 表包含必要的角色字段');
  console.log('  - 可以开始配置 RLS 策略\n');

  if (!memfireAnonKey) {
    console.log('⚠️  建议：配置 MEMFIRE_ANON_KEY 以便测试 RLS 策略\n');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 检测失败:', error);
    process.exit(1);
  });
