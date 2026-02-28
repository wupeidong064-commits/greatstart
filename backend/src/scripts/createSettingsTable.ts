/**
 * 创建 settings 表的脚本
 * 运行: npx tsx src/scripts/createSettingsTable.ts
 */

import 'dotenv/config';
import { memfireAdmin } from '../config/memfire';

async function createSettingsTable() {
  console.log('开始创建 settings 表...');

  try {
    // 使用 RPC 执行原始 SQL
    const { error } = await memfireAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS settings (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          key VARCHAR(100) NOT NULL,
          value TEXT NOT NULL,
          "organizationId" UUID NOT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(key, "organizationId")
        );
      `
    });

    // 如果 RPC 不可用，尝试直接创建表
    if (error) {
      console.log('RPC 方式不可用，尝试直接创建表...');

      // 检查表是否存在
      const { data: existingTable, error: checkError } = await memfireAdmin
        .from('settings')
        .select('id')
        .limit(1);

      if (!checkError) {
        console.log('✅ settings 表已存在');
        return;
      }

      console.log('表不存在，请手动在 MemFire 控制台执行以下 SQL:');
      console.log('');
      console.log(`-- 在 MemFire SQL 编辑器中执行:
CREATE TABLE IF NOT EXISTS settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(key, "organizationId")
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_settings_organization ON settings("organizationId");
`);
      return;
    }

    console.log('✅ settings 表创建成功');
  } catch (err) {
    console.error('创建表失败:', err);
    console.log('');
    console.log('请在 MemFire 控制台手动执行 SQL 创建表');
  }
}

createSettingsTable();
