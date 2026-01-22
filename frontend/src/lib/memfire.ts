import { createClient } from '@supabase/supabase-js';

// MemFire 兼容 Supabase 的 JS SDK，这里通过环境变量创建客户端
const MEMFIRE_URL = import.meta.env.VITE_MEMFIRE_URL;
const MEMFIRE_ANON_KEY = import.meta.env.VITE_MEMFIRE_ANON_KEY;

if (!MEMFIRE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[MemFire] VITE_MEMFIRE_URL 未配置，MemFire 客户端不可用');
}

if (!MEMFIRE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[MemFire] VITE_MEMFIRE_ANON_KEY 未配置，MemFire 客户端不可用');
}

export const memfire = MEMFIRE_URL && MEMFIRE_ANON_KEY
  ? createClient(MEMFIRE_URL, MEMFIRE_ANON_KEY)
  : null;


