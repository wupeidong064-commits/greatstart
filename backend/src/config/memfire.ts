import { createClient } from '@supabase/supabase-js';

let _memfireAdmin: ReturnType<typeof createClient> | null = null;

function getMemfireAdmin() {
  if (_memfireAdmin) {
    return _memfireAdmin;
  }

  const memfireUrl = process.env.MEMFIRE_URL;
  const memfireServiceKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;

  if (!memfireUrl || !memfireServiceKey) {
    throw new Error('缺少 MemFire 环境变量: MEMFIRE_URL 和 MEMFIRE_SERVICE_ROLE_KEY');
  }

  // 创建 Admin 客户端（使用 service_role key，可以绕过 RLS 和邮箱验证）
  _memfireAdmin = createClient(memfireUrl, memfireServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _memfireAdmin;
}

// 导出一个 getter，延迟初始化
export const memfireAdmin = new Proxy({} as any, {
  get(_target, prop) {
    const client = getMemfireAdmin();
    return (client as any)[prop];
  },
});
