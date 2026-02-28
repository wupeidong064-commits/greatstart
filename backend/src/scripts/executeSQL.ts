/**
 * 执行 SQL 修复脚本
 * 通过 MemFire REST API 执行 SQL
 */

import 'dotenv/config';

// 从环境变量获取 MemFire 配置
const MEMFIRE_URL = process.env.MEMFIRE_URL || '';
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY || '';

async function executeSQL(sql: string): Promise<any> {
  const url = `${MEMFIRE_URL}/rest/v1/rpc/exec_sql`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': MEMFIRE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${MEMFIRE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SQL 执行失败: ${error}`);
  }

  return await response.json();
}

async function fixDatabase() {
  console.log('开始执行数据库修复...\n');

  const sqlStatements = [
    // 1. leads 表添加 status 列
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'new';`,

    // 2. 确保 leads 表其他必要列存在
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS "assigneeId" UUID;`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS "assigneeName" VARCHAR(100);`,

    // 3. 为 leads 表 status 列创建索引
    `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);`,

    // 4. 确保 enrollments 表必要列存在
    `ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`,

    // 5. 为 enrollments 表创建索引
    `CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);`,
    `CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments("studentId");`,
    `CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments("classId");`,
  ];

  for (let i = 0; i < sqlStatements.length; i++) {
    const sql = sqlStatements[i];
    console.log(`[${i + 1}/${sqlStatements.length}] 执行: ${sql.substring(0, 50)}...`);

    try {
      const result = await executeSQL(sql);
      console.log(`   ✅ 成功`);
    } catch (error: any) {
      console.log(`   ⚠️  ${error.message}`);
      // 继续执行其他 SQL，因为可能列已存在
    }
  }

  console.log('\n数据库修复完成！');
}

fixDatabase().catch(console.error);
