/**
 * 清除所有测试数据，保留表结构
 *
 * 使用方法：
 * npm run clean-db
 *
 * 注意：
 * 1. 此脚本会删除所有表中的数据
 * 2. 表结构会被保留
 * 3. 需要配置 MEMFIRE_URL 和 MEMFIRE_SERVICE_ROLE_KEY 环境变量
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

/**
 * 表定义及删除顺序
 * 注意：需要考虑外键依赖关系，先删除被其他表引用的表
 */
const TABLES = [
  // 统计相关
  'settings',

  // 业务数据（先删除明细，再删除主表）
  'attendances',        // 出勤记录
  'lesson_logs',        // 课程日志
  'schedules',          // 排课记录
  'enrollments',        // 报名记录
  'experience_lessons', // 体验课
  'conversions',        // 转化记录
  'leads',              // 线索/鱼池
  'students',           // 学员
  'classes',            // 班级

  // 组织架构
  'campuses',           // 校区
  'organizations',      // 机构

  // 用户（最后删除，因为很多表都引用它）
  'users',              // 用户表
];

/**
 * 删除单个表的所有数据
 */
async function truncateTable(tableName: string): Promise<boolean> {
  try {
    // 使用 DELETE 删除所有数据（PostgreSQL/MemFire 不支持 TRUNCATE）
    const { error, count } = await memfire
      .from(tableName)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // 永真条件，删除所有记录

    if (error) {
      console.error(`  ❌ 删除 ${tableName} 失败:`, error.message);
      return false;
    }

    console.log(`  ✓ ${tableName}: 已删除 ${count || 0} 条记录`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ 删除 ${tableName} 异常:`, error.message);
    return false;
  }
}

/**
 * 清除 MemFire Auth 中的所有用户
 * 注意：这会删除所有认证用户，包括管理员
 */
async function cleanAuthUsers(): Promise<boolean> {
  try {
    const { data: { users }, error } = await memfire.auth.admin.listUsers();

    if (error) {
      console.error('  ❌ 获取 Auth 用户失败:', error.message);
      return false;
    }

    if (!users || users.length === 0) {
      console.log('  ✓ Auth 用户表为空');
      return true;
    }

    console.log(`  ℹ 发现 ${users.length} 个 Auth 用户，开始删除...`);

    let deletedCount = 0;
    for (const user of users) {
      try {
        const { error: deleteError } = await memfire.auth.admin.deleteUser(user.id);
        if (deleteError) {
          console.error(`    ❌ 删除用户 ${user.email} 失败:`, deleteError.message);
        } else {
          deletedCount++;
        }
      } catch (err: any) {
        console.error(`    ❌ 删除用户 ${user.email} 异常:`, err.message);
      }
    }

    console.log(`  ✓ Auth 用户: 已删除 ${deletedCount}/${users.length} 个用户`);
    return true;
  } catch (error: any) {
    console.error('  ❌ 清除 Auth 用户异常:', error.message);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('  清除 MemFire 数据库测试数据');
  console.log('========================================\n');

  // 确认操作
  console.log('⚠️  警告：此操作将删除所有表中的数据！');
  console.log('⚠️  表结构会被保留，但所有数据将无法恢复。\n');

  // 如果不是生产环境，可以自动确认；否则需要手动确认
  const isProduction = memfireUrl.includes('production') || memfireUrl.includes('prod');
  if (isProduction) {
    console.log('❌ 检测到生产环境，为安全起见，拒绝执行清理操作！');
    process.exit(1);
  }

  console.log('开始清理...\n');

  // 1. 清除数据库表
  console.log('📊 清除数据库表：');
  console.log('────────────────────────────────────────');
  let successCount = 0;
  let failCount = 0;

  for (const table of TABLES) {
    const success = await truncateTable(table);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('────────────────────────────────────────');
  console.log(`数据库表清理完成: ${successCount} 成功, ${failCount} 失败\n`);

  // 2. 清除 Auth 用户
  console.log('🔐 清除 Auth 用户：');
  console.log('────────────────────────────────────────');
  await cleanAuthUsers();
  console.log('────────────────────────────────────────\n');

  console.log('========================================');
  console.log('  ✅ 数据清理完成！');
  console.log('========================================\n');
  console.log('💡 提示：');
  console.log('   1. 表结构已保留');
  console.log('   2. 所有数据已清空');
  console.log('   3. 需要重新创建管理员账户才能登录\n');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 清理失败:', error);
    process.exit(1);
  });
