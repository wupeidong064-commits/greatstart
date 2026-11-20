import {randomUUID} from 'crypto';
const env=require(process.env.HOME+'/.local/share/greatstart-human-acceptance/current/runtime/env.private.json'); Object.assign(process.env,{DATABASE_URL:env.DATABASE_URL,DATABASE_DIRECT_URL:env.DATABASE_DIRECT_URL});
async function main(){
 const {default:db}=await import('../src/config/database'); const {resourceTransferController:c}=await import('../src/controllers/resourceTransferController'); const {userController}=await import('../src/controllers/userController'); const {scopedStaff}=await import('../src/services/registrationRequestService');
 const code='HANDOVER-'+randomUUID(); let org=''; let other='';
 try{
  const o=await db.organization.create({data:{name:code,code}});org=o.id; const campus=await db.campus.create({data:{organizationId:org,name:code,code}});
  const users=await Promise.all(['manager','coach','sales'].map((role,i)=>db.user.create({data:{name:code+i,email:code+i+'@example.test',password:'unused',role,organizationId:org,campusId:campus.id,managementLevel:i===0?'super':'none'}})));
  const x=await db.organization.create({data:{name:code+'other',code:code+'other'}});other=x.id; const foreign=await db.lead.create({data:{organizationId:other,customerName:code,contact:code}});
  const lead=await db.lead.create({data:{organizationId:org,customerName:code,contact:code,assigneeId:users[1].id}}); const exp=await db.experienceLesson.create({data:{organizationId:org,studentName:code,contact:code,assigneeId:users[1].id,scheduleDate:'2026-11-13'}}); const student=await db.student.create({data:{organizationId:org,campusId:campus.id,name:code,salesId:users[1].id}});
  const actor={id:users[0].id,organizationId:org,campusId:campus.id,role:'manager',managementLevel:'super',isPlatformAdmin:false};
  async function call(body:any){let result:any; const res:any={status(n:number){result={status:n};return this},json(v:any){result={...result,body:v};return this}};await c.executeFollowup({user:actor,body} as any,res,(e:any)=>{result={status:e.statusCode||e.status||500,code:e.code}});return result;}
  const payload={fromUserId:users[1].id,toUserId:users[2].id,leadIds:[lead.id],experienceIds:[exp.id],studentIds:[student.id]};
  const denied=await call({...payload,leadIds:[foreign.id]}); const [a,b]=await Promise.all([call(payload),call(payload)]);
  const [l,e,s]=await Promise.all([db.lead.findUniqueOrThrow({where:{id:lead.id}}),db.experienceLesson.findUniqueOrThrow({where:{id:exp.id}}),db.student.findUniqueOrThrow({where:{id:student.id}})]);
  const outcomes=[a.status,b.status].sort(); if(denied.status!==409||String(outcomes)!=='200,409'||[l.assigneeId,e.assigneeId,s.salesId].some(id=>id!==users[2].id)) throw Error('unexpected audit '+JSON.stringify({denied,outcomes}));
  console.log('PASS 跨机构拒绝及整批回滚；双并发一次成功一次冲突；线索、体验、学员负责人一致');
  const extra=await db.user.create({data:{name:code+'race',email:code+'race@example.test',password:'unused',role:'sales',organizationId:org,campusId:campus.id}});
  let release!:()=>void,ready!:()=>void;const locked=new Promise<void>(r=>ready=r), gate=new Promise<void>(r=>release=r);
  const assigning=db.$transaction(async tx=>{await scopedStaff(tx,actor,extra.id);ready();await gate;await tx.lead.create({data:{organizationId:org,customerName:code+'race',contact:code+'race',assigneeId:extra.id}})});
  await locked; let result:any; const res:any={status(n:number){result={status:n};return this},json(v:any){result={...result,body:v};return this}};
  const disabling=userController.deleteUser({user:actor,params:{id:extra.id}} as any,res,(e:any)=>{result={status:e.statusCode||e.status||500,code:e.code}}); release(); await Promise.all([assigning,disabling]);
  if(result.status!==409 || !(await db.user.findUniqueOrThrow({where:{id:extra.id}})).isActive) throw Error('assignment before disable failed '+JSON.stringify(result));
  const extra2=await db.user.create({data:{name:code+'race2',email:code+'race2@example.test',password:'unused',role:'sales',organizationId:org,campusId:campus.id}});
  let result2:any;const res2:any={status(n:number){result2={status:n};return this},json(v:any){result2={...result2,body:v};return this}};await userController.deleteUser({user:actor,params:{id:extra2.id}} as any,res2,(e:any)=>{result2={status:e.statusCode||e.status||500}});
  let rejected=false;try{await db.$transaction(tx=>scopedStaff(tx,actor,extra2.id))}catch{rejected=true};if(result2.status!==200||!rejected)throw Error('disable before assignment failed');
  console.log('PASS 先分配再停用被拦截；先停用后分配被拒绝');
 }finally{if(org) {await db.resourceTransfer.deleteMany({where:{organizationId:org}}); await db.user.deleteMany({where:{organizationId:org,name:{startsWith:code}}}); await db.organization.delete({where:{id:org}});} if(other) await db.organization.delete({where:{id:other}}); await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
