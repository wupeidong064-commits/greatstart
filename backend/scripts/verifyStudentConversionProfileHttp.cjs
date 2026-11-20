// Isolated PostgreSQL + real HTTP verification; never reads or writes the working database.
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { userInfo } = require('node:os');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs'), assert = require('node:assert/strict'), net = require('node:net');
const db = 'buzzer_profile_' + randomBytes(6).toString('hex');
const url = 'postgresql://' + encodeURIComponent(userInfo().username) + '@127.0.0.1:5432/' + db;
const env = { ...process.env, DATABASE_URL:url, DATABASE_DIRECT_URL:url, JWT_SECRET:randomBytes(32).toString('hex'), NODE_ENV:'test', AI_PROVIDER:'mock', };
const p = new PrismaClient({ datasources:{db:{url}} }); let child, created=false;
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));env.PORT=String(port);
 execFileSync('createdb',['-h','127.0.0.1',db]);created=true;execFileSync('./node_modules/.bin/prisma',['migrate','deploy'],{cwd:__dirname+'/..',env,stdio:'pipe'});
 const org=await p.organization.create({data:{name:'档案隔离',code:randomUUID()}}),other=await p.organization.create({data:{name:'其他机构',code:randomUUID()}});
 const campus=await p.campus.create({data:{name:'校区',code:'MAIN',organizationId:org.id}}),otherCampus=await p.campus.create({data:{name:'外校区',code:'MAIN',organizationId:other.id}});
 const password=randomUUID(),hash=await bcrypt.hash(password,10);const makeUser=async(role,c)=>p.user.create({data:{name:role,email:randomUUID()+'@test.local',role,password:hash,organizationId:c.organizationId,campusId:c.id}});
 const admin=await makeUser('manager',campus),sales=await makeUser('sales',campus),foreign=await makeUser('manager',otherCampus);
 const cls=await p.class.create({data:{name:'隔离测试班',code:'CLASS',courseType:'通用',organizationId:org.id,campusId:campus.id}});
 const conversion=await p.conversion.create({data:{studentName:'资料样例',age:8,gender:'female',contact:'13800001234',parentName:'测试家长',address:'测试地址',totalLessons:6,courseType:'新签',conversionDate:'2026-10-10',organizationId:org.id,salesId:sales.id,classId:cls.id}});
 child=spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:__dirname+'/..',env,stdio:'ignore'});const base='http://127.0.0.1:'+port;let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await delay(150)}assert(ready,'isolated backend did not start');
 async function http(method,path,token,body,status){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,method+' '+path+' '+JSON.stringify(data));return data;}
 async function login(u){return(await http('POST','/api/auth/login',null,{email:u.email,password},200)).data.token}const a=await login(admin),s=await login(sales),o=await login(foreign);
 const body={name:'资料样例',gender:'F',phone:'13800001234',parentPhone:'13800001234',parentName:'测试家长',address:'测试地址',recordedAge:8,recordedAgeAt:'2026-10-10',birthDate:null,purchasedLessons:6,remainingLessons:6,conversionId:conversion.id,classId:cls.id,salesId:sales.id};
 let result=await http('POST','/api/students',a,body,201);const student=result.data;
 assert.equal(student.recordedAge,8);assert.equal(student.recordedAgeAt.slice(0,10),'2026-10-10');assert.equal(student.birthDate,null);assert.equal(student.gender,'F');assert.equal(student.phone,body.phone);assert.equal(student.parentPhone,body.parentPhone);assert.equal(student.parentName,body.parentName);assert.equal(student.address,body.address);assert.equal(student.remainingLessons,6);
 assert.equal((await p.conversion.findUnique({where:{id:conversion.id}})).studentId,student.id);assert.equal(await p.enrollment.count({where:{studentId:student.id}}),1);
 await http('POST','/api/students',a,body,409);assert.equal(await p.student.count({where:{name:'资料样例'}}),1);
 await http('PUT','/api/students/'+student.id,o,{address:'越权'},403);
 await http('PUT','/api/students/'+student.id,a,{recordedAge:151},400);
 await http('PUT','/api/students/'+student.id,a,{recordedAge:8,recordedAgeAt:'2026-02-30'},400);
 await http('PUT','/api/students/'+student.id,a,{birthDate:'2023-02-29'},400);
 result=await http('PUT','/api/students/'+student.id,a,{birthDate:'2018-06-01',recordedAge:9,recordedAgeAt:'2026-11-06',parentName:'新家长',phone:'010-12345678',address:'新地址'},200);
 assert.equal(result.data.birthDate.slice(0,10),'2018-06-01');assert.equal(result.data.recordedAge,9);assert.equal(result.data.address,'新地址');assert.equal(result.data.phone,'010-12345678');assert.equal(result.data.parentName,'新家长');
 result=await http('PUT','/api/students/'+student.id,a,{birthDate:null,recordedAge:null},200);assert.equal(result.data.birthDate,null);assert.equal(result.data.recordedAge,null);assert.equal(result.data.recordedAgeAt,null);
 result=await http('POST','/api/students',a,{name:'空字段',purchasedLessons:0,recordedAge:0,recordedAgeAt:null},201);assert.equal(result.data.recordedAge,0);assert.equal(result.data.recordedAgeAt,null);assert.equal(result.data.birthDate,null);assert.equal(result.data.address,null);
 await http('POST','/api/students',a,{name:'异常',purchasedLessons:0,recordedAgeAt:'2026-11-06'},400);
 const direct=await http('POST','/api/conversions',a,{studentName:'直接成单学员',age:10,gender:'male',contact:'13800002345',parentName:'测试家长二',address:'另一个测试地址',conversionDate:'2026-10-12',totalLessons:3,price:0},201);
 const directStudent=await p.student.findUniqueOrThrow({where:{id:direct.data.studentId}});assert.equal(directStudent.recordedAge,10);assert.equal(directStudent.recordedAgeAt.toISOString().slice(0,10),'2026-10-12');assert.equal(directStudent.birthDate,null);assert.equal(directStudent.gender,'M');assert.equal(directStudent.address,'另一个测试地址');assert.equal(directStudent.parentPhone,'13800002345');
 // Generic contact is preserved exactly; only valid mobile numbers become parent login phones.
 for(const [name,contact,expectedParent] of [['座机学员','010-12345678',null],['微信学员','微信号 test_contact',null],['带区号学员','+86 138 0000 2345','13800002345']]){
  const response=await http('POST','/api/conversions',a,{studentName:name,contact,totalLessons:0},201);
  const row=await p.student.findUniqueOrThrow({where:{id:response.data.studentId}});assert.equal(row.phone,contact);assert.equal(row.parentPhone,expectedParent);
 }
 const existingBefore=await p.student.findUniqueOrThrow({where:{id:directStudent.id}});
 await http('POST','/api/conversions',a,{studentName:'已有学员续单',existingStudentId:directStudent.id,contact:'010-88888888',totalLessons:0},201);
 const existingAfter=await p.student.findUniqueOrThrow({where:{id:directStudent.id}});assert.equal(existingAfter.phone,existingBefore.phone);assert.equal(existingAfter.parentPhone,existingBefore.parentPhone);
 await http('POST','/api/conversions',a,{studentName:'异常年龄',age:1.5,contact:'13800002345',totalLessons:0},400);
 await http('POST','/api/conversions',a,{studentName:'异常日期',age:3,contact:'13800002345',conversionDate:'2026-02-29',totalLessons:0},400);
 result=await http('POST','/api/conversions',a,{studentName:'空年龄成单',contact:'13800002345',totalLessons:0},201);const noAge=await p.student.findUniqueOrThrow({where:{id:result.data.studentId}});assert.equal(noAge.recordedAge,null);assert.equal(noAge.recordedAgeAt,null);assert.equal(noAge.birthDate,null);
 await http('POST','/api/students',s,{...body,conversionId:conversion.id,purchasedLessons:0,remainingLessons:0,salesId:admin.id},403);
 console.log('PASS 隔离 HTTP：成单导入资料完整与缺失、真实生日与登记年龄分离、修改清空、无效日期/年龄、重复导入回滚、跨机构权限、直接成单同步建档');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(child){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)])}await p.$disconnect();if(created)execFileSync('dropdb',['-h','127.0.0.1','--if-exists',db])});
