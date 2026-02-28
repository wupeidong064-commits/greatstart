/**
 * 修复数据库表结构
 * 运行: npx tsx src/scripts/fixDatabase.ts
 */

import 'dotenv/config';
import { memfireAdmin } from '../config/memfire';

async function fixDatabase() {
  console.log('开始修复数据库表结构...\n');

  // 1. 检查并添加 leads 表的 status 列
  console.log('1. 检查 leads 表...');
  try {
    const { error } = await memfireAdmin
      .from('leads')
      .select('status')
      .limit(1);

    if (error && error.message?.includes('column')) {
      console.log('   leads 表缺少 status 列，请手动在 MemFire 执行:');
      console.log('   ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT \'new\';');
      console.log('');
    } else {
      console.log('   ✅ leads 表 status 列已存在');
    }
  } catch (e) {
    console.log('   检查失败:', e);
  }

  // 2. 检查 settings 表
  console.log('2. 检查 settings 表...');
  try {
    const { error } = await memfireAdmin
      .from('settings')
      .select('id')
      .limit(1);

    if (error) {
      console.log('   settings 表可能不存在，请手动在 MemFire 执行创建表 SQL');
      console.log('');
    } else {
      console.log('   ✅ settings 表存在');
    }
  } catch (e) {
    console.log('   检查失败:', e);
  }

  console.log('\n完成检查。如果有缺失，请在 MemFire SQL 编辑器中执行以下 SQL:');
  console.log(`
-- ==================================================
-- 修复数据库表结构
-- ==================================================

-- 1. leads 表添加 status 列
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'new';

-- 2. 确保其他必要列存在
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "assigneeId" UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "assigneeName" VARCHAR(100);

-- 3. 为 status 列创建索引（可选）
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
`);
}

fixDatabase();
