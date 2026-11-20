import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import { studentAccess } from '../utils/studentAccess';
import { resolveScope } from '../utils/scope';
import { transferEnrollments, transferRequest } from '../services/enrollmentTransfer';
import type { Prisma } from '@prisma/client';
import { assertCanEndEnrollment, assertEnrollmentCapacity, lockEnrollmentClass, lockEnrollmentStudent, recordedAttendanceForRemoval, rejectClientEnrollmentPeriod } from '../services/enrollmentPeriod';
import { recallStudentWhere, responsibilityEnrollmentWhere, teachingStudentWhere } from '../services/studentResponsibility';
import { effectiveRole, lockManagement } from '../services/managementAccess';


const scopedEnrollmentWhere = (req: AuthRequest, id: string, includeRecall = false): Prisma.EnrollmentWhereInput => {
  const access = studentAccess(req, { includeRecall });
  return { id, organizationId: access.campus.organizationId, class: access.campus, student: access.where };
};

async function lockScopedEnrollment(tx: Prisma.TransactionClient, req: AuthRequest, id: string, allowRemovalReplay = false) {
  const where = scopedEnrollmentWhere(req, id, allowRemovalReplay);
  const candidate = await tx.enrollment.findFirst({ where });
  if (!candidate) throw new ApiError('报名记录不存在或无权访问', 404, 'ENROLLMENT_NOT_FOUND');
  await lockEnrollmentStudent(tx, candidate.studentId, studentAccess(req).campus);
  await lockEnrollmentClass(tx, candidate.classId, studentAccess(req).campus);
  // The enrollment row lock also serializes payment foreign-key references with deletion.
  await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${id} FOR UPDATE`;
  // Repeat both record and permission lookup after waiting for concurrent writers.
  const enrollment = await tx.enrollment.findFirst({ where: scopedEnrollmentWhere(req, id, allowRemovalReplay) });
  if (!enrollment) throw new ApiError('报名记录不存在或无权访问', 404, 'ENROLLMENT_NOT_FOUND');
  const access = studentAccess(req);
  if (!access.management && access.teacher) {
    const owned = await tx.enrollment.findFirst({ where: { id, class: { ...access.campus, teacherId: access.actor.id, status: { not: 'deleted' } }, student: { AND: [teachingStudentWhere(access.campus, access.actor.id)] } }, select: { id: true } });
    const receipt = enrollment.removalReceipt as { actorId?: string } | null;
    const replay = !owned && allowRemovalReplay && enrollment.status === 'cancelled' && enrollment.endedAt && receipt?.actorId === access.actor.id &&
      await tx.student.findFirst({ where: { id: enrollment.studentId, AND: [recallStudentWhere(access.campus, access.actor.id)] }, select: { id: true } });
    if (!owned && !replay) throw new ApiError('只能移除本人负责班级的学员；回访权限不包含他班报名调整',403,'FORBIDDEN');
  }
  return enrollment;
}

export const enrollmentController = {
  getEnrollments: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {organizationId,campusId}=resolveScope(req),page=Math.max(1,Number(req.query.page)|0),pageSize=Math.min(1000,Math.max(1,Number(req.query.pageSize||10)|0));
      const scope={organizationId,...(campusId?{campusId}:{})};
      const where={organizationId,class:scope,student:studentAccess(req).where,...Object.fromEntries(['studentId','classId','status'].flatMap(k=>typeof req.query[k]==='string'?[[k,req.query[k]]]:[]))};
      const [rows,count]=await prisma.$transaction([prisma.enrollment.findMany({where,orderBy:[{enrolledAt:'desc'},{id:'asc'}],skip:(page-1)*pageSize,take:pageSize,include:{class:{select:{id:true,name:true,code:true}}}}),prisma.enrollment.count({where})]);
      sendPaginated(res,rows,page,pageSize,count);
    } catch (error) {
      next(error);
    }
  },

  getEnrollmentById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const enrollment = await prisma.enrollment.findFirst({ where: scopedEnrollmentWhere(req, req.params.id) });
      if (!enrollment) throw new ApiError('报名记录不存在或无权访问', 404, 'ENROLLMENT_NOT_FOUND');
      sendSuccess(res, enrollment);
    } catch (error) { next(error); }
  },

  createEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      rejectClientEnrollmentPeriod(req.body);
      const { studentId, classId, notes } = req.body;
      const access = studentAccess(req);
      if (typeof studentId !== 'string' || !studentId || typeof classId !== 'string' || !classId) throw new ApiError('请选择学员和班级', 400);
      if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) throw new ApiError('备注不能超过 2000 字', 400);
      if (req.body.status !== undefined && req.body.status !== 'active') throw new ApiError('新报名必须为有效状态', 400);
      const enrollment = await prisma.$transaction(async tx => {
        const student = await lockEnrollmentStudent(tx, studentId, access.campus);
        if (student.status !== 'active') throw new ApiError('学员当前不可入班', 409, 'STUDENT_UNAVAILABLE');
        if (!await tx.student.findFirst({ where: { ...studentAccess(req).where, id: studentId }, select: { id: true } })) throw new ApiError('只能办理本人负责学员的报名', 403);
        const destination = await lockEnrollmentClass(tx, classId, access.campus);
        if (destination.status !== 'active') throw new ApiError('班级已停用', 409, 'CLASS_UNAVAILABLE');
        if (!access.management && access.teacher && (destination.teacherId !== access.actor.id || !await tx.student.findFirst({ where: { id: studentId, AND: [teachingStudentWhere(access.campus, access.actor.id)] }, select: { id: true } }))) throw new ApiError('回访权限不包含入班；请由管理员安排班级',403,'RECALL_PROFILE_ONLY');
        if (await tx.enrollment.findFirst({ where: { studentId, classId, status: 'active' } })) throw new ApiError('该学员已报名此班级', 409, 'ENROLLMENT_EXISTS');
        await assertEnrollmentCapacity(tx, classId, destination.capacity);
        return tx.enrollment.create({ data: { organizationId: access.campus.organizationId, studentId, classId, enrolledBy: access.actor.id, enrolledAt: new Date(), notes } });
      });
      sendSuccess(res, enrollment, '报名成功', 201);
    } catch (error) { next(error); }
  },

  updateEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      rejectClientEnrollmentPeriod(req.body);
      const { status, notes } = req.body;
      if (status !== undefined && !['active', 'completed', 'cancelled'].includes(status)) throw new ApiError('报名状态无效，请使用正式调班操作', 400);
      if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) throw new ApiError('备注不能超过 2000 字', 400);
      const updated = await prisma.$transaction(async tx => {
        const enrollment = await lockScopedEnrollment(tx, req, req.params.id);
        const data: Prisma.EnrollmentUpdateInput = {};
        if (status !== undefined && status !== enrollment.status) {
          if (enrollment.status !== 'active' || enrollment.endedAt) throw new ApiError('以前的报名已经结束，请新建报名以保留历史', 409, 'ENROLLMENT_ALREADY_ENDED');
          const endedAt = new Date();
          await assertCanEndEnrollment(tx, enrollment, endedAt);
          data.status = status;
          data.endedAt = endedAt;
        }
        // Repeating the same terminal status does not invent a legacy end date.
        if (notes !== undefined) data.notes = notes;
        if (!Object.keys(data).length) return enrollment;
        return tx.enrollment.update({ where: { id: enrollment.id }, data });
      });
      sendSuccess(res, updated, '报名记录更新成功');
    } catch (error) { next(error); }
  },

  removeAsLost: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = studentAccess(req);
      if (!access.management && !access.teacher) throw new ApiError('仅负责老师或管理员可办理退班', 403, 'FORBIDDEN');
      const result = await prisma.$transaction(async tx => {
        await lockManagement(tx,access.campus.organizationId);
        const actor = await tx.user.findUnique({ where: { id: access.actor.id } });
        if (!actor?.isActive || actor.organizationId !== access.campus.organizationId || actor.campusId !== access.campus.campusId || effectiveRole(actor) !== access.actor.role || actor.isPlatformAdmin !== !!access.actor.isPlatformAdmin)
          throw new ApiError('账号权限已变化，请刷新后重试',403,'FORBIDDEN');
        const enrollment = await lockScopedEnrollment(tx, req, req.params.id, true);
        const student = await tx.student.findFirst({ where: { id: enrollment.studentId, ...access.campus } });
        if (!student || student.status === 'archived') throw new ApiError('学员不存在或已经归档', 409, 'STUDENT_UNAVAILABLE');
        const endedAt = new Date();
        // Check the original receipt before counting other classes: their state
        // may have changed since a successful request whose response was lost.
        const previous = enrollment.removalReceipt as { payload?: string } | null;
        if (previous) {
          if (enrollment.status !== 'cancelled' || !enrollment.endedAt) throw new ApiError('移除记录与报名状态不一致，请联系管理员核对',409,'REMOVAL_STATE_CONFLICT');
          if (previous.payload === JSON.stringify({ mode: 'class-only' })) return { enrollment, studentId: student.id, replayed: true, mode: 'class-only' as const };
          const reason = typeof req.body.deleteReason === 'string' ? req.body.deleteReason.trim() : '';
          if (previous.payload !== JSON.stringify({ reason, recall: req.body.expectedRecallDate })) throw new ApiError('该报名已用其他流失资料移除，请刷新后核对',409,'REMOVAL_REQUEST_CONFLICT');
          return { enrollment, studentId: student.id, replayed: true, mode: 'lost' as const };
        }
        // 2026-11-08 用户拍板：多班学员减课 ≠ 流失——学员仍在其他班在读时，仅结束本班报名，学员状态保持不变。
        const otherActive = await tx.enrollment.count({
          where: {
            ...responsibilityEnrollmentWhere(access.campus,endedAt), studentId: student.id, id: { not: enrollment.id },
          },
        });
        if (otherActive > 0) {
          const payload = JSON.stringify({ mode: 'class-only' });
          const retainedAttendanceIds = await recordedAttendanceForRemoval(tx, enrollment, endedAt);
          const closed = await tx.enrollment.updateMany({
            where: { id: enrollment.id, organizationId: access.campus.organizationId, status: 'active', endedAt: null },
            data: { status: 'cancelled', endedAt, removalReceipt: { payload, actorId: access.actor.id, studentId: student.id, endedAt: endedAt.toISOString(), retainedAttendanceIds } },
          });
          if (closed.count !== 1) throw new ApiError('报名已发生变化，请刷新后核对', 409, 'ENROLLMENT_CHANGED');
          return { enrollment: await tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } }), studentId: student.id, replayed: false, mode: 'class-only' as const };
        }
        // 最后一个在读班：按流失学员库流程承接（2026-11-07 用户拍板口径不变）
        const reason = typeof req.body.deleteReason === 'string' ? req.body.deleteReason.trim() : '';
        const recall = req.body.expectedRecallDate;
        if (!reason || reason.length > 200 || /[,\n\r]/.test(reason)) throw new ApiError('请填写流失原因（最多200字，不含换行或逗号）', 400, 'INVALID_LOST_REASON');
        if (typeof recall !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(recall) || !Number.isFinite(+new Date(recall)) || new Date(recall).toISOString().slice(0, 10) !== recall) {
          throw new ApiError('请选择有效的预计召回日期', 400, 'INVALID_RECALL_DATE');
        }
        const input = JSON.stringify({ reason, recall });
        const retainedAttendanceIds = await recordedAttendanceForRemoval(tx, enrollment, endedAt);
        // Preserve unrelated notes while replacing the two fields shown by the lost-student form.
        const preserved = (student.notes || '').replace(/(?:删除原因|预计召回时间):[^,\n]*/g, '').replace(/^[,\s]+|[,\s]+$/g, '');
        const notes = [preserved, `删除原因:${reason}, 预计召回时间:${recall}`].filter(Boolean).join('\n');
        const closed = await tx.enrollment.updateMany({
          where: { id: enrollment.id, organizationId: access.campus.organizationId, status: 'active', endedAt: null },
          data: { status: 'cancelled', endedAt, removalReceipt: { payload: input, actorId: access.actor.id, studentId: student.id, endedAt: endedAt.toISOString(), retainedAttendanceIds } },
        });
        if (closed.count !== 1) throw new ApiError('报名已发生变化，请刷新后核对', 409, 'ENROLLMENT_CHANGED');
        const formerClass = await tx.class.findFirst({where:{id:enrollment.classId,...access.campus},select:{teacherId:true,teacher:{select:{role:true,organizationId:true,campusId:true,isPlatformAdmin:true}}}});
        const formerTeacher = formerClass?.teacher;
        const recallTeacherId = formerTeacher && !formerTeacher.isPlatformAdmin && formerTeacher.organizationId===access.campus.organizationId && formerTeacher.campusId===access.campus.campusId && ['teacher','coach'].includes(formerTeacher.role) ? formerClass!.teacherId : null;
        await tx.student.update({ where: { id: student.id }, data: { status: 'lost', notes, recallTeacherId } });
        return { enrollment: await tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } }), studentId: student.id, replayed: false, mode: 'lost' as const };
      }, { maxWait: 10000, timeout: 20000 });
      sendSuccess(
        res,
        result,
        result.mode === 'class-only'
          ? result.replayed ? '此前移除操作已完成，请刷新名单' : '已从本班移除；学员在其他班级仍在读，未转入流失库'
          : result.replayed ? '此前移除操作已完成，请刷新名单' : '已移除并转入流失学员库'
      );
    } catch (error) { next(error); }
  },

  deleteEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await prisma.$transaction(async tx => {
        const enrollment = await lockScopedEnrollment(tx, req, req.params.id);
        const hasHistory = enrollment.status !== 'active' || !!enrollment.endedAt ||
          await tx.payment.count({ where: { enrollmentId: enrollment.id } }) ||
          await tx.attendance.count({ where: { studentId: enrollment.studentId, classId: enrollment.classId } }) ||
          await tx.lessonTransfer.count({ where: { studentId: enrollment.studentId, OR: [{ fromClassId: enrollment.classId }, { toClassId: enrollment.classId }] } }) ||
          await tx.schedule.count({ where: { classId: enrollment.classId, endTime: { gte: enrollment.enrolledAt, lte: new Date() }, status: { notIn: ['cancelled', 'rescheduled', 'class_paused'] } } });
        if (hasHistory) throw new ApiError('报名已有历史，请保留记录并变更状态', 409, 'ENROLLMENT_HAS_HISTORY');
        await tx.enrollment.delete({ where: { id: enrollment.id } });
      });
      sendSuccess(res, null, '报名记录删除成功');
    } catch (error) { next(error); }
  },

  transferStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user?.organizationId || !user.campusId || !['admin', 'manager'].includes(user.role)) throw new ApiError('需要校区管理权限', 403, 'FORBIDDEN');
      rejectClientEnrollmentPeriod(req.body);
      const input = transferRequest(req.body);
      const actor = { id: user.id, organizationId: user.organizationId, campusId: user.campusId };
      const result = await prisma.$transaction(tx => transferEnrollments(tx, input, actor), { maxWait: 10000, timeout: 20000 });
      sendSuccess(res, input.batch ? result : result.transfers[0], '已调班，课时保持不变');
    } catch (error) { next(error); }
  },
};
