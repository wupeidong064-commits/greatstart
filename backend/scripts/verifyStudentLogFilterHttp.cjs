// Isolated HTTP acceptance: never opens or changes the development database.
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { userInfo } = require('node:os');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const assert = require('node:assert/strict');
const net = require('node:net');
const db = 'buzzer_logs_' + randomBytes(6).toString('hex');
const url = 'postgresql://' + encodeURIComponent(userInfo().username) + '@127.0.0.1:5432/' + db;
const env = { ...process.env, DATABASE_URL: url, DATABASE_DIRECT_URL: url, JWT_SECRET: randomBytes(32).toString('hex'), NODE_ENV: 'test', AI_PROVIDER: 'mock', };
const prisma = new PrismaClient({ datasources: { db: { url } } });
let child, created = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  env.PORT = String(port);
  execFileSync('createdb', ['-h', '127.0.0.1', db]); created = true;
  execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { cwd: __dirname + '/..', env, stdio: 'pipe' });
  const org = await prisma.organization.create({data: { name: '流水隔离测试', code: randomUUID() }});
  const otherOrg = await prisma.organization.create({data: { name: '另一机构', code: randomUUID() }});
  const campus = await prisma.campus.create({data: {name:'测试校区', code:'MAIN', organizationId:org.id}});
  const otherCampus = await prisma.campus.create({data: {name:'另一校区', code:'MAIN', organizationId:otherOrg.id}});
  const password = randomUUID();
  const admin = await prisma.user.create({data:{name:'管理员',email:randomUUID()+'@isolated.test',role:'manager',password:await bcrypt.hash(password,10),organizationId:org.id,campusId:campus.id}});
  const alice = await prisma.student.create({data:{name:'李小明',organizationId:org.id,campusId:campus.id}});
  const bob = await prisma.student.create({data:{name:'王小红',organizationId:org.id,campusId:campus.id}});
  const foreign = await prisma.student.create({data:{name:'李小明外校',organizationId:otherOrg.id,campusId:otherCampus.id}});
  for (const [student, count] of [[alice, 13], [bob, 2], [foreign, 4]]) {
    for (let i = 0; i < count; i++) await prisma.lessonLog.create({data:{studentId:student.id,studentName:student.name,organizationId:student.organizationId,type:i%2?'add':'deduct',lessons:1,createdAt:new Date('2026-11-05T10:00:00Z')}});
  }
  child = spawn(process.execPath, ['--import','tsx','src/index.ts'], {cwd:__dirname+'/..',env,stdio:'ignore'});
  const base = 'http://127.0.0.1:'+port;
  let ready = false;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{} await delay(150)}
  assert(ready,'isolated backend did not start');
  const auth = await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:admin.email,password})}).then(r=>r.json());
  assert(auth.data?.token, 'login failed');
  const get = async query => {const response=await fetch(base+'/api/lesson-logs?'+new URLSearchParams(query),{headers:{authorization:'Bearer '+auth.data.token}}); const body=await response.json(); assert.equal(response.status,200,JSON.stringify(body)); return body;};
  let r=await get({studentName:'李小',page:'1',pageSize:'10'}); assert.equal(r.pagination.total,13); assert.equal(r.data.length,10); assert(r.data.every(x=>x.studentName==='李小明'));
  r=await get({studentName:'李小',page:'2',pageSize:'10'}); assert.equal(r.data.length,3); assert.equal(r.pagination.total,13);
  r=await get({studentName:'李小',type:'deduct'}); assert.equal(r.pagination.total,7); assert(r.data.every(x=>x.type==='deduct'));
  r=await get({studentName:'李小',startDate:'2026-11-05T00:00:00Z',endDate:'2026-11-05T23:59:59Z'}); assert.equal(r.pagination.total,13);
  r=await get({studentName:'李小',startDate:'2026-11-06T00:00:00Z'}); assert.equal(r.pagination.total,0);
  r=await get({studentName:'不存在'}); assert.equal(r.pagination.total,0);
  console.log('PASS 姓名筛选及跨页总数、类型日期组合、空结果、跨机构隔离');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(child){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)]);} await prisma.$disconnect(); if(created) execFileSync('dropdb',['-h','127.0.0.1','--if-exists',db]);});
