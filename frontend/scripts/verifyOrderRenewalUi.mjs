// Browser regression; every /api request is intercepted and no real data is changed.
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport:{width:1440,height:950}});
const user={id:'manager-1',name:'管理员',role:'manager',organizationId:'org-1',campusId:'campus-1'};
await context.addInitScript(u=>localStorage.setItem('auth-storage',JSON.stringify({state:{token:'mock-token',user:u,isAuthenticated:true},version:0})),user);
const pendingKey='pending-renewal:v1:'+JSON.stringify([user.organizationId,user.campusId,user.id]);
const base=process.env.RENEWAL_UI_BASE || 'http://localhost:5173';
const requests=[];let responses=0;
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(!url.pathname.startsWith('/api')) return ['localhost','127.0.0.1'].includes(url.hostname)?route.continue():route.abort();
 const path=url.pathname.slice(4);const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(req.method()!=='GET'){
  if(path!=='/conversions/renewal')throw Error('Unexpected write '+path);
  requests.push(req.postDataJSON());responses++;
  if(responses===1) return route.abort('failed');
  if(responses===2) return reply({success:false,error:{code:'IDEMPOTENCY_CONFLICT',message:'请核对原记录'}},409);
  if(responses===4) return reply({success:false,error:{code:'CLASS_FULL',message:'班级已满'}},409);
  if(responses===6) { await new Promise(resolve=>setTimeout(resolve,1200)); return route.abort('failed'); }
  return reply({success:true,data:{remaining:9,conversion:{id:'confirmed-order'}}},201);
 }
 let data=[];
 if(path==='/auth/me')data=user;
 if(path==='/students')data=[{id:'student-1',name:'测试学员',status:'active',remainingLessons:4,phone:'',enrollments:[{status:'active',classId:'class-1',class:{id:'class-1',name:'原班',teacher:{id:'teacher-1',name:'老师'}}}]}];
 if(path==='/classes')data=[{id:'class-1',name:'原班',status:'active',teacher:{id:'teacher-1',name:'老师'}}];
 if(path==='/conversions/summary')data={count:0,amount:0};
 return reply({success:true,data,pagination:{page:1,pageSize:10,total:Array.isArray(data)?data.length:0,totalPages:1}});
});
let page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base+'/cashflow/order-info',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/新增续费/}).click();let modal=page.getByRole('dialog',{name:'新增续费'});
 await expect(modal.getByText(/同一天可办理多笔独立续费/)).toBeVisible();
 await modal.getByLabel('续费学员').click();await page.locator('.ant-select-dropdown:visible').getByText(/测试学员/).click();
 await modal.getByLabel('续费课时').fill('5');await modal.getByLabel('续费金额').fill('0');
 await modal.getByRole('button',{name:'确认续费'}).click();await expect.poll(()=>requests.length).toBe(1);
 await expect(modal.getByText('有一笔续费等待确认')).toBeVisible();await expect(modal.getByRole('button',{name:'重试并确认'})).toBeVisible();
 const first=requests[0];expect(first.totalLessons).toBe(5);expect(first.price).toBe(0);expect(first.paymentStatus).toBe('pending');expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/i);
 const other=await context.newPage();await other.goto(base+'/students/renewal',{waitUntil:'domcontentloaded'});await other.getByRole('button',{name:'核对续费记录',exact:true}).click();await expect(other.getByRole('dialog').getByText('有一笔续费等待确认',{exact:true})).toBeVisible();await other.close();
 await page.close();page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(base+'/cashflow/order-info',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/新增续费/}).click();modal=page.getByRole('dialog',{name:'新增续费'});
 await expect(modal.getByText('有一笔续费等待确认')).toBeVisible();await modal.getByRole('button',{name:'重试并确认'}).click();await expect.poll(()=>requests.length).toBe(2);await expect(modal.getByText('有一笔续费等待确认')).toBeVisible();
 await modal.getByRole('button',{name:'重试并确认'}).click();await expect.poll(()=>requests.length).toBe(3);await expect(modal).not.toBeVisible();expect(requests[1]).toEqual(first);expect(requests[2]).toEqual(first);
 let storage=await page.evaluate(()=>Object.keys(localStorage).filter(k=>/^pending-renewal:v1:\[.*\]$/.test(k)));expect(storage).toEqual([]);
 await page.getByRole('button',{name:/新增续费/}).click();modal=page.getByRole('dialog',{name:'新增续费'});await modal.getByLabel('续费学员').click();await page.locator('.ant-select-dropdown:visible').getByText(/测试学员/).click();await modal.getByLabel('续费课时').fill('3');await modal.getByLabel('续费金额').fill('200');await modal.getByRole('button',{name:'确认续费'}).click();await expect.poll(()=>requests.length).toBe(4);await expect(modal.getByLabel('续费课时')).toHaveValue('3');await expect(modal.getByText('有一笔续费等待确认')).toHaveCount(0);storage=await page.evaluate(()=>Object.keys(localStorage).filter(k=>/^pending-renewal:v1:\[.*\]$/.test(k)));expect(storage).toEqual([]);await modal.getByLabel('续费课时').fill('4');await modal.getByRole('button',{name:'确认续费'}).click();await expect.poll(()=>requests.length).toBe(5);expect(requests[4].requestId).not.toBe(requests[3].requestId);expect(requests[4].totalLessons).toBe(4);await expect(modal).not.toBeVisible();
 // Two tabs can start forms at once; only one may reserve a new pending request.
 const rival=await context.newPage();rival.setDefaultTimeout(10000);await rival.goto(base+'/cashflow/order-info',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/新增续费/}).click();modal=page.getByRole('dialog',{name:'新增续费'});await modal.getByLabel('续费学员').click();await page.locator('.ant-select-dropdown:visible').getByText(/测试学员/).click();await modal.getByLabel('续费课时').fill('2');await modal.getByLabel('续费金额').fill('100');
 await rival.getByRole('button',{name:/新增续费/}).click();const rivalModal=rival.getByRole('dialog',{name:'新增续费'});await rivalModal.getByLabel('续费学员').click();await rival.locator('.ant-select-dropdown:visible').getByText(/测试学员/).click();await rivalModal.getByLabel('续费课时').fill('7');await rivalModal.getByLabel('续费金额').fill('400');
 await Promise.allSettled([modal.getByRole('button',{name:'确认续费'}).click({timeout:2500}),rivalModal.getByRole('button',{name:'确认续费'}).click({timeout:2500})]);await expect.poll(()=>requests.length).toBe(6);await page.waitForTimeout(1400);expect(requests.length).toBe(6);const shared=await page.evaluate(()=>Object.keys(localStorage).filter(k=>/^pending-renewal:v1:\[.*\]$/.test(k)));expect(shared.length).toBe(1);expect(shared[0]).toBe(pendingKey);const persisted=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),pendingKey);expect(persisted).toEqual(requests[5]);await rival.close();await page.close();page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(base+'/cashflow/order-info',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/新增续费/}).click();modal=page.getByRole('dialog',{name:'新增续费'});await modal.getByRole('button',{name:'重试并确认'}).click();await expect.poll(()=>requests.length).toBe(7);expect(requests[6]).toEqual(requests[5]);await expect(modal).not.toBeVisible();expect(errors).toEqual([]);
 console.log('PASS 浏览器续费：单事务接口、默认待收款、零元、网络丢响应后跨标签/关闭标签恢复原键重试、未决409保留、首次明确失败后可修改重提、跨标签并发锁及成功后清理');
} finally {await browser.close()}
