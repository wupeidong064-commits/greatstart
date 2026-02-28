/**
 * 直接使用 PostgreSQL 连接执行 SQL
 */

import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

// 解析 DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || '';

async function fixDatabase() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    console.log('连接数据库...');
    await client.connect();
    console.log('✅ 数据库连接成功\n');

    const sqlStatements = [
      // 1. leads 表添加 status 列
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT \'new\';',
      // 2. 确保 leads 表其他必要列存在
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS "assigneeId" UUID;',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS "assigneeName" VARCHAR(100);',
      // 3. 为 leads 表 status 列创建索引
      'CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);',
      // 4. 确保 enrollments 表必要列存在
      'ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT \'active\';',
      // 5. 为 enrollments 表创建索引
      'CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);',
      'CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments("studentId");',
      'CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments("classId");',
    ];

    for (let i = 0; i < sqlStatements.length; i++) {
      const sql = sqlStatements[i];
      console.log(`[${i + 1}/${sqlStatements.length}] 执行: ${sql.substring(0, 50)}...`);

      try {
        await client.query(sql);
        console.log('   ✅ 成功');
      } catch (error: any) {
        // 如果是"已存在"错误，可以忽略
        if (error.message?.includes('already exists') || error.message?.includes('duplicate column')) {
          console.log('   ✅ 已存在（跳过）');
        } else {
          console.log(`   ⚠️  ${error.message}`);
        }
      }
    }

    console.log('\n数据库修复完成！');
  } catch (error) {
    console.error('数据库连接失败:', error);
  } finally {
    await client.end();
  }
}

fixDatabase().catch(console.error);
