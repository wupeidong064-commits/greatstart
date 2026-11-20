// Independent real React UI; all API calls mocked, no project .env/proxy or live data.
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
const output=path.resolve(root,'../docs/acceptance/2026-11-07-multi-class-transfer');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'greatstart-transfer-ui-'));
const classes=[['c1','美术原班','A'],['c2','书法原班','B'],['c3','英语保留班','C'],['c4','综合目标班','D'],['c5','乙学员原班','E']].map(([id,name,code])=>({id,name,code,status:'active'}));
const students=[{id:'s1',name:'学员甲'},{id:'s2',name:'学员乙'}];
const enrollment=(id,classId)=>({id,classId,class:classes.find(cls=>cls.id===classId),status:'active'});
const enrollments={s1:[enrollment('e1','c1'),enrollment('e1-duplicate','c1'),enrollment('e2','c2'),enrollment('e3','c3')],s2:[enrollment('e4','c5')]};
let server,browser,page,base,postMode='ok',enrollmentMode='ok',listMode='ok',releaseEnrollment,releasePost;
const results=[],writes=[],requests=[],blocked=[],errors=[];
const record=text=>{results.push(text);console.log(`PASS ${text}`);};
try{
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  server=await createServer({root,cacheDir:path.join(scratch,'vite-cache'),configFile:false,envFile:false,plugins:[react(),{
    name:'isolated-transfer-harness',configureServer(vite){vite.middlewares.use('/__transfer-ui',async(_req,res)=>{
      res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__transfer-ui',`<div id="root"></div><script type="module">
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ConfigProvider,theme} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ClassEnrollmentModal from '/src/components/ClassEnrollmentModal.tsx';
import {useAuthStore} from '/src/store/authStore.ts';
import {indigoDarkTheme} from '/src/theme/index.ts';
import '/src/index.css';
useAuthStore.setState({user:{id:'mock-manager',role:'manager',organizationId:'mock-org'}});
document.documentElement.dataset.theme='dark';window.successes=0;
function Harness(){const[state,setState]=useState({open:false});return React.createElement(ConfigProvider,{locale:zhCN,theme:{...indigoDarkTheme,algorithm:theme.darkAlgorithm}},
React.createElement('main',{style:{padding:24}},
React.createElement('button',{'data-testid':'student-entry',onClick:()=>setState({open:true,studentId:'s1'})},'学员入口'),
React.createElement('button',{'data-testid':'class-entry',onClick:()=>setState({open:true,targetClassId:'c4'})},'班级入口'),
React.createElement(ClassEnrollmentModal,{...state,onCancel:()=>setState(s=>({...s,open:false})),onSuccess:()=>window.successes++})));}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script>`));});}
  }],define:{'import.meta.env.VITE_API_BASE':JSON.stringify('/api')},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,proxy:{}},logLevel:'error'});
  await server.listen();base=`http://127.0.0.1:${port}`;browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1400,height:1100}});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==base){blocked.push(req.url());return route.abort();}if(!url.pathname.startsWith('/api'))return route.continue();
    requests.push({method:req.method(),path:url.pathname,query:url.search});
    const reply=(data,status=200,error)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status===200,data,...(error?{error:{message:error}}:{})})});
    const paged=rows=>{const page=Number(url.searchParams.get('page')||1),size=2;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:rows.slice((page-1)*size,page*size),pagination:{page,pageSize:size,total:rows.length}})});};
    if(req.method()==='GET'){
      if(url.pathname==='/api/classes'){if(listMode==='fail')return reply([],500,'班级列表暂不可用');return paged(classes);}
      if(url.pathname==='/api/students')return paged(students);
      if(url.pathname==='/api/enrollments'){
        const studentId=url.searchParams.get('studentId');
        if(enrollmentMode==='fail')return reply([],500,'原班级加载失败');
        if(enrollmentMode==='hold'&&studentId==='s1'){const rows=enrollments.s1;enrollmentMode='ok';return new Promise(resolve=>{releaseEnrollment=()=>resolve(paged(rows));});}
        return paged(enrollments[studentId]||[]);
      }
      errors.push(`Unexpected GET ${url.pathname}`);return reply([],400,'Unexpected GET');
    }
    const body=req.postDataJSON();writes.push({method:req.method(),path:url.pathname,body});
    if(req.method()!=='POST'||!['/api/enrollments/transfer','/api/enrollments'].includes(url.pathname)){errors.push(`Unexpected write ${url.pathname}`);return reply({},400,'Unexpected write');}
    if(postMode==='fail')return reply({},409,'目标班已满，本次调班未保存');
    if(postMode==='hold')return new Promise(resolve=>{releasePost=()=>resolve(reply({transfers:[],replayed:false}));});
    return reply({transfers:[],replayed:false});
  });
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(String(error)));await page.goto(`${base}/__transfer-ui`,{waitUntil:'domcontentloaded',timeout:60000});
  const dialog=page.getByRole('dialog',{name:'班级调整',exact:true});
  const selector=id=>dialog.locator('.ant-select').filter({has:page.locator(`#${id}`)});
  const dropdown=(id='fromEnrollmentIds')=>page.locator('.ant-select-dropdown').filter({has:page.locator(`#${id}_list`)});
  const open=async(entry='student-entry')=>{await page.getByTestId(entry).click();await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'确认新增班级',exact:true})).toBeEnabled();};
  const close=async()=>{await dialog.getByRole('button',{name:/取\s*消/}).click();await expect(dialog).not.toBeVisible();};
  const choose=async(id,label)=>{await selector(id).locator('.ant-select-selector').click();if(id==='fromEnrollmentIds')await dialog.locator('#fromEnrollmentIds').fill('');await dropdown(id).locator('.ant-select-item-option-content').getByText(label,{exact:true}).click();if(id==='fromEnrollmentIds')await dialog.locator('#fromEnrollmentIds').press('Escape');};
  const transfer=async()=>{await dialog.getByLabel('调班（可多选原班）',{exact:true}).check();await expect(dialog.locator('#fromEnrollmentIds')).toBeEnabled();};
  const sourceLabels=()=>selector('fromEnrollmentIds').locator('.ant-select-selection-item');
  const submit=()=>dialog.getByRole('button',{name:/确认调班/}).click();

  await open();await transfer();await choose('toClassId','综合目标班 (D)');await submit();await expect(dialog.getByText('请至少选择一个要调出的原班级',{exact:true})).toBeVisible();assert.equal(writes.length,0);
  await selector('fromEnrollmentIds').locator('.ant-select-selector').click();await expect(dropdown().locator('.ant-select-item-option')).toHaveCount(3);await dialog.locator('#fromEnrollmentIds').fill('书法');await expect(dropdown().locator('.ant-select-item-option-content')).toHaveCount(1);await dialog.locator('#fromEnrollmentIds').press('Escape');
  await choose('fromEnrollmentIds','美术原班 (A)');await choose('fromEnrollmentIds','书法原班 (B)');
  await expect(dialog.getByText('已选2个原班 → 目标：综合目标班 (D)',{exact:true})).toBeVisible();await expect(dialog.getByText(/未选中的1个现有班级保留，课时不变/)).toBeVisible();await dialog.getByLabel('备注（可选）',{exact:true}).fill('两班合并到一个班');
  await dialog.getByText('班级调整',{exact:true}).click();await expect(dropdown()).not.toBeVisible();await fs.mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'two-sources-one-target.png'),fullPage:true});
  await submit();await expect(dialog).not.toBeVisible();assert.equal(writes.length,1);assert.deepEqual(writes[0],{method:'POST',path:'/api/enrollments/transfer',body:{studentId:'s1',fromEnrollmentIds:['e1','e2'],toClassId:'c4',notes:'两班合并到一个班'}});await expect(page.getByText('调班成功，已调整选中的2个原班，其他班级和课时保持不变',{exact:true})).toBeVisible();record('two sources to one target uses one POST with exact deduplicated enrollment IDs; summary counts and untouched-class/lesson promise are explicit');

  await open();await transfer();await choose('fromEnrollmentIds','美术原班 (A)');await selector('toClassId').locator('.ant-select-selector').click();await expect(dropdown('toClassId').locator('.ant-select-item-option').filter({hasText:'美术原班 (A)'})).toHaveClass(/ant-select-item-option-disabled/);await dialog.locator('#toClassId').press('Escape');
  await choose('toClassId','英语保留班 (C) · 已在读，将保留');await selector('fromEnrollmentIds').locator('.ant-select-selector').click();await expect(dropdown().locator('.ant-select-item-option').filter({hasText:'英语保留班 (C)'})).toHaveClass(/ant-select-item-option-disabled/);await dialog.locator('#fromEnrollmentIds').press('Escape');await expect(dialog.getByText(/目标班已在读，将保留，不重复加入/)).toBeVisible();await submit();await expect(dialog).not.toBeVisible();assert.deepEqual(writes.at(-1).body,{studentId:'s1',fromEnrollmentIds:['e1'],toClassId:'c3'});record('source-target conflicts disabled in both selectors; existing destination can be retained/merged; one-source transfer remains usable');

  await open();await transfer();await choose('fromEnrollmentIds','美术原班 (A)');await choose('fromEnrollmentIds','书法原班 (B)');await dialog.getByLabel('新增班级（保留现有班）',{exact:true}).check();await transfer();await expect(sourceLabels()).toHaveCount(0);await choose('fromEnrollmentIds','书法原班 (B)');await choose('studentId','学员乙');await expect(sourceLabels()).toHaveCount(0);await expect(dialog.getByText('乙学员原班 (E)',{exact:true})).toBeVisible();await selector('fromEnrollmentIds').locator('.ant-select-selector').click();await expect(dropdown().getByText('美术原班 (A)',{exact:true})).toHaveCount(0);await dialog.locator('#fromEnrollmentIds').press('Escape');await close();record('mode and student changes clear all prior source selections and reload only the current student');

  await open();await transfer();await choose('fromEnrollmentIds','美术原班 (A)');await choose('fromEnrollmentIds','书法原班 (B)');await choose('toClassId','综合目标班 (D)');postMode='fail';const beforeRetry=writes.length;await submit();await expect(dialog.getByText('目标班已满，本次调班未保存',{exact:true})).toBeVisible();await expect(sourceLabels()).toHaveCount(2);await expect(selector('toClassId')).toContainText('综合目标班');assert.equal(writes.length,beforeRetry+1);
  postMode='hold';await dialog.locator('.ant-modal-footer .ant-btn-primary').evaluate(button=>{button.click();button.click();});await expect.poll(()=>writes.length).toBe(beforeRetry+2);await expect(dialog.locator('.ant-btn-loading')).toHaveCount(1);await page.waitForTimeout(100);assert.equal(writes.length,beforeRetry+2);releasePost();releasePost=undefined;await expect(dialog).not.toBeVisible();postMode='ok';record('failed transfer retains both sources and destination; retry double-click sends exactly one request');

  enrollmentMode='fail';await page.getByTestId('student-entry').click();await expect(dialog.getByText('原班级加载失败',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'确认新增班级',exact:true})).toBeDisabled();await dialog.getByLabel('调班（可多选原班）',{exact:true}).check();await expect(dialog.locator('#fromEnrollmentIds')).toBeDisabled();const beforeLoad=writes.length;enrollmentMode='ok';await dialog.getByRole('button',{name:/^重\s*试$/}).click();await expect(dialog.locator('#fromEnrollmentIds')).toBeEnabled();await expect(sourceLabels()).toHaveCount(0);assert.equal(writes.length,beforeLoad);await close();record('source load failure blocks writing and disables selection; retry restores current sources without submitting');

  enrollmentMode='hold';await page.getByTestId('student-entry').click();await expect.poll(()=>typeof releaseEnrollment).toBe('function');await expect(dialog.getByRole('button',{name:'确认新增班级',exact:true})).toBeDisabled();await choose('studentId','学员乙');await expect(dialog.getByText('乙学员原班 (E)',{exact:true})).toBeVisible();releaseEnrollment();releaseEnrollment=undefined;await transfer();await selector('fromEnrollmentIds').locator('.ant-select-selector').click();await expect(dropdown().getByText('乙学员原班 (E)',{exact:true})).toBeVisible();await expect(dropdown().getByText('美术原班 (A)',{exact:true})).toHaveCount(0);await dialog.locator('#fromEnrollmentIds').press('Escape');await expect(sourceLabels()).toHaveCount(0);await close();record('late prior-student source response cannot restore old sources or selections; writes remain blocked while loading');

  await open('class-entry');await choose('studentId','学员甲');await expect(selector('toClassId')).toContainText('综合目标班');await selector('toClassId').locator('.ant-select-selector').click();await expect(dropdown('toClassId').locator('.ant-select-item-option').filter({hasText:'美术原班 (A)'})).toHaveClass(/ant-select-item-option-disabled/);await dialog.locator('#toClassId').press('Escape');await dialog.getByRole('button',{name:'确认新增班级',exact:true}).click();await expect(dialog).not.toBeVisible();assert.deepEqual(writes.at(-1),{method:'POST',path:'/api/enrollments',body:{studentId:'s1',classId:'c4'}});record('class entry keeps the preselected target and ordinary add mode still blocks already joined classes while preserving its original endpoint');

  listMode='fail';await page.getByTestId('student-entry').click();await expect(dialog.getByText('班级列表暂不可用',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'确认新增班级',exact:true})).toBeDisabled();listMode='ok';await dialog.getByRole('button',{name:'重新加载',exact:true}).click();await expect(dialog.getByRole('button',{name:'确认新增班级',exact:true})).toBeEnabled();await close();record('failed class list blocks writing until successful retry');
  assert(requests.some(req=>req.path==='/api/classes'&&req.query.includes('page=3')));assert(requests.some(req=>req.path==='/api/enrollments'&&req.query.includes('page=2')));assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.successes),4);record('complete pagination, success callbacks, no external service calls, and no browser exceptions');
}catch(error){results.push({failure:String(error.stack||error)});console.error(String(error.stack||error));console.error(await page?.locator('body').innerText().catch(()=>''));process.exitCode=1;}
finally{releaseEnrollment?.();releasePost?.();await browser?.close();await server?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'multi-class-transfer-ui-results.json'),JSON.stringify({isolation:{configFile:false,envFile:false,cacheDir:scratch,proxy:{},allApiRequestsMocked:true},results,writes,requests,blocked,errors},null,2));await fs.rm(scratch,{recursive:true,force:true});console.log(JSON.stringify(results,null,2));}
