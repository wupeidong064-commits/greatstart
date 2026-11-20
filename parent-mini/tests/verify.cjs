const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const storage = new Map();
let handler, requests = [], navigation = [];
global.wx = {
  getStorageSync: key => storage.get(key), setStorageSync: (key,value) => storage.set(key,value), removeStorageSync: key => storage.delete(key),
  request: opts => { requests.push(opts); handler(opts); },
  reLaunch: opts => navigation.push(opts.url), stopPullDownRefresh() {}, showModal: opts => opts.success({confirm:true})
};
const config = require('../config'),session = require('../utils/session'),api = require('../utils/api'),format = require('../utils/format');
function page(file) {
  let definition;global.Page = value => { definition = value; };delete require.cache[require.resolve(file)];require(file);
  const instance = {data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};
  for(const [key,value] of Object.entries(definition))if(typeof value==='function')instance[key]=value.bind(instance);
  return instance;
}
const respond=(opts,data,statusCode=200)=>opts.success({statusCode,data:{success:statusCode===200,data,...(statusCode===200?{}:{message:'授权失败'})}});
const delay=()=>new Promise(resolve=>setImmediate(resolve));
async function run(){
  assert.equal(format.log({type:'void',lessons:2}).label,'成单作废扣回');
  assert.equal(format.log({type:'void',lessons:2}).value,'−2');
  assert.equal(format.log({type:'void',lessons:0}).value,'−0');
  assert.equal(format.log({type:'reversal',lessons:2}).value,'+2');
  assert.equal(format.log({type:'return',lessons:2}).value,'+2');
  assert.equal(format.log({type:'add',lessons:1,reversalOfId:'original'}).label,'更正返还');
  assert.equal(format.log({type:'unknown',lessons:null}).value,'待同步');
  for(const file of ['app.json','project.config.json','sitemap.json','pages/login/login.json','pages/home/home.json'])JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));assert.deepEqual(app.pages,['pages/login/login','pages/home/home']);
  for(const file of app.pages)for(const ext of ['js','json','wxml','wxss'])assert.ok(fs.existsSync(path.join(root,file+'.'+ext)),file+'.'+ext);
  for(const file of ['app.js','config.js','utils/api.js','utils/session.js','utils/format.js',...app.pages.map(p=>p+'.js')])cp.execFileSync(process.execPath,['--check',path.join(root,file)]);
  cp.execFileSync('python3',['-c',"import pathlib,xml.etree.ElementTree as E;[E.fromstring('<root xmlns:wx=\"urn:weixin\">'+p.read_text()+'</root>') for p in pathlib.Path('.').rglob('*.wxml')]"],{cwd:root});
  assert.equal(config.apiBaseUrl,'');await assert.rejects(api.request('/parent/students'),/HTTPS/);assert.equal(requests.length,0);
  config.apiBaseUrl='http://localhost:3000/api';await assert.rejects(api.request('/parent/students'),/HTTPS/);
  config.apiBaseUrl='https://fixture.invalid/api'; // Mock only; tests directory is excluded from upload.
  const login=page('../pages/login/login');login.setData({identity:'13800000000',password:'not-saved-password'});
  handler=opts=>respond(opts,{token:'staff-token',user:{id:'staff',role:'manager'}});await login.submit();assert.match(login.data.error,/仅供家长/);assert.equal(session.get(),null);
  let pending;handler=opts=>{pending=opts;};login.setData({identity:'13800000000',password:'not-saved-password'});const first=login.submit();await login.submit();assert.equal(login.data.busy,true);assert.ok(pending.url.endsWith('/auth/login-phone'));respond(pending,{token:'parent-token',user:{id:'p',name:'家长',role:'parent'}});await first;assert.equal(session.get().token,'parent-token');assert.equal(login.data.password,'');assert.ok(!JSON.stringify([...storage.values()]).includes('not-saved-password'));
  const home=page('../pages/home/home');home.onLoad();
  handler=opts=>{
    assert.equal(opts.header.Authorization,'Bearer parent-token');
    if(opts.url.endsWith('/parent/students'))return respond(opts,[{id:'one',name:'孩子一',remainingLessons:4,purchasedLessons:10,consumedLessons:6},{id:'two',name:'孩子二'}]);
    if(opts.url.includes('/parent/schedules/'))return respond(opts,[{id:'s',startTime:'2026-11-05T01:00:00Z',endTime:'2026-11-05T02:00:00Z',status:'cancelled',class:{name:'体能'}}]);
    if(opts.url.includes('/parent/lesson-logs/'))return respond(opts,[{id:'l',type:'deduct',lessons:1,businessDate:'2026-11-05'},{id:'r',type:'add',lessons:1,createdAt:'2026-11-05T01:00:00Z'},{id:'v',type:'void',lessons:2,businessDate:'2026-11-05'}]);
    return respond(opts,[{id:'n',title:'调课通知',body:'时间以新课表为准',occurredAt:'2026-11-05T01:00:00Z'}]);
  };
  await home.onShow();assert.equal(home.data.child.remainingText,'4');assert.equal(home.data.schedules[0].statusText,'已取消');assert.equal(home.data.schedules[0].date,'2026-11-05 09:00');assert.equal(home.data.logs[0].value,'−1');assert.equal(home.data.logs[1].value,'+1');assert.equal(home.data.logs[2].label,'成单作废扣回');assert.equal(home.data.logs[2].value,'−2');assert.equal(home.data.notifications[0].title,'调课通知');
  await home.changeChild({detail:{value:'1'}});assert.equal(home.data.child.name,'孩子二');assert.equal(home.data.child.remainingText,'待同步');assert.equal(home.data.loading,false);
  // Resolve the old child's requests after switching: no stale data may appear.
  const queue=[];handler=opts=>queue.push(opts);home.changeChild({detail:{value:'0'}});const old=queue.splice(0);home.changeChild({detail:{value:'1'}});const latest=queue.splice(0);old.forEach(opts=>respond(opts,[{id:'old',title:'wrong child'}]));latest.forEach(opts=>respond(opts,[]));await delay();assert.deepEqual(home.data.notifications,[]);assert.equal(home.data.child.id,'two');
  handler=opts=>opts.success({statusCode:403,data:{success:false,error:{message:'未绑定该学员'}}});await assert.rejects(api.request('/parent/lesson-logs/unbound'),/未绑定该学员/);
  handler=opts=>opts.fail({});await home.retrySection({currentTarget:{dataset:{section:'logs'}}});assert.equal(home.data.logsState,'error');assert.match(home.data.logsError,/网络/);assert.notEqual(home.data.logsState,'ready');
  // Unauthorized response clears state and routes back; a prior session cannot clear a new login.
  handler=opts=>respond(opts,null,401);await assert.rejects(api.request('/parent/students'),/过期/);assert.equal(session.get(),null);assert.equal(navigation.at(-1),'/pages/login/login');
  session.save('old-session',{id:'p',role:'parent'});handler=opts=>{pending=opts;};const stale=api.request('/parent/students');session.save('new-session',{id:'p2',role:'parent'});respond(pending,null,401);await assert.rejects(stale,/状态已变化/);assert.equal(session.get().token,'new-session');
  assert.equal(format.log({type:'add',lessons:1,reversalOfId:'original'}).label,'更正返还');assert.equal(format.balance(null),'待同步');assert.equal(format.balance(0),'0');assert.equal(format.time(null),'时间待确认');
  const allJs=['utils/api.js',...app.pages.map(p=>p+'.js')].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');assert.ok(!/\/api\/(students|users|classes)|requestSubscribeMessage|wx\.login\(/.test(allJs));
  console.log('PASS config HTTPS/blank guard; native manifest+WXML+JS; parent-only password login; double-submit; no stored password; child switch; unknown balance; schedules/change/log/notification rendering; request race; network error; expiry/new-session isolation');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
