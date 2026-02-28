/**
 * 更新E2E学员课时
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const MEMFIRE_URL = process.env.MEMFIRE_URL!;
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY!;

const memfireAdmin = createClient(MEMFIRE_URL, MEMFIRE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function updateLessons() {
  // 获取所有E2E学员
  const { data: students, error } = await memfireAdmin
    .from('students')
    .select('id, name')
    .like('id', 'e2e-student-%');

  if (error) {
    console.log('获取学员失败:', error);
    return;
  }

  console.log('找到E2E学员:', students?.length || 0);

  let updatedCount = 0;
  for (const student of students || []) {
    // 统计该学员的出勤记录数
    const { count } = await memfireAdmin
      .from('attendances')
      .select('*', { count: 'exact', head: true })
      .eq('studentId', student.id)
      .eq('status', 'present');

    // 初始20课时 - 已上课次数
    const initialLessons = 20;
    const remainingLessons = Math.max(0, initialLessons - (count || 0));

    // 更新学员课时
    const { error: updateError } = await memfireAdmin
      .from('students')
      .update({
        remainingLessons,
        totalLessonsPurchased: initialLessons,
      })
      .eq('id', student.id);

    if (!updateError) {
      updatedCount++;
    }
  }

  console.log('更新了', updatedCount, '个学员的课时');
}

updateLessons()
  .then(() => {
    console.log('完成');
    process.exit(0);
  })
  .catch((err) => {
    console.error('失败:', err);
    process.exit(1);
  });
