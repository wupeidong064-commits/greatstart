# MemFire 前端环境变量配置

要在前端使用 MemFire Cloud，需要在 Vite 环境变量中配置 URL 和公钥。

## 1. 在前端安装 SDK

在 `E:\buzzersteam\frontend` 目录执行：

```bash
npm install @supabase/supabase-js
```

## 2. 创建环境变量文件

在 `frontend` 目录下创建（或编辑）本地开发用的 `.env.local`：

```bash
VITE_MEMFIRE_URL=https://d4r9c60g91htqli3v480.baseapi.memfiredb.com
VITE_MEMFIRE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImV4cCI6MzM0MTk4NTA0OCwiaWF0IjoxNzY1MTg1MDQ4LCJpc3MiOiJzdXBhYmFzZSJ9.NawutPDZHTg2jm8kBNXd3ZxWx3ZxQ5vorAdE52yak5o
```

> 提示：`.env.local` 不会被提交到 git，用来保存本机的敏感信息很合适。

如果以后在生产环境部署前端（例如 Vercel、Netlify），请在对应平台的「环境变量」中配置同样的键：

- `VITE_MEMFIRE_URL`
- `VITE_MEMFIRE_ANON_KEY`

## 3. 如何在代码中使用 MemFire 客户端

已经在 `src/lib/memfire.ts` 中创建了客户端：

```ts
import { memfire } from '@/lib/memfire';

// 示例：获取当前登录用户
const { data, error } = await memfire?.auth.getUser();
```

后续可以基于这个客户端封装：

- 登录 / 注册：`memfire.auth.signInWithPassword`、`memfire.auth.signUp`
- 表数据操作：`memfire.from('students').select('*')` 等

## 4. 验证配置是否生效

1. 重启前端开发服务器（确保 Vite 重新加载环境变量）：

```bash
cd E:\buzzersteam\frontend
npm run dev
```

2. 在任意组件中临时打印测试：

```ts
import { memfire } from '@/lib/memfire';

console.log('MemFire client', memfire);
```

如果控制台能看到一个对象而不是 `null`，说明环境变量和客户端配置已经生效。


