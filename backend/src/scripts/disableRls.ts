/**
 * 禁用 MemFire RLS（回滚脚本）
 *
 * 使用方法：
 * cd backend && npm run disable-rls
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ 缺少环境变量: DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('========================================');
  console.log('  禁用 MemFire RLS 策略');
  console.log('========================================\n');

  const tables = ['users', 'classes', 'students', 'leads', 'schedules', 'attendances', 'enrollments', 'organizations', 'campuses'];

  console.log('🔓 禁用 RLS...\n');

  for (const table of tables) {
    try {
      await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
      console.log(`  ✓ ${table} RLS 已禁用`);
    } catch (error: any) {
      console.log(`  ⚠️  ${table}: ${error.message}`);
    }
  }

  console.log('\n🗑️  删除辅助函数...\n');

  const functions = [
    'get_current_user_id',
    'get_current_user_role',
    'get_current_user_campus_id',
    'get_current_user_org_id',
    'is_admin_or_manager',
    'is_coach',
    'is_sales',
  ];

  for (const fn of functions) {
    try {
      await pool.query(`DROP FUNCTION IF EXISTS ${fn}() CASCADE;`);
      console.log(`  ✓ ${fn}() 已删除`);
    } catch (error: any) {
      console.log(`  ⚠️  ${fn}(): ${error.message}`);
    }
  }

  console.log('\n========================================');
  console.log('  ✅ RLS 已完全禁用！');
  console.log('========================================\n');

  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 禁用失败:', error);
    pool.end();
    process.exit(1);
  });
