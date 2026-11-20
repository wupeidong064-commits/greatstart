import { Router } from 'express';
import prisma from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { Prisma } from '@prisma/client';
import { isEmployeeWorkRole, employeeActor, buildStaffWork, workDay } from './staffWork';

export const followUpRoutes = Router();
followUpRoutes.use(authenticate, requireOrganizationAccess());
function actor(req: AuthRequest) {
  const u = req.user;
  if (!u?.id || !u.organizationId || !u.campusId || !['admin', 'manager', 'sales', 'coach', 'teacher', 'staff'].includes(u.role || '')) throw new ApiError('当前账号无法处理校区待办', 403, 'FORBIDDEN');
  return { userId: u.id, organizationId: u.organizationId, campusId: u.campusId };
}
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
followUpRoutes.get('/', async (req, res, next) => {
  try {
    const scope = actor(req);
    const day = today();
    if (isEmployeeWorkRole((req as AuthRequest).user?.role)) {
      const data = await prisma.$transaction(tx => buildStaffWork(employeeActor(req as AuthRequest), tx, day), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return sendSuccess(res, { day, records: data.tasks.filter(task => task.done).map(task => ({ key: JSON.stringify([scope.organizationId, scope.campusId, scope.userId, day, task.key, task.revision]), day, completedAt: task.completedAt })) });
    }
    const rows = await prisma.followUpCompletion.findMany({ where: { ...scope, day, done: true }, select: { taskKey: true, revision: true, updatedAt: true } });
    sendSuccess(res, { day, records: rows.map(r => ({ key: JSON.stringify([scope.organizationId, scope.campusId, scope.userId, day, r.taskKey, r.revision]), day, completedAt: r.updatedAt.toISOString() })) });
  } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') return next(new ApiError('工作记录已变化，请刷新重试', 409, 'WORK_CONFLICT')); next(e); }
});
followUpRoutes.put('/', async (req, res, next) => {
  try {
    const scope = actor(req);
    const { taskKey, revision, done } = req.body;
    if (typeof taskKey !== 'string' || taskKey.length > 200 || typeof revision !== 'string' || revision.length > 500 || typeof done !== 'boolean') throw new ApiError('跟进参数无效', 400, 'INVALID_TASK');
    const principal = (req as AuthRequest).user;
    const managementMode = req.body.mode === 'management';
    if (managementMode && !['admin', 'manager'].includes(principal?.role || '')) throw new ApiError('无权使用管理员待办', 403, 'FORBIDDEN');
    if (!managementMode && (isEmployeeWorkRole(principal?.role) || (req.body.day !== undefined && isEmployeeWorkRole(principal?.jobRole || undefined)))) {
      const actor = employeeActor(req as AuthRequest);
      const day = workDay();
      if (req.body.day !== day) throw new ApiError('日期已变化，请刷新今日工作', 409, 'STALE_WORK_DAY');
      const row = await prisma.$transaction(async tx => {
        const work = await buildStaffWork(actor, tx, day);
        const task = work.tasks.find(item => item.key === taskKey);
        if (!task) throw new ApiError('无权处理此待办或其风险已解除，请刷新', 403, 'FORBIDDEN');
        if (task.revision !== revision) throw new ApiError('待办事实已变化，请刷新后处理', 409, 'STALE_WORK_TASK');
        return tx.followUpCompletion.upsert({ where: { userId_campusId_day_taskKey_revision: { userId: actor.userId, campusId: actor.campusId, day, taskKey, revision } }, create: { organizationId: actor.organizationId, campusId: actor.campusId, userId: actor.userId, day, taskKey, revision, done }, update: { done } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return sendSuccess(res, { day, taskKey, revision, done: row.done, completedAt: row.updatedAt.toISOString() });
    }
    // Older management clients omitted day; current management UI sends the displayed day.
    // When supplied, reject a stale page before writing any completion for the new day.
    if (req.body.day !== undefined && req.body.day !== today()) throw new ApiError('日期已变化，请刷新今日工作', 409, 'STALE_WORK_DAY');
    const [category, id, classId] = taskKey.split(':');
    if (!id) throw new ApiError('缺少待办对象', 400, 'INVALID_TASK');
    let allowed = false;
    if (category === 'lowClasses') allowed = !!await prisma.class.findFirst({ where: { id, organizationId: scope.organizationId, campusId: scope.campusId } });
    if (category === 'renewal' || category === 'lowStudents') {
      allowed = !!await prisma.student.findFirst({ where: { id, organizationId: scope.organizationId, campusId: scope.campusId } });
      if (classId && allowed) {
        const where = { studentId: id, classId, organizationId: scope.organizationId, class: { organizationId: scope.organizationId, campusId: scope.campusId } };
        const [enrollment, temporary] = await Promise.all([
          prisma.enrollment.findFirst({ where, select: { id: true } }),
          prisma.attendance.findFirst({ where: { ...where, isTemporary: true, schedule: { organizationId: scope.organizationId, classId, status: 'completed' } }, select: { id: true } }),
        ]);
        allowed = Boolean(enrollment || temporary);
      }
    }
    if (category === 'lead') {
      const users = await prisma.user.findMany({ where: { organizationId: scope.organizationId, campusId: scope.campusId }, select: { id: true } });
      allowed = !!await prisma.lead.findFirst({ where: { id, organizationId: scope.organizationId, OR: [{ assignee: { organizationId: scope.organizationId, campusId: scope.campusId } }, { assigneeId: null, createdById: { in: users.map(u => u.id) } }] } });
    }
    if (category === 'experience') allowed = !!await prisma.experienceLesson.findFirst({ where: { id, organizationId: scope.organizationId, OR: [{ class: { campusId: scope.campusId } }, { classId: null, assignee: { campusId: scope.campusId, organizationId: scope.organizationId } }] } });
    if (!allowed) throw new ApiError('无权访问该待办对象', 403, 'FORBIDDEN');
    const day = today();
    const row = await prisma.followUpCompletion.upsert({ where: { userId_campusId_day_taskKey_revision: { userId: scope.userId, campusId: scope.campusId, day, taskKey, revision } }, create: { ...scope, day, taskKey, revision, done }, update: { done } });
    sendSuccess(res, { day, done: row.done, completedAt: row.updatedAt.toISOString() });
  } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') return next(new ApiError('工作记录已变化，请刷新重试', 409, 'WORK_CONFLICT')); next(e); }
});
