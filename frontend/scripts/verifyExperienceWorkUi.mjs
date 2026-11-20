import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const config=JSON.parse(process.env.EXPERIENCE_WORK_QA||'{}');assert(config.baseApi?.startsWith('http://127.0.0.1:'));
const base='http://127.0.0.1:5199',out='../docs/acceptance/2026-11-13-experience-work-reminders';
const browser=await chromium.launch({headless:true});const checks=[],errors=[],writes=[];let page;
try{const context=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'});
 await context.addInitScript(({user,token})=>localStorage.setItem('auth-storage',JSON.stringify({state:{user,token,isAuthenticated:true},version:0})),config);
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,base);if(!url.pathname.startsWith('/api/'))return route.continue();
  if(['/api/auth/me','/api/staff-work','/api/follow-ups'].includes(url.pathname)){if(req.method()!=='GET')writes.push({path:url.pathname,body:req.postDataJSON()});return route.fulfill({response:await route.fetch({url:config.baseApi+url.pathname+url.search})});}
  assert.equal(req.method(),'GET');return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:url.pathname.startsWith('/api/organizations/')?{name:'独立体验待办'}:[]})});
 });
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/my-work');await expect(page.getByText('体验跟进',{exact:true})).toBeVisible();
 const row=name=>page.getByTestId('work-task').filter({hasText:name});
 await expect(row('仅本人授课')).toContainText('今日体验');await expect(row('仅本人授课')).toContainText('本人授课');await expect(row('仅本人授课')).not.toContainText('本人跟进');
 await expect(row('仅本人跟进')).toContainText('本人跟进');await expect(row('仅本人跟进')).not.toContainText('本人授课');
 await expect(row('本人授课并跟进')).toHaveCount(1);await expect(row('本人授课并跟进')).toContainText('本人授课／本人跟进');
 await expect(row('仅本人授课')).toBeVisible();await page.screenshot({path:out+'/教师两类体验待办.png',fullPage:true,animations:'disabled'});checks.push('教师待办呈现授课与销售两类当日体验，双重责任只显示一条，时间及班级可见');
 await row('仅本人授课').getByRole('button',{name:'查看体验安排'}).click();const modal=page.getByRole('dialog',{name:'今日体验安排'});
 await expect(modal).toContainText('仅本人授课');await expect(modal).toContainText('10:00–11:00');await expect(modal).toContainText('本人班级');await expect(modal).toContainText('teacher2');await expect(modal.getByRole('button',{name:'查看体验课记录'})).toHaveCount(0);
 await page.screenshot({path:out+'/授课老师只读安排.png',animations:'disabled'});await modal.getByRole('button',{name:'关闭',exact:true}).click();await expect(modal).not.toBeVisible();checks.push('仅授课老师可查看安排、授课与销售负责人，没有他人业务编辑入口');
 await row('仅本人跟进').getByRole('button',{name:'查看体验安排'}).click();await expect(modal).toContainText('其他老师班级');await expect(modal.getByRole('button',{name:'查看体验课记录'})).toBeVisible();await modal.getByRole('button',{name:'关闭',exact:true}).click();await expect(modal).not.toBeVisible();checks.push('本人销售负责、他人授课的预约显示正确班级，保留本人体验记录入口');
 await row('仅本人授课').getByRole('checkbox').click();await expect(row('仅本人授课')).toHaveCount(0);await page.getByRole('button',{name:'已跟进',exact:true}).click();await expect(row('仅本人授课')).toHaveCount(1);await expect(row('仅本人授课').getByRole('checkbox')).toBeChecked();
 await row('仅本人授课').getByRole('button',{name:'撤销完成'}).click();await page.getByRole('button',{name:'待跟进',exact:true}).click();await expect(row('仅本人授课')).toHaveCount(1);checks.push('当日体验提醒可勾选完成、查看完成、撤销，跟进状态经真实HTTP落库');
 await page.setViewportSize({width:375,height:900});await row('本人授课并跟进').getByRole('button',{name:'查看体验安排'}).click();await expect(modal).toBeVisible();const box=await modal.boundingBox();assert(box.x>=0&&box.x+box.width<=376);await page.screenshot({path:out+'/手机体验安排.png',animations:'disabled'});checks.push('375px手机待办及只读安排弹窗可用');
 assert.deepEqual(errors,[]);assert(writes.length>=2&&writes.every(w=>w.path==='/api/follow-ups'));checks.push('仅写入独立库个人跟进状态，无体验登记/成单写入与页面异常');
 writeFileSync(out+'/browser-results.json',JSON.stringify({at:new Date().toISOString(),passed:checks.length,checks},null,2));console.log('PASS '+checks.length+' browser checks');
}catch(e){if(page){console.error('UI context',(await page.locator('body').innerText()).slice(-1800));await page.screenshot({path:out+'/browser-failure.png',fullPage:true});}throw e;}finally{await browser.close();}
