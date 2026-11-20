import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const user={id:'mock-admin',name:'模拟管理员',role:'admin',organizationId:'mock-org',campusId:'mock-campus'};
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const port of [5199,5410]) {
  const base=`http://127.0.0.1:${port}`,errors=[];const ctx=await browser.newContext({serviceWorkers:'block'});
  await ctx.addInitScript(u=>localStorage.setItem('auth-storage',JSON.stringify({state:{user:u,token:'mock-token',isAuthenticated:true,_hasHydrated:true},version:0})),user);
  await ctx.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/api'))return route.continue();const data=url.pathname==='/api/auth/me'?user:url.pathname.startsWith('/api/organizations/')?{id:'mock-org',name:'模拟机构'}:[];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data,pagination:{total:0,page:1,pageSize:10}})});});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
  for(const [path,heading,button] of [['/classes','班级管理','新增班级'],['/cashflow/marketing','营销与销售（鱼池）','新增线索'],['/cashflow/experience-schedule','体验课表','新增体验课']]) {
   await page.goto(base+path);await expect(page.getByRole('heading',{name:heading})).toBeVisible();await expect(page.getByRole('button',{name:button})).toBeVisible();await expect(page.getByText('批量导入',{exact:true})).toHaveCount(0);console.log('PASS',port,heading,'入口及手动新增');
  }
  await page.goto(base+'/cashflow/order-info');await expect(page.getByRole('heading',{name:'成单信息表'})).toBeVisible();await page.getByRole('button',{name:'新增成单'}).click();const dlg=page.getByRole('dialog');await dlg.getByPlaceholder('请输入学员姓名').fill('张'.repeat(51));await dlg.getByPlaceholder('请输入学员姓名').blur();await expect(dlg.getByText('学员姓名不能超过50个字符')).toBeVisible();console.log('PASS',port,'成单表单姓名提示');
  assert.deepEqual(errors,[]);await ctx.close();
 }
} finally {await browser.close()}
