import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import { hiddenTimetableOccurrence } from '../services/scheduleConflicts';
import { experienceScopeWhere } from '../utils/experienceScope';
import { jobRole } from '../services/managementAccess';
import { handoverInput, lockHandover, planHandover, assertHandoverAvailable, applyHandover, teachingRoles } from '../services/resourceHandover';
import { batchHandoverInput, planBatchHandover, executeBatchHandover } from '../services/batchClassHandover';
import { followupBatchInput, planFollowupBatch, executeFollowupBatch } from '../services/batchFollowupHandover';
import { dormantInput, dormantCandidates, dormantResources, planDormantBatch, executeDormantBatch } from '../services/dormantStudentHandover';

function actorScope(req:AuthRequest) {
  const actor=req.user;
  if (!actor?.organizationId || !actor.campusId || actor.isPlatformAdmin || actor.role !== 'manager') throw new ApiError('无权交接或未分配校区',403,'FORBIDDEN');
  return actor as typeof actor & {organizationId:string;campusId:string};
}
async function historyWhere(req:AuthRequest) {
  const actor=actorScope(req);
  const users=await prisma.user.findMany({where:{organizationId:actor.organizationId,campusId:actor.campusId},select:{id:true}});
  return {organizationId:actor.organizationId,fromTeacherId:{in:users.map(u=>u.id)},toTeacherId:{in:users.map(u=>u.id)}};
}
const presentTransfer = (row:any) => ({...row,organization_id:row.organizationId,from_teacher_id:row.fromTeacherId,from_teacher_name:row.fromTeacherName,to_teacher_id:row.toTeacherId,to_teacher_name:row.toTeacherName,transfer_details:row.transferDetails,operated_by:row.operatedBy,operated_by_name:row.operatedByName,created_at:row.createdAt});
export const resourceTransferController = {
  getDormantCandidates:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try { const actor=actorScope(req); sendSuccess(res,await prisma.$transaction(tx=>dormantCandidates(tx,actor))); }catch(e){next(e)}
  },
  getDormantResources:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try { const actor=actorScope(req); sendSuccess(res,await prisma.$transaction(tx=>dormantResources(tx,actor,req.params.userId))); }catch(e){next(e)}
  },
  previewDormantBatch:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try { const actor=actorScope(req),input=dormantInput(req.body); const result=await prisma.$transaction(async tx=>{await lockHandover(tx,actor);return(await planDormantBatch(tx,actor,input)).preview;},{timeout:30000});sendSuccess(res,result); }catch(e){next(e)}
  },
  executeDormantBatch:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try { const actor=actorScope(req),input=dormantInput(req.body,true);sendSuccess(res,await prisma.$transaction(tx=>executeDormantBatch(tx,actor,input),{timeout:30000}),'已完成本批沉默学员交接'); }catch(e){next(e)}
  },
  previewFollowupBatch:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req),input=followupBatchInput(req.body);
      const result=await prisma.$transaction(async tx=>{
        await lockHandover(tx,actor);
        return (await planFollowupBatch(tx,actor,input)).preview;
      },{timeout:30000});
      sendSuccess(res,result);
    }catch(e){next(e)}
  },
  executeFollowupBatch:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req),input=followupBatchInput(req.body,true);
      const result=await prisma.$transaction(tx=>executeFollowupBatch(tx,actor,input),{timeout:30000});
      sendSuccess(res,result,'已完成本批跟进资源交接');
    }catch(e){next(e)}
  },
  previewBatch:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req),input=batchHandoverInput(req.body);
      const result=await prisma.$transaction(async tx=>{
        await lockHandover(tx,actor);
        return (await planBatchHandover(tx,actor,input)).preview;
      },{timeout:30000});
      sendSuccess(res,result);
    }catch(e){next(e)}
  },
  executeBatch:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req),input=batchHandoverInput(req.body,true);
      const result=await prisma.$transaction(tx=>executeBatchHandover(tx,actor,input),{timeout:30000});
      sendSuccess(res,result,'已完成本批班级交接');
    }catch(e){next(e)}
  },
  getFollowupCandidates:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req);
      const users=await prisma.user.findMany({where:{organizationId:actor.organizationId,campusId:actor.campusId,isPlatformAdmin:false,role:{not:'parent'}},select:{id:true,name:true,role:true,isActive:true},orderBy:[{name:'asc'},{id:'asc'}]});
      const staff=users.map(user=>({...user,jobRole:jobRole(user)}));
      const active=staff.filter(user=>user.isActive);
      // Kept separate for recovery workflows, never mixed into the staff selector.
      sendSuccess(res,{sources:active,recipients:active,inactiveSources:staff.filter(user=>!user.isActive)});
    }catch(e){next(e)}
  },
  getFollowupResources:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req), id=req.params.userId;
      const user=await prisma.user.findFirst({where:{id,organizationId:actor.organizationId,campusId:actor.campusId,isPlatformAdmin:false,role:{not:'parent'}},select:{id:true}});
      if(!user) throw new ApiError('人员不属于当前机构',403,'FORBIDDEN');
      const [leads,experiences]=await Promise.all([
        prisma.lead.findMany({where:{organizationId:actor.organizationId,assigneeId:id,status:{notIn:['converted','lost']}},select:{id:true,customerName:true,contact:true,status:true},orderBy:{createdAt:'desc'}}),
        prisma.experienceLesson.findMany({where:{...experienceScopeWhere(actor.organizationId,actor.campusId),assigneeId:id,status:{notIn:['converted','cancelled']}},select:{id:true,studentName:true,contact:true,status:true,scheduleDate:true},orderBy:{scheduleDate:'desc'}}),
      ]);
      sendSuccess(res,{leads,experiences,students:[]});
    }catch(e){next(e)}
  },
  executeFollowup:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req), {fromUserId,toUserId,leadIds,experienceIds,studentIds=[],notes}=req.body;
      if(!Array.isArray(studentIds)||studentIds.length) throw new ApiError('销售交接仅支持线索与体验课；在班学员随班级交接，回访名单请使用沉默学员交接',400,'STUDENT_HANDOVER_REMOVED');
      const valid=(a:unknown):a is string[]=>Array.isArray(a)&&a.length<=1000&&a.every(x=>typeof x==='string'&&x.length>0)&&new Set(a).size===a.length;
      if(typeof fromUserId!=='string'||!fromUserId||typeof toUserId!=='string'||!toUserId||fromUserId===toUserId||!valid(leadIds)||!valid(experienceIds)||!valid(studentIds)||!leadIds.length&&!experienceIds.length&&!studentIds.length||(notes!==undefined&&(typeof notes!=='string'||notes.length>2000))) throw new ApiError('请选择人员和待交接资源',400,'INVALID_PARAMS');
      const result=await prisma.$transaction(async tx=>{
        const operator=await lockHandover(tx,actor);
        const scope={organizationId:actor.organizationId,campusId:actor.campusId,isPlatformAdmin:false,role:{not:'parent'}};
        const [from,to]=await Promise.all([tx.user.findFirst({where:{...scope,id:fromUserId}}),tx.user.findFirst({where:{...scope,id:toUserId,isActive:true}})]);
        if(!from||!to) throw new ApiError('请选择本校区人员和在职接手人',403,'FORBIDDEN');
        const leads=await tx.lead.updateMany({where:{organizationId:actor.organizationId,assigneeId:from.id,status:{notIn:['converted','lost']},id:{in:leadIds}},data:{assigneeId:to.id,assigneeName:to.name}});
        const exp=await tx.experienceLesson.updateMany({where:{...experienceScopeWhere(actor.organizationId,actor.campusId),assigneeId:from.id,status:{notIn:['converted','cancelled']},id:{in:experienceIds}},data:{assigneeId:to.id,assigneeName:to.name}});
        if(leads.count!==leadIds.length||exp.count!==experienceIds.length) throw new ApiError('资源已变化，请刷新后重试',409,'RESOURCE_CHANGED');
        const log=await tx.resourceTransfer.create({data:{organizationId:actor.organizationId,fromTeacherId:from.id,fromTeacherName:from.name,toTeacherId:to.id,toTeacherName:to.name,transferDetails:{kind:'followup',leads:leadIds,experiences:experienceIds,leadCount:leads.count,experienceCount:exp.count,students:[],studentCount:0},operatedBy:operator.id,operatedByName:operator.name,notes}});
        return {transferId:log.id,leadCount:leads.count,experienceCount:exp.count,studentCount:0};
      },{timeout:20000});
      sendSuccess(res,result,'交接成功');
    }catch(e){next(e)}
  },
  getTeacherResources:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req),teacher=await prisma.user.findFirst({where:{id:req.params.teacherId,organizationId:actor.organizationId,campusId:actor.campusId,isPlatformAdmin:false,role:{in:teachingRoles}},select:{id:true,name:true,email:true,role:true,isActive:true}});
      if(!teacher)throw new ApiError('老师不属于当前机构',403,'FORBIDDEN');
      const where={organizationId:actor.organizationId,campusId:actor.campusId,teacherId:teacher.id};
      const classes=await prisma.class.findMany({where:{...where,status:{not:'deleted'}},include:{_count:{select:{enrollments:{where:{status:'active'}}}}}});
      const [schedules,total,upcoming,completed]=await Promise.all([prisma.schedule.findMany({where,orderBy:{startTime:'desc'},take:50,include:{class:{select:{id:true,name:true}}}}),prisma.schedule.count({where}),prisma.schedule.count({where:{...where,status:'scheduled',startTime:{gt:new Date()},NOT:hiddenTimetableOccurrence()}}),prisma.schedule.count({where:{...where,status:'completed'}})]);
      sendSuccess(res,{teacher,summary:{classCount:classes.length,studentCount:classes.reduce((n,c)=>n+c._count.enrollments,0),totalScheduleCount:total,upcomingScheduleCount:upcoming,completedScheduleCount:completed},classes:classes.map(c=>({...c,studentCount:c._count.enrollments})),schedules});
    }catch(e){next(e)}
  },
  getCandidates:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req), scope={organizationId:actor.organizationId,campusId:actor.campusId,isActive:true,isPlatformAdmin:false,role:{in:teachingRoles}};
      const select={id:true,name:true,email:true,role:true,isActive:true};
      const users=await prisma.user.findMany({where:scope,select:{...select,_count:{select:{taughtClasses:{where:{organizationId:actor.organizationId,campusId:actor.campusId,status:{not:'deleted'}}}}}},orderBy:[{name:'asc'},{id:'asc'}]});
      const teachers=users.map(({_count,...user})=>({...user,classCount:_count.taughtClasses}));
      const inactiveSources=await prisma.user.findMany({where:{organizationId:actor.organizationId,campusId:actor.campusId,isActive:false,isPlatformAdmin:false,role:{in:teachingRoles},taughtClasses:{some:{organizationId:actor.organizationId,campusId:actor.campusId,status:{not:'deleted'}}}},select,orderBy:[{name:'asc'},{id:'asc'}]});
      const data={sources:teachers,recipients:teachers,inactiveSources};
      sendSuccess(res,data);
    }catch(e){next(e)}
  },
  previewTransfer:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req),input=handoverInput(req.body);
      const result=await prisma.$transaction(async tx=>{
        await lockHandover(tx,actor);
        const plan=await planHandover(tx,actor,input);
        return {canTransfer:plan.conflicts.length===0,conflicts:plan.conflicts,details:plan.details};
      },{timeout:20000});
      sendSuccess(res,result);
    }catch(e){next(e)}
  },
  executeTransfer:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try {
      const actor=actorScope(req),input=handoverInput(req.body);
      const result=await prisma.$transaction(async tx=>{
        const operator=await lockHandover(tx,actor);
        const plan=await planHandover(tx,actor,input);
        assertHandoverAvailable(plan);
        await applyHandover(tx,plan);
        const log=await tx.resourceTransfer.create({data:{organizationId:actor.organizationId,fromTeacherId:plan.from.id,fromTeacherName:plan.from.name,toTeacherId:plan.to.id,toTeacherName:plan.to.name,transferDetails:plan.details,status:'completed',operatedBy:operator.id,operatedByName:operator.name,notes:input.notes}});
        return {transferId:log.id,fromTeacher:{id:plan.from.id,name:plan.from.name},toTeacher:{id:plan.to.id,name:plan.to.name},details:plan.details};
      },{timeout:20000});
      sendSuccess(res,result,'资源交接成功');
    }catch(e){next(e)}
  },
  getTransferHistory:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try{const where=await historyWhere(req),page=Math.max(1,Number(req.query.page)||1),pageSize=Math.min(100,Math.max(1,Number(req.query.pageSize)||20));const [rows,count]=await Promise.all([prisma.resourceTransfer.findMany({where,orderBy:{createdAt:'desc'},skip:(page-1)*pageSize,take:pageSize}),prisma.resourceTransfer.count({where})]);sendPaginated(res,rows.map(presentTransfer),page,pageSize,count);}catch(e){next(e)}
  },
  getTransferById:async(req:AuthRequest,res:Response,next:NextFunction)=>{
    try{const row=await prisma.resourceTransfer.findFirst({where:{...await historyWhere(req),id:req.params.id}});if(!row)throw new ApiError('交接记录不存在或无权访问',403,'FORBIDDEN');sendSuccess(res,presentTransfer(row));}catch(e){next(e)}
  },
};
