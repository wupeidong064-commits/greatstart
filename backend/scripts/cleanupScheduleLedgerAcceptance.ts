import 'dotenv/config';
import p from '../src/config/database';
const code=process.argv[2];
if(!code?.startsWith('SCHEDULE-QA-')) throw new Error('必须明确提供独立测试机构代码 SCHEDULE-QA-*');
(async()=>{const org=await p.organization.findUnique({where:{code}});if(!org)return;await p.$transaction(async tx=>{await tx.lessonDeductionRecord.deleteMany({where:{organizationId:org.id}});await tx.organization.delete({where:{id:org.id}})});console.log('指定独立测试机构已清理');})().finally(()=>p.$disconnect());
