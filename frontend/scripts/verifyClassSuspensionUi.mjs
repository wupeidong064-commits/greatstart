// Isolated browser regression: Vite cache in a temporary directory, all APIs mocked.
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
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'class-suspension-'));
const resultPath=path.resolve(root,'../docs/acceptance/2026-11-07-class-suspension-ui');
const user={id:'admin',name:'管理员',role:'admin',organizationId:'mock-org'};
let rows=['cycle','delete','linked','blocked'].map(id=>({id,name:`班级-${id}`,code:id,status:'active',capacity:10,courseType:'课程',_count:{enrollments:0},currentStudents:0,availableSlots:10,fillRate:0}));
let resumeBlocked=true;
const requests=[],blocked=[],errors=[],results=[];let browser,server,page;
const pass=text=>{results.push(text);console.log('PASS',text);};
try {
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 server=await createServer({root,cacheDir:path.join(scratch,'vite-cache'),configFile:false,envFile:false,plugins:[react()],define:{'import.meta.env.VITE_API_BASE':JSON.stringify('/api')},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,proxy:{}},logLevel:'error'});await server.listen();const base=`http://127.0.0.1:${port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const makeContext=async role=>{const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1600,height:1000}});await ctx.addInitScript(u=>localStorage.setItem('auth-storage',JSON.stringify({state:{user:u,token:'mock',isAuthenticated:true,_hasHydrated:true},version:0})),{...user,role});await ctx.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base){blocked.push(url.href);return route.abort();}if(!url.pathname.startsWith('/api'))return route.continue();const method=req.method();requests.push({method,path:url.pathname,body:req.postData()});const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{success:true,data,pagination:{page:1,pageSize:100,total:Array.isArray(data)?data.length:0}}:data)});if(url.pathname==='/api/auth/me')return reply({...user,role});if(url.pathname==='/api/users/teachers')return reply([]);if(url.pathname==='/api/classes')return reply(rows);if(url.pathname==='/api/classes/experience-priority')return reply(rows.filter(r=>r.status==='active'));const match=url.pathname.match(/^\/api\/classes\/([^/]+)$/);if(match&&method==='PUT'){await new Promise(r=>setTimeout(r,250));const payload=req.postDataJSON();if(match[1]==='cycle'&&payload.status==='active'&&resumeBlocked)return reply({success:false,error:{code:'CLASS_RESUME_CONFLICT',message:'2026-11-10 10:00-11:00：老师 张教练 与班级 测试班 时间冲突；教室 A教室 已被占用'}},409);rows=rows.map(row=>row.id===match[1]?{...row,...payload}:row);return reply({});}if(match&&method==='DELETE'){await new Promise(r=>setTimeout(r,250));if(match[1]==='blocked')return reply({success:false,error:{code:'CLASS_DELETE_FAILED',message:'服务暂不可用，请稍后重试'}},503);rows=rows.filter(row=>row.id!==match[1]);return reply({});}if(method!=='GET'){blocked.push(`${method} ${url.pathname}`);return route.abort();}return reply([]);});return ctx;};
 const ctx=await makeContext('admin');page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(`${base}/classes`);await page.waitForSelector('.biz-page-head');
 const row=id=>page.locator(`tr[data-row-key="${id}"]`);const dialog=()=>page.locator('.ant-modal:visible');const confirm=async label=>dialog().getByRole('button',{name:label==='取消' ? /取\s*消/ : label,exact:label!=='取消'}).click();
 await row('cycle').getByRole('button',{name:'停课',exact:true}).click();
 await expect(dialog()).toContainText('尚未开始的未来课程将暂停');await expect(dialog()).toContainText('已完成的课程');
 await confirm('取消');assert.equal(requests.filter(r=>r.method==='PUT').length,0);pass('停课说明未来课程与历史记录，取消不发送请求');
 await row('cycle').getByRole('button',{name:'停课',exact:true}).click();await confirm('确认停课');await expect(row('cycle').getByRole('button',{name:'复课',exact:true})).toBeVisible();pass('确认停课后列表显示复课');
 await row('cycle').getByRole('button',{name:'复课',exact:true}).click();await expect(dialog()).toContainText('原先单独取消的课程不会恢复');await expect(dialog()).toContainText('课程时间、老师或教室存在冲突');await confirm('确认复课');
 await expect(dialog()).toContainText('张教练');await expect(dialog()).toContainText('A教室');await expect(dialog()).toContainText('2026-11-10');await expect(row('cycle').getByRole('button',{name:'复课',exact:true})).toBeVisible();pass('复课冲突显示具体日期、老师和教室，班级仍停课');
 resumeBlocked=false;await confirm('确认复课');await expect(dialog()).toHaveCount(0);await expect(row('cycle').getByRole('button',{name:'停课',exact:true})).toBeVisible();pass('处理冲突后可重试，成功更新班级状态');
 await ctx.close();const readCtx=await makeContext('sales');page=await readCtx.newPage();await page.goto(`${base}/classes`);await page.waitForSelector('.biz-page-head');await expect(row('blocked')).toBeVisible();await expect(page.getByRole('button',{name:'永久删除',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'停课',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'复课',exact:true})).toHaveCount(0);pass('销售角色不可操作');await readCtx.close();assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
} catch(e){results.push({failure:String(e.stack||e)});console.error(e);console.error(await page?.locator('body').innerText().catch(()=>''));process.exitCode=1;} finally {await browser?.close();await server?.close();await fs.mkdir(resultPath,{recursive:true});await fs.writeFile(path.join(resultPath,'results.json'),JSON.stringify({isolation:'all API mocked, temporary Vite cache',results,requests,blocked,errors},null,2));await fs.rm(scratch,{recursive:true,force:true});}
