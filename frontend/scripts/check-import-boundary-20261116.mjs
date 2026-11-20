import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const user={id:'mock-admin',name:'模拟管理员',role:'admin',organizationId:'mock-org',campusId:'mock-campus'};
const server=await createServer({configFile:false,envFile:false,plugins:[react()],define:{'import.meta.env.VITE_API_BASE':JSON.stringify('/api')},server:{host:'127.0.0.1',port:0,hmr:false,proxy:{}},clearScreen:false,logLevel:'error'});
await server.listen();const port=server.httpServer.address().port,base=`http://127.0.0.1:${port}`;
let browser;const errors=[];
try {
 browser=await chromium.launch({channel:'chrome',headless:true}); const ctx=await browser.newContext({serviceWorkers:'block'});
 await ctx.addInitScript(u=>localStorage.setItem('auth-storage',JSON.stringify({state:{user:u,token:'mock-token',isAuthenticated:true,_hasHydrated:true},version:0})),user);
 await ctx.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/api'))return route.continue();const data=url.pathname==='/api/auth/me'?user:url.pathname.startsWith('/api/organizations/')?{id:'mock-org',name:'模拟机构'}:[];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data,pagination:{total:0,page:1,pageSize:10}})});});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
 for(const [path,heading,button] of [['/classes','班级管理','新增班级'],['/cashflow/marketing','营销与销售（鱼池）','新增线索'],['/cashflow/experience-schedule','体验课表','新增体验课']]) {
  await page.goto(base+path);await expect(page.getByRole('heading',{name:heading})).toBeVisible();await expect(page.getByRole('button',{name:button})).toBeVisible();await expect(page.getByText('批量导入',{exact:true})).toHaveCount(0);console.log('PASS',heading,'无批量导入，手动新增保留');
 }
 await page.goto(base+'/cashflow/order-info');await expect(page.getByRole('heading',{name:'成单信息表'})).toBeVisible();await page.getByRole('button',{name:'新增成单'}).click();const dlg=page.getByRole('dialog');await expect(dlg).toBeVisible();await dlg.getByPlaceholder('请输入学员姓名').fill('张'.repeat(51));await dlg.getByPlaceholder('请输入学员姓名').blur();await expect(dlg.getByText('学员姓名不能超过50个字符')).toBeVisible();console.log('PASS 成单表单阻止超长姓名');
 assert.deepEqual(errors,[]); console.log('PASS 浏览器无页面异常，接口均为模拟');
} finally {await browser?.close();server.httpServer?.closeAllConnections();await server.close()}
