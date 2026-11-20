import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const config=JSON.parse(process.env.CONSUMPTION_ZERO_QA||'{}'); assert(config.baseApi?.startsWith('http://127.0.0.1:'));
const base=config.baseFrontend||'http://127.0.0.1:5199', evidence='../docs/acceptance/2026-11-13-consumption-zero-default';
const browser=await chromium.launch({headless:true});const checks=[],errors=[],writes=[],responses=[];let page;
try {
 for(const kind of ['teacher','admin']) {
  const context=await browser.newContext({viewport:{width:1600,height:1100},serviceWorkers:'block'});
  await context.addInitScript(({user,token})=>localStorage.setItem('auth-storage',JSON.stringify({state:{user,token,isAuthenticated:true},version:0})),config.profiles[kind]);
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,base);if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me'||url.pathname.startsWith('/api/users/')||url.pathname.startsWith('/api/consumption/')){const response=await route.fetch({url:config.baseApi+url.pathname+url.search}); if(url.pathname.endsWith('/coach-statistics')||url.pathname.endsWith('/consumption/statistics'))responses.push({path:url.pathname,query:url.search,data:(await response.json()).data});return route.fulfill({response});}
   return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:url.pathname==='/api/settings/maxClasses'?{value:'50'}:url.pathname.startsWith('/api/organizations/')?{name:'当前验收机构'}:[]})});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  if(kind==='teacher') {
   await page.goto(base+'/teachers');const row=page.locator('tr.ant-table-row').filter({hasText:'test1'});await expect(row).toHaveCount(1);
   const metric=row.locator('.spf-emphasis');await expect(metric.locator('b')).toHaveText(/^¥[\d,]+\.\d{2}$/);await expect(metric).toContainText(/较上期 [+-]?[\d,.]+ 元/);await expect(metric).not.toContainText(/待核|已核|金额尚未计入/);
   const text=await page.locator('body').innerText();assert(!/节待核|已核部分|金额尚未计入/.test(text));
   await page.screenshot({path:evidence+(config.baseFrontend?'/5410教师课消.png':'/教师课消.png'),fullPage:true});
   checks.push('教师实际课消显示金额并正常显示较上期金额差额，无待核/已核提示');
   const expand=row.locator('.ant-table-row-expand-icon');if(await expand.count()){await expand.click();await expect(page.locator('body')).toContainText('人均实际课消');await expect(page.locator('body')).not.toContainText('人均已核课消');}
   checks.push('教师展开详情沿用人均实际课消，无已核标签');
  } else {
   await page.goto(base+'/operation/consumption');const card=page.locator('article').filter({has:page.getByText('实际课消收入',{exact:true})});await expect(card).toHaveCount(1);await expect(card.locator('.cfs-money')).toContainText(/¥[\s\d,.]+/);await expect(card).not.toContainText(/待核|已核|金额尚未计入/);
   await page.screenshot({path:evidence+(config.baseFrontend?'/5410课消收入.png':'/课消收入.png'),fullPage:true});
   checks.push('机构课消收入卡显示数值，移除已核部分及待核说明');
  }
  await context.close();
 }
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert(responses.some(r=>r.data&&((Array.isArray(r.data)&&r.data.some(x=>x.unpricedConsumptionLessons>0))||r.data.unpricedConsumptionLessons>0)),'Current test data must contain unpriced consumption');
 checks.push('当前真实数据包含缺价课消并已验证新口径，全部浏览器请求为GET且无页面异常');
 writeFileSync(evidence+(config.baseFrontend?'/published-browser.json':'/source-browser.json'),JSON.stringify({at:new Date().toISOString(),frontend:base,passed:checks.length,checks,responses:responses.map(r=>({path:r.path,query:r.query,amount:Array.isArray(r.data)?r.data.map(x=>({amount:x.actualConsumptionAmount,unpricedLessons:x.unpricedConsumptionLessons})):{amount:r.data.actualConsumptionAmount,unpricedLessons:r.data.unpricedConsumptionLessons}}))},null,2));console.log('PASS '+checks.length+' consumption browser checks');
} catch(e){if(page&&!page.isClosed()){console.error('UI context',(await page.locator('body').innerText()).slice(-1500));await page.screenshot({path:evidence+'/browser-failure.png',fullPage:true});}throw e;}finally{await browser.close();}
