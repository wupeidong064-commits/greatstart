import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const MEMFIRE_URL = process.env.MEMFIRE_URL || '';
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY || '';

const memfireAdmin = createClient(MEMFIRE_URL, MEMFIRE_SERVICE_ROLE_KEY);

async function debugData() {
  // 获取E2E销售用户的ID
  const { data: salesUser } = await memfireAdmin
    .from('users')
    .select('*')
    .eq('email', 'e2e-sales1@test.com')
    .single();

  console.log('E2E销售用户:');
  console.log('  ID:', salesUser?.id);
  console.log('  Name:', salesUser?.name);
  console.log('  CampusId:', salesUser?.campusId);
  console.log('  OrgId:', salesUser?.organizationId);

  // 查询E2E鱼池数据
  const { data: leads } = await memfireAdmin
    .from('leads')
    .select('*')
    .ilike('id', 'e2e-lead-%')
    .limit(5);

  console.log('\nE2E鱼池数据样例:');
  leads?.forEach(lead => {
    console.log('  -', lead.id);
    console.log('    assigneeId:', lead.assigneeId);
    console.log('    org:', lead.organizationId);
  });

  // 检查是否匹配
  const { data: matchingLeads } = await memfireAdmin
    .from('leads')
    .select('*')
    .eq('assigneeId', salesUser?.id || '');

  console.log('\n匹配该销售的数据:', matchingLeads?.length || 0);

  // 查询所有leads数据
  const { data: allLeads } = await memfireAdmin
    .from('leads')
    .select('*');

  console.log('\n总leads数据:', allLeads?.length || 0);

  process.exit(0);
}

debugData().catch(console.error);
