// Independent Vite + real Classes page, with all APIs intercepted before loading.
// No project config, .env, proxy, database, or real AI service is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(root,'../docs/acceptance/2026-11-07-class-weekday');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'greatstart-weekday-ui-'));
const user={id:'mock-admin',name:'隔离管理员',role:'admin',organizationId:'mock-org'};
const teachers=[{id:'t1',name:'负责老师甲'},{id:'t2',name:'负责老师乙'}];
const fixtures=[
  {id:'real-mon',name:'儿童美术基础班',code:'REAL-MON',teacherId:'t1',scheduleWeekDays:[1]},
  {id:'name-only-mon',name:'周一旧班',code:'ACTUAL-TUE',teacherId:'t1',scheduleWeekDays:[2]},
  {id:'real-sun',name:'周末英语班',code:'REAL-SUN',teacherId:'t2',scheduleWeekDays:[0]},
  {id:'both',name:'基础书法班',code:'MON-SUN',teacherId:'t2',scheduleWeekDays:[1,0]},
  {id:'no-future',name:'周一停课班',code:'NO-FUTURE',teacherId:'t1',scheduleWeekDays:[]},
].map(row=>({...row,status:'active',capacity:15,courseType:'综合课程',teacher:teachers.find(t=>t.id===row.teacherId),_count:{enrollments:0}}));
let server,browser,page,base;
const results=[],requests=[],writes=[],blocked=[],errors=[];
const record=text=>{results.push(text);console.log(`PASS ${text}`);};
try{
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  server=await createServer({root,cacheDir:path.join(scratch,'vite-cache'),configFile:false,envFile:false,plugins:[react()],define:{'import.meta.env.VITE_API_BASE':JSON.stringify('/api')},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,proxy:{}},logLevel:'error'});
  await server.listen();base=`http://127.0.0.1:${port}`;browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1580,height:1100}});
  await context.addInitScript(user=>localStorage.setItem('auth-storage',JSON.stringify({state:{user,token:'mock-weekday-token',isAuthenticated:true,_hasHydrated:true},version:0})),user);
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==base){blocked.push(req.url());return route.abort();}if(!url.pathname.startsWith('/api'))return route.continue();
    requests.push({method:req.method(),path:url.pathname,query:url.search});const reply=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
    if(req.method()!=='GET'){writes.push({method:req.method(),path:url.pathname});return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({success:false,error:{message:'UI测试不允许写入'}})});}
    if(url.pathname==='/api/auth/me')return reply(user);
    if(url.pathname==='/api/users/teachers')return reply(teachers);
    if(url.pathname==='/api/classes')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:fixtures,pagination:{page:1,pageSize:100,total:fixtures.length}})});
    if(url.pathname==='/api/classes/experience-priority')return reply([fixtures[3],fixtures[1],fixtures[4],fixtures[0],fixtures[2]]);
    return reply([]);
  });
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`${base}/classes`,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('.biz-page-head',{timeout:60000});
  const filters=page.locator('.biz-filter-row');const teacher=filters.locator('.ant-select').nth(0),weekday=filters.locator('.ant-select').nth(1);
  const visibleIds=()=>page.locator('.ant-table-tbody tr[data-row-key]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-row-key')).sort());
  const expectIds=ids=>expect.poll(visibleIds).toEqual([...ids].sort());
  const choose=async(select,label)=>{await select.locator('.ant-select-selector').click();const listId=await select.locator('input[role="combobox"]').getAttribute('aria-controls');const menu=page.locator('.ant-select-dropdown').filter({has:page.locator(`[id="${listId}"]`)});await menu.locator('.ant-select-item-option-content').getByText(label,{exact:true}).click();};
  const clearButton=()=>filters.getByRole('button',{name:/^清\s*除$/});
  const clearCross=async select=>{await select.hover();await select.locator('.ant-select-clear').click();};
  const expectClean=async()=>{await expectIds(fixtures.map(row=>row.id));await expect(filters).toContainText('共 5 个班级');await expect(filters).not.toContainText('有待上课程');await expect(filters).not.toContainText('undefined');await expect(clearButton()).toHaveCount(0);};
  await expectClean();

  await choose(weekday,'周一');await expectIds(['real-mon','both']);await expect(filters).toContainText('共 2 个班级');await expect(filters).toContainText('周一有待上课程，按北京时间');await expect(page.getByRole('row').filter({hasText:'REAL-MON'})).toContainText('待上课：周一');
  record('Monday uses scheduleWeekDays: unnamed Monday class included; misleading Monday name with actual Tuesday and empty future-day arrays excluded');

  await choose(weekday,'周日');await expectIds(['real-sun','both']);await expect(filters).toContainText('共 2 个班级');await expect(filters).toContainText('周日有待上课程，按北京时间');record('Sunday value 0 filters real Sunday classes and displays the correct count/explanation');

  await choose(weekday,'周一');await choose(teacher,'负责老师甲');await expectIds(['real-mon']);await expect(filters).toContainText('共 1 个班级');await clearCross(weekday);await expectIds(['real-mon','name-only-mon','no-future']);await expect(filters).toContainText('共 3 个班级');await expect(filters).not.toContainText('有待上课程');await expect(filters).not.toContainText('undefined');await clearButton().click();await expectClean();record('teacher and weekday form an intersection; weekday clear cross retains teacher only, and Clear restores all rows/count with no undefined state');

  await page.getByRole('button',{name:'优先安排体验课班级',exact:true}).click();await expect(page.getByRole('button',{name:'取消筛选',exact:true})).toBeVisible();await expect.poll(()=>requests.some(req=>req.path==='/api/classes/experience-priority')).toBe(true);await choose(weekday,'周一');await expectIds(['real-mon','both']);await expect(filters).toContainText('共 2 个班级');await page.getByRole('button',{name:'取消筛选',exact:true}).click();await expectIds(['real-mon','both']);await clearButton().click();await expectClean();record('experience-priority mode and return to normal mode both retain real-day filtering, independent of names/order');

  await choose(weekday,'周三');await expectIds([]);await expect(filters).toContainText('共 0 个班级');await expect(filters).toContainText('周三有待上课程');await clearCross(weekday);await expectClean();record('no matching future weekday displays zero classes; clear cross alone restores the full list/count and removes the filter indicator');

  const toolbar=page.locator('.biz-head-actions');const settings=toolbar.getByRole('button',{name:'课程类型设置',exact:true}),create=toolbar.getByRole('button',{name:/新增班级/});
  const dimensions=async button=>button.evaluate(element=>{const style=getComputedStyle(element);return{height:element.getBoundingClientRect().height,borderRadius:style.borderRadius,borderWidth:style.borderWidth,borderStyle:style.borderStyle,classes:element.className};});
  const settingsStyle=await dimensions(settings),createStyle=await dimensions(create);assert.equal(settingsStyle.height,createStyle.height);assert.equal(settingsStyle.borderRadius,createStyle.borderRadius);assert.equal(settingsStyle.borderWidth,createStyle.borderWidth);assert.equal(settingsStyle.borderStyle,createStyle.borderStyle);assert(!settingsStyle.classes.split(/\s+/).includes('ant-btn-sm'));assert(!createStyle.classes.split(/\s+/).includes('ant-btn-sm'));
  await fs.mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'class-weekday-and-toolbar.png'),fullPage:true});record('course-type settings and neighboring Create Class buttons share computed height, border geometry, and standard size');
  assert.deepEqual(writes,[]);assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'button-styles.json'),JSON.stringify({settings:settingsStyle,create:createStyle},null,2));
}catch(error){results.push({failure:String(error.stack||error)});console.error(String(error.stack||error));console.error(await page?.locator('body').innerText().catch(()=>''));process.exitCode=1;}
finally{await browser?.close();await server?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'class-weekday-ui-results.json'),JSON.stringify({isolation:{configFile:false,envFile:false,proxy:{},scratchCache:true,allApiRequestsMocked:true},fixtures,results,requests,writes,blocked,errors},null,2));await fs.rm(scratch,{recursive:true,force:true});console.log(JSON.stringify(results,null,2));}
