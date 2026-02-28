import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const MEMFIRE_URL = process.env.MEMFIRE_URL || '';
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY || '';

if (!MEMFIRE_URL || !MEMFIRE_SERVICE_ROLE_KEY) {
  console.error('❌ 缺少环境变量');
  process.exit(1);
}

const memfireAdmin = createClient(MEMFIRE_URL, MEMFIRE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function cleanE2EData() {
  console.log('清理旧的E2E测试数据...');

  // 删除E2E测试鱼池数据
  const { error: leadsError } = await memfireAdmin
    .from('leads')
    .delete()
    .ilike('id', 'e2e-lead-%');
  console.log('鱼池数据清理:', leadsError?.message || '完成');

  // 删除E2E测试班级
  const { error: classesError } = await memfireAdmin
    .from('classes')
    .delete()
    .ilike('code', 'E2E%');
  console.log('班级数据清理:', classesError?.message || '完成');

  // 删除E2E测试学员
  const { error: studentsError } = await memfireAdmin
    .from('students')
    .delete()
    .ilike('name', 'E2E%');
  console.log('学员数据清理:', studentsError?.message || '完成');

  console.log('✅ 清理完成！');
  process.exit(0);
}

cleanE2EData().catch(console.error);
