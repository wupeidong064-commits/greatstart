// Run with node frontend/scripts/verifyClassCourseTypesUi.mjs. Every API is mocked;
// the isolated Vite server never reads .env or the project's proxy configuration.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../docs/acceptance/2026-11-07-course-type-ux');
let server, browser, page, base, releaseCatalog;
let catalog = [], classes = [], catalogMode = 'ok', failMutation = false, failClass = false;
const results = [], mutations = [], requests = [], blocked = [], errors = [];
const user = { id:'isolated-admin', name:'隔离管理员', role:'admin', organizationId:'isolated-org' };
const cls = (id, courseType) => ({id,name:`测试${id}班`,code:`TEST-${id}`,courseType,capacity:12,status:'active',teacherId:'t1',teacher:{id:'t1',name:'负责老师甲'}});
try {
  const probe = net.createServer(); await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port = probe.address().port; await new Promise(resolve=>probe.close(resolve));
  server = await createServer({ root, configFile:false, envFile:false, plugins:[react()], define:{'import.meta.env.VITE_API_BASE':JSON.stringify('/api')}, server:{host:'127.0.0.1',port,strictPort:true,hmr:false,proxy:{}}, logLevel:'error' });
  await server.listen(); base = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
  await context.addInitScript(user=>localStorage.setItem('auth-storage',JSON.stringify({state:{user,token:'isolated-token',isAuthenticated:true,_hasHydrated:true},version:0})),user);
  await context.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.origin!==base){blocked.push(req.url());return route.abort();}
    if(!url.pathname.startsWith('/api'))return route.continue();
    requests.push({path:url.pathname,query:url.search,method:req.method()});
    const reply=(data,status=200,error)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status===200,data,...(error?{error:{message:error}}:{})})});
    const paged=rows=>{const page=Number(url.searchParams.get('page')||1);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:rows.slice(page-1,page),pagination:{page,pageSize:1,total:rows.length}})});};
    if(url.pathname==='/api/auth/me')return reply(user);
    if(url.pathname==='/api/users/teachers')return reply([{id:'t1',name:'负责老师甲'}]);
    if(url.pathname==='/api/courses'&&req.method()==='GET'){
      if(catalogMode==='fail')return reply([],500,'课程目录暂不可用');
      if(catalogMode==='hold'){
        const old=catalog.map(row=>({...row}));catalogMode='ok';
        return new Promise(resolve=>{releaseCatalog=()=>resolve(paged(old));});
      }
      return paged(catalog);
    }
    if(url.pathname==='/api/classes'&&req.method()==='GET')return paged(classes);
    if(url.pathname==='/api/classes/experience-priority')return reply(classes);
    if(req.method()==='POST'||req.method()==='PUT'){
      const body=req.postDataJSON();mutations.push({path:url.pathname,method:req.method(),body});
      if(url.pathname.startsWith('/api/courses')){
        if(failMutation){failMutation=false;return reply({},500,'类型保存失败，请重试');}
        if(req.method()==='POST')catalog.push({id:`type-${catalog.length+1}`,name:body.name,isActive:true});
        else {const current=catalog.find(row=>row.id===decodeURIComponent(url.pathname.split('/').at(-1)));const old=current.name;Object.assign(current,body);if(body.name)classes.forEach(row=>{if(row.courseType===old)row.courseType=body.name;});}
        return reply(catalog.at(-1));
      }
      if(url.pathname.startsWith('/api/classes')){
        if(failClass){failClass=false;return reply({},409,'班级保存失败，请重试');}
        if(req.method()==='POST'){const current={...body,id:`new-${classes.length+1}`};classes.push(current);return reply(current);}
        const current=classes.find(row=>row.id===decodeURIComponent(url.pathname.split('/').at(-1)));Object.assign(current,body);return reply(current);
      }
      errors.push(`Unexpected write ${req.method()} ${url.pathname}`);return reply({},500,'Unexpected mock write');
    }
    return reply([]);
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(String(error)));
  const create=()=>page.getByRole('dialog',{name:'新增班级',exact:true});
  const edit=()=>page.getByRole('dialog',{name:'编辑班级',exact:true});
  const settings=()=>page.getByRole('dialog',{name:'课程类型设置',exact:true});
  const editor=name=>page.getByRole('dialog',{name,exact:true});
  const close=dialog=>dialog.getByRole('button',{name:/^取\s*消$/}).click();
  const closeSettings=async()=>{await settings().getByRole('button',{name:'Close',exact:true}).click();await expect(settings()).not.toBeVisible();};
  const reload=async()=>{await page.goto(`${base}/classes`,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('.biz-page-head',{timeout:60000});await expect(page.getByRole('button',{name:/新增班级/})).toBeVisible();};
  const openCreate=async()=>{await page.getByRole('button',{name:/新增班级/}).click();await expect(create()).toBeVisible();await expect(create().locator('#courseType')).toBeEnabled();};
  const options=()=>page.locator('.ant-select-dropdown:visible .ant-select-item-option-content');
  const openOptions=dialog=>dialog.locator('.ant-select').filter({has:page.locator('#courseType')}).locator('.ant-select-selector').click();
  const choose=async(dialog,name)=>{await openOptions(dialog);await options().getByText(name,{exact:true}).click();};
  const values=async(dialog,name='待保存班级')=>{await dialog.getByLabel('班级名称',{exact:true}).fill(name);await dialog.getByLabel('班级代码',{exact:true}).fill('DRAFT');await dialog.getByLabel('容量',{exact:true}).fill('8');};
  const save=dialog=>dialog.getByRole('button',{name:/^确\s*定$/}).click();
  const openEdit=async(id)=>{await page.getByRole('row').filter({hasText:`TEST-${id}`}).getByRole('button',{name:/^编\s*辑$/}).click();await expect(edit()).toBeVisible();await expect(edit().locator('#courseType')).toBeEnabled();};

  classes=[cls('旧类型','旧文本英语')];catalog=[];await reload();
  await expect(page.locator('.biz-head-actions').getByRole('button',{name:'课程类型设置',exact:true})).toBeVisible();
  await openCreate();await values(create());await choose(create(),'旧文本英语');failClass=true;await save(create());
  await expect(page.getByText('班级保存失败，请重试',{exact:true})).toBeVisible();await expect(create().getByLabel('班级名称',{exact:true})).toHaveValue('待保存班级');
  await save(create());await expect(create()).not.toBeVisible();assert.equal(mutations.at(-1).body.courseType,'旧文本英语');
  await expect(page.getByRole('dialog',{name:'排课',exact:true})).toBeVisible();await close(page.getByRole('dialog',{name:'排课',exact:true}));
  results.push('empty catalog preserves existing free-text choices; class create sends name, retains fields on error, and retries successfully');

  classes=[cls('停用','书法'),cls('大小写','  ENGLISH  '),cls('去重',' english ')];catalog=[{id:'type-1',name:'美术',isActive:true},{id:'type-2',name:'英语',isActive:true},{id:'type-3',name:'书法',isActive:false},{id:'type-4',name:'English',isActive:false}];await reload();await openCreate();
  await openOptions(create());await expect(options().getByText('书法',{exact:true})).toHaveCount(0);await expect(options().filter({hasText:/english/i})).toHaveCount(0);await expect(options().getByText('英语',{exact:true})).toBeVisible();
  await create().locator('#courseType').fill('英语');await expect(options().getByText('美术',{exact:true})).toHaveCount(0);await options().getByText('英语',{exact:true}).click();await close(create());
  assert(requests.some(req=>req.path==='/api/courses'&&req.query.includes('page=3')));results.push('full paginated catalog searchable; disabled types excluded from new classes even for case/whitespace variants in legacy text');
  await openEdit('停用');await edit().getByLabel('班级名称',{exact:true}).fill('已改名旧班');await save(edit());await expect(edit()).not.toBeVisible();assert.equal(mutations.at(-1).body.courseType,'书法');
  results.push('existing class retains original disabled type when updating other details');

  classes=[];catalog=[];await reload();await openCreate();await values(create(),'未保存美术班');
  await expect(create().getByText('暂无课程类型，请先新建，已填写的班级资料会保留。',{exact:true})).toBeVisible();
  await create().getByRole('button',{name:'课程类型设置',exact:true}).click();await settings().getByRole('button',{name:'新建课程类型',exact:true}).click();
  await editor('新建课程类型').getByLabel('课程类型名称',{exact:true}).fill('美术');failMutation=true;await editor('新建课程类型').getByRole('button',{name:/保\s*存/}).click();
  await expect(page.getByText('类型保存失败，请重试',{exact:true})).toBeVisible();await expect(editor('新建课程类型').getByLabel('课程类型名称',{exact:true})).toHaveValue('美术');
  await editor('新建课程类型').getByRole('button',{name:/保\s*存/}).click();await expect(editor('新建课程类型')).not.toBeVisible();await expect(settings().getByRole('row').filter({hasText:'美术'})).toBeVisible();
  await closeSettings();await expect(create().getByLabel('班级名称',{exact:true})).toHaveValue('未保存美术班');await expect(create().locator('.ant-select-selection-item').filter({hasText:'美术'})).toBeVisible();
  await expect(page.locator('.ant-message-notice')).toHaveCount(0,{timeout:10000});await fs.mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'class-new-type.png'),fullPage:true});
  await close(create());results.push('empty new institution creates type within class form, retries type save without data loss, auto-selects type, and retains class draft');

  classes=[cls('改名','美术')];catalog=[{id:'type-1',name:'美术',isActive:true}];await reload();await openEdit('改名');await edit().getByLabel('班级名称',{exact:true}).fill('用户未保存的班名');await edit().getByLabel('班级代码',{exact:true}).fill('UNSAVED');
  await edit().getByRole('button',{name:'课程类型设置',exact:true}).click();await settings().getByRole('row').filter({hasText:'美术'}).getByRole('button',{name:/^改\s*名$/}).click();await editor('课程类型改名').getByLabel('课程类型名称',{exact:true}).fill('创意美术');await editor('课程类型改名').getByRole('button',{name:/保\s*存/}).click();await expect(editor('课程类型改名')).not.toBeVisible();await closeSettings();
  await expect(edit().getByLabel('班级名称',{exact:true})).toHaveValue('用户未保存的班名');await expect(edit().getByLabel('班级代码',{exact:true})).toHaveValue('UNSAVED');await expect(edit().locator('.ant-select-selection-item').filter({hasText:'创意美术'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'TEST-改名'})).toContainText('创意美术');await close(edit());results.push('type rename refreshes list and selected type while preserving all other unsaved class fields');

  await openCreate();await values(create());await choose(create(),'创意美术');await create().getByRole('button',{name:'课程类型设置',exact:true}).click();await settings().getByRole('row').filter({hasText:'创意美术'}).getByRole('button',{name:/^停\s*用$/}).click();await expect(settings().getByRole('button',{name:/^启\s*用$/})).toBeVisible();await closeSettings();const before=mutations.length;await save(create());await expect(create().getByText('请加载课程类型并选择有效选项',{exact:true})).toBeVisible();assert.equal(mutations.length,before);
  await create().getByRole('button',{name:'课程类型设置',exact:true}).click();await settings().getByRole('button',{name:/^启\s*用$/}).click();await expect(settings().getByRole('button',{name:/^停\s*用$/})).toBeVisible();await closeSettings();await openOptions(create());await expect(options().getByText('创意美术',{exact:true})).toBeVisible();await create().locator('#courseType').press('Escape');await close(create());results.push('disable refresh invalidates selected type for unsaved new class and blocks POST; enable refresh restores option');

  catalogMode='fail';await page.getByRole('button',{name:/新增班级/}).click();await values(create(),'目录失败仍保留');await expect(create().getByText('课程目录暂不可用',{exact:true})).toBeVisible();catalogMode='ok';await create().getByRole('button',{name:'重试加载课程类型',exact:true}).click();await expect(create().locator('#courseType')).toBeEnabled();await expect(create().getByLabel('班级名称',{exact:true})).toHaveValue('目录失败仍保留');await close(create());results.push('directory load error and retry retain the class draft');

  catalog=[{id:'stale',name:'过期响应类型',isActive:true}];classes=[];catalogMode='hold';await page.getByRole('button',{name:/新增班级/}).click();await expect.poll(()=>typeof releaseCatalog).toBe('function');await close(create());catalog=[{id:'fresh',name:'新响应类型',isActive:true}];await openCreate();releaseCatalog();releaseCatalog=undefined;await openOptions(create());await expect(options().getByText('新响应类型',{exact:true})).toBeVisible();await expect(options().getByText('过期响应类型',{exact:true})).toHaveCount(0);await create().locator('#courseType').press('Escape');await close(create());results.push('late response from a closed class form cannot pollute newly opened course options');
  assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);results.push('no external network calls, unmocked service writes, or browser exceptions');
} catch(error){results.push({failure:String(error.stack||error)});console.error(String(error.stack||error));console.error(await page?.locator('body').innerText().catch(()=>''));process.exitCode=1;}
finally{releaseCatalog?.();await browser?.close();await server?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'class-course-types-ui-results.json'),JSON.stringify({isolation:{configFile:false,envFile:false,proxy:{},allApiRequestsMocked:true},results,mutations,requests,blocked,errors},null,2));console.log(JSON.stringify(results,null,2));}
