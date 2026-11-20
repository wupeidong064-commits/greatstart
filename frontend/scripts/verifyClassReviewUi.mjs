import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
let server, browser, heldPreview, releaseRemove;
let holdPreview = false, failRemove = true;
const previews = [], generated = [], removals = [], unexpected = [], errors = [];
try {
  server = await createServer({root:process.cwd(),configFile:false,envFile:false,plugins:[react()],define:{'import.meta.env.VITE_API_BASE':JSON.stringify('/api')},server:{host:'127.0.0.1',port:0,hmr:false,proxy:{}},logLevel:'error'});
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({serviceWorkers:'block'});
  const user = {id:'mock',name:'隔离管理员',role:'admin',organizationId:'mock-org'};
  await context.addInitScript(user => localStorage.setItem('auth-storage',JSON.stringify({state:{user,token:'mock',isAuthenticated:true},version:0})),user);
  await context.route('**/*',async route => {
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==base){unexpected.push(req.url());return route.abort();}
    if(!url.pathname.startsWith('/api/')) return route.continue();
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status===200,data,...(status!==200?{error:{message:'未结束场次已有考勤'}}:{})})});
    if(url.pathname==='/api/auth/me')return reply(user);
    if(url.pathname==='/api/classes')return reply([{id:'c1',name:'隔离甲班',status:'active',teacherId:'t1',weeklyRules:[{weekday:1,startTime:'18:00',endTime:'19:00'}]}]);
    if(url.pathname==='/api/users/teachers')return reply([{id:'t1',name:'老师'}]);
    if(url.pathname==='/api/classes/c1/students')return reply([{id:'s1',enrollmentId:'e1',name:'隔离学员',status:'active'}]);
    if(url.pathname.endsWith('/preview')){previews.push(req.postDataJSON()); const send=()=>reply({class:{updatedAt:'version-1'},occurrences:[],conflicts:[]});if(holdPreview){heldPreview=send;return;} return send();}
    if(url.pathname.endsWith('/generate')){generated.push(req.postDataJSON());return reply({count:1});}
    if(url.pathname==='/api/enrollments/e1/remove-as-lost'){removals.push(req.postDataJSON()); if(failRemove)return reply(null,409);releaseRemove=()=>reply({id:'e1'});return;}
    if(req.method()!=='GET'){unexpected.push(`${req.method()} ${url.pathname}`);return route.abort();}
    return reply([]);
  });
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${base}/classes`);
  await page.getByRole('button',{name:'隔离甲班',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'按班级时间重排 · 隔离甲班'});
  const confirm=dialog.getByRole('button',{name:'确认重排',exact:true});
  const changeEnd=async value=>{const input=dialog.locator('#endDate');await input.fill(value);await input.press('Enter');await input.blur();await expect(input).toHaveValue(value);await expect(dialog.getByRole('button',{name:/生成预览/})).toBeVisible();};
  await dialog.getByRole('button',{name:/生成预览/}).click();await expect(confirm).toBeEnabled();
  await changeEnd('2026-12-20');await expect(confirm).toBeDisabled();assert.equal(generated.length,0);
  holdPreview=true;await dialog.getByRole('button',{name:/生成预览/}).click();await expect.poll(()=>!!heldPreview).toBe(true);
  await changeEnd('2026-12-21');await heldPreview();await page.waitForTimeout(150);await expect(confirm).toBeDisabled();
  holdPreview=false;await dialog.getByRole('button',{name:/生成预览/}).click();await expect(confirm).toBeEnabled();await confirm.click();await expect(dialog).not.toBeVisible();
  assert.equal(generated.length,1);assert.equal(generated[0].endDate,'2026-12-21');assert.equal(generated[0].expectedClassUpdatedAt,'version-1');assert.equal(generated[0].startDate,previews.at(-1).startDate);
  await page.getByRole('button',{name:/学员名单/}).click();await page.getByRole('button',{name:'移除',exact:true}).click();
  const remove=page.getByRole('dialog',{name:'移除学员 · 隔离学员'});const date=remove.locator('#expectedRecallDate');await date.fill('2026-12-22');await date.press('Enter');
  await remove.getByRole('button',{name:/确认移除/}).click();await expect(page.getByText('未结束场次已有考勤',{exact:true})).toBeVisible();await expect(remove).toBeVisible();await expect(date).toHaveValue('2026-12-22');
  failRemove=false;await remove.getByRole('button',{name:/确认移除/}).evaluate(button=>{button.click();button.click();});await expect.poll(()=>removals.length).toBe(2);await expect.poll(()=>!!releaseRemove).toBe(true);await releaseRemove();await expect(remove).not.toBeVisible();
  assert.deepEqual(removals,[{deleteReason:'时间问题',expectedRecallDate:'2026-12-22'},{deleteReason:'时间问题',expectedRecallDate:'2026-12-22'}]);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  console.log('PASS: date edit invalidation; delayed preview discarded; exact params/version submitted; single atomic removal endpoint; protected failure retains form; retry and double-click lock; all API mocked, no external requests.');
} finally {await browser?.close();await server?.close();}
