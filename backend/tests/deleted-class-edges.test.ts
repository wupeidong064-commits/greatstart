import { describe, it, expect, vi, beforeEach } from 'vitest';
const { db, tx } = vi.hoisted(() => {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn(), class: {findFirst:vi.fn()}, user:{findFirst:vi.fn(),findMany:vi.fn().mockResolvedValue([])}, student:{findMany:vi.fn().mockResolvedValue([])}, lead:{findMany:vi.fn().mockResolvedValue([])}, lessonDeductionRecord:{create:vi.fn()}, experienceLesson:{create:vi.fn(),findFirst:vi.fn(),update:vi.fn()} };
  return {tx, db:{$transaction:vi.fn(async (fn:any)=>fn(tx)),class:{findFirst:vi.fn()},experienceLesson:{findUnique:vi.fn(),findFirst:vi.fn()}}};
});
vi.mock('../src/config/database',()=>({default:db}));
import {experienceLessonController as lessons} from '../src/controllers/experienceLessonController';
import {conversionController as conversions} from '../src/controllers/conversionController';
import {lessonDeductionController as deductions} from '../src/controllers/lessonDeductionController';
const user={organizationId:'org',campusId:'campus',id:'actor',role:'admin'};
describe('deleted class boundary writes',()=>{
 beforeEach(()=>{vi.clearAllMocks(); db.class.findFirst.mockResolvedValue({id:'deleted',status:'deleted'});tx.class.findFirst.mockResolvedValue({id:'deleted',status:'deleted'});tx.user.findFirst.mockResolvedValue({campusId:'campus'});});
 it('rejects creating experience lessons after transaction lock',async()=>{
  const next=vi.fn();await lessons.createExperienceLesson({user,get:vi.fn(),body:{classId:'deleted',studentName:'学员',contact:'预约',scheduleDate:'2026-11-09'}} as any,{} as any,next);
  expect(next.mock.calls[0][0].code).toBe('CLASS_DELETED');expect(tx.experienceLesson.create).not.toHaveBeenCalled();expect(tx.$executeRaw).toHaveBeenCalled();
 });
 it('rejects moving experience lesson to deleted class',async()=>{
  db.experienceLesson.findUnique.mockResolvedValue({id:'lesson',classId:'old'});db.experienceLesson.findFirst.mockResolvedValue({id:'lesson'});tx.experienceLesson.findFirst.mockResolvedValue({id:'lesson',classId:'old'});
  const next=vi.fn();await lessons.updateExperienceLesson({user,params:{id:'lesson'},body:{classId:'deleted'}} as any,{} as any,next);
  expect(next.mock.calls[0][0].code).toBe('CLASS_DELETED');expect(tx.experienceLesson.update).not.toHaveBeenCalled();
 });
 it('allows editing historical notes with unchanged class',async()=>{
  db.experienceLesson.findUnique.mockResolvedValue({id:'lesson',classId:'deleted'});db.experienceLesson.findFirst.mockResolvedValue({id:'lesson'});tx.experienceLesson.findFirst.mockResolvedValue({id:'lesson',classId:'deleted'});tx.experienceLesson.update.mockResolvedValue({id:'lesson'});
  const next=vi.fn(),res={status:vi.fn().mockReturnThis(),json:vi.fn()};await lessons.updateExperienceLesson({user,params:{id:'lesson'},body:{classId:'deleted',notes:'history'}} as any,res as any,next);
  expect(next).not.toHaveBeenCalled();expect(tx.experienceLesson.update).toHaveBeenCalled();expect(tx.class.findFirst).not.toHaveBeenCalled();
 });
 it('rejects new conversion before writing any business rows',async()=>{
  const next=vi.fn();await conversions.createConversion({user,get:vi.fn(),body:{classId:'deleted',studentName:'学员',contact:'13800000000',conversionDate:'2026-11-07'}} as any,{} as any,next);
  expect(next.mock.calls[0][0].code).toBe('CLASS_DELETED');expect(tx.$executeRaw).toHaveBeenCalled();
 });
 it('rejects deductions and scopes target by operator campus',async()=>{
  await expect(deductions.createDeductionRecord('deleted','org','actor','A',1,'2026-11-07')).rejects.toMatchObject({code:'CLASS_DELETED'});
  expect(tx.lessonDeductionRecord.create).not.toHaveBeenCalled();expect(tx.class.findFirst).toHaveBeenCalledWith({where:{id:'deleted',organizationId:'org',campusId:'campus'}});
 });
});
