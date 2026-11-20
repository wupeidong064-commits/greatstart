// Adds role coverage and a future occurrence to a NEW single-institution fixture only.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),bcrypt=require('bcryptjs'),{randomBytes}=require('crypto'),{PrismaClient}=require('@prisma/client'),{id,at}=require('./register.cjs');
const copy=process.argv[2];assert(['single17','singlecheck17'].includes(copy));
const root=path.join(os.homedir(),'.local/state/greatstart-annual-v1',copy),a=JSON.parse(fs.readFileSync(path.join(root,'access.json')));assert.equal(a.profile,'single-v1');assert(a.databaseUrl.endsWith('/buzzer_annual_v1_'+copy));const p=new PrismaClient({datasources:{db:{url:a.databaseUrl}}}),out=path.join(root,'single-roles.private.json');
(async()=>{if(fs.existsSync(out)){console.log('既有单机构预置账号保留',copy);return;}
const accounts={main:a.accounts.main,sister:a.accounts.sister,other:a.accounts.other,edge:a.accounts.edge};
await p.$transaction(async tx=>{
 await tx.user.update({where:{id:id('main-u0')},data:{managementLevel:'super'}});
 for(const [key,role,existing]of [['coach','coach','main-u1'],['sales','sales','main-u8'],['staff','staff',null],['parent','parent',null],['platform','staff',null]]){
  const password=randomBytes(24).toString('base64url'),email=key+'@singleqa.invalid',data={email,name:({coach:'复测授课老师',sales:'复测招生销售',staff:'复测普通员工',parent:'复测家长',platform:'复测平台运营'})[key],password:await bcrypt.hash(password,10),role,isActive:true,managementLevel:'none',organizationId:key==='platform'?null:a.organizationId,campusId:key==='platform'?null:a.campusId,isPlatformAdmin:key==='platform'};
  const uid=id(existing||'single-role-'+key);if(existing)await tx.user.update({where:{id:uid},data});else await tx.user.create({data:{id:uid,...data}});accounts[key]={email,password};
 }
 await tx.student.update({where:{id:id('s1')},data:{parentPhone:'13977001001',parentName:'复测家长'}});
 await tx.user.update({where:{id:id('single-role-parent')},data:{phone:'13977001001'}});
 await tx.parentStudentLink.create({data:{parentId:id('single-role-parent'),studentId:id('s1')}});
 await tx.enrollment.create({data:{id:id('single-extra-enrollment'),organizationId:a.organizationId,studentId:id('s1'),classId:id('class20'),enrolledAt:at('2026-11-17',0),status:'active',enrolledBy:id('main-u0')}});
 await tx.schedule.create({data:{id:id('single-nov18'),organizationId:a.organizationId,campusId:a.campusId,classId:id('class20'),teacherId:id('main-u1'),startTime:at('2026-11-18',15),endTime:at('2026-11-18',16),status:'scheduled',classroom:'展翼馆'}});
},{timeout:20000});
fs.writeFileSync(out,JSON.stringify({copy,accounts},null,2),{mode:0o600,flag:'wx'});console.log('单机构角色/家长绑定/11月18日场次已准备',copy);
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
