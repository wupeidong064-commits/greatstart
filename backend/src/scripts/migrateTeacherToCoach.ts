/**
 * 将 users 表中 role = 'teacher' 的记录迁移为 'coach'
 *
 * 使用方法：
 * cd backend && npm run migrate-teacher-to-coach
 *
 * 或直接运行：
 * tsx src/scripts/migrateTeacherToCoach.ts
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
dotenv.config();

const memfireUrl = process.env.MEMFIRE_URL;
const memfireServiceKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;

if (!memfireUrl || !memfireServiceKey) {
  console.error('❌ 缺少环境变量: MEMFIRE_URL 和 MEMFIRE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建 Admin 客户端（使用 service_role key，可以绕过 RLS）
const memfire = createClient(memfireUrl, memfireServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log('========================================');
  console.log('  Teacher → Coach 角色迁移');
  console.log('========================================\n');

  // 1. 查询当前有多少 teacher 角色的用户
  console.log('📊 查询 teacher 角色用户...');
  const { data: teacherUsers, error: queryError } = await memfire
    .from('users')
    .select('id, email, name, role')
    .eq('role', 'teacher');

  if (queryError) {
    console.error('❌ 查询失败:', queryError.message);
    process.exit(1);
  }

  if (!teacherUsers || teacherUsers.length === 0) {
    console.log('✅ 没有需要迁移的用户（已全部是 coach 或其他角色）\n');
    return;
  }

  console.log(`发现 ${teacherUsers.length} 个 teacher 角色用户：`);
  teacherUsers.forEach((user, index) => {
    console.log(`  ${index + 1}. ${user.email} (${user.name || 'N/A'})`);
  });
  console.log('');

  // 2. 执行迁移
  console.log('🔄 开始迁移...');
  const { error: updateError, count } = await memfire
    .from('users')
    .update({ role: 'coach' })
    .eq('role', 'teacher')
    .select('id');

  if (updateError) {
    console.error('❌ 迁移失败:', updateError.message);
    process.exit(1);
  }

  console.log(`✅ 成功迁移 ${count || teacherUsers.length} 个用户\n`);

  // 3. 验证迁移结果
  console.log('🔍 验证迁移结果...');
  const { data: remainingTeachers, error: verifyError } = await memfire
    .from('users')
    .select('id, email')
    .eq('role', 'teacher');

  if (verifyError) {
    console.error('❌ 验证失败:', verifyError.message);
    process.exit(1);
  }

  if (remainingTeachers && remainingTeachers.length > 0) {
    console.log(`⚠️  仍有 ${remainingTeachers.length} 个 teacher 角色用户未迁移`);
  } else {
    console.log('✅ 所有 teacher 角色已成功迁移为 coach');
  }

  // 4. 显示 coach 角色统计
  const { data: coachUsers, error: statsError } = await memfire
    .from('users')
    .select('id, email, name')
    .eq('role', 'coach');

  if (!statsError && coachUsers) {
    console.log(`\n📊 当前 coach 角色用户数量: ${coachUsers.length}`);
  }

  console.log('\n========================================');
  console.log('  迁移完成！');
  console.log('========================================\n');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 迁移异常:', error);
    process.exit(1);
  });
