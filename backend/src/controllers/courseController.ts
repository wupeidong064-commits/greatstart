import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { renameClassCourseType } from '../services/classCourseType';
import { lockScheduleWrites } from '../services/scheduleConflicts';

function requireCourseActor(req: AuthRequest, write = false) {
  const actor = req.user;
  if (!actor?.organizationId || (write && !['admin', 'manager'].includes(actor.role || ''))) throw new ApiError('无权管理课程类型', 403, 'FORBIDDEN');
  if (req.body?.organizationId !== undefined && req.body.organizationId !== actor.organizationId) throw new ApiError('不能跨机构管理课程类型', 403, 'FORBIDDEN');
  return actor as typeof actor & { organizationId: string };
}

function textField(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) throw new ApiError(`${label}不能为空且不能超过${maxLength}字`, 400, 'INVALID_COURSE');
  return value.trim();
}

function courseFields(body: Record<string, unknown>, creating = false) {
  const fields: {name?: string; code?: string; description?: string | null; duration?: number; price?: number; isActive?: boolean} = {};
  if (creating || body.name !== undefined) fields.name = textField(body.name, '课程名称', 100);
  if (body.code !== undefined) fields.code = textField(body.code, '课程编码', 100);
  if (body.description !== undefined) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 2000)) throw new ApiError('课程说明无效或超过2000字', 400, 'INVALID_COURSE');
    fields.description = body.description as string | null;
  }
  for (const key of ['duration', 'price'] as const) {
    if (body[key] === undefined) continue;
    const raw = body[key];
    if ((typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '') throw new ApiError(key === 'duration' ? '课时长度无效' : '价格无效', 400, 'INVALID_COURSE');
    const value = Number(raw);
    if (!Number.isFinite(value) || (key === 'duration' ? !Number.isInteger(value) || value <= 0 || value > 1440 : value < 0)) throw new ApiError(key === 'duration' ? '课时长度须为1至1440分钟的整数' : '价格须为非负数', 400, 'INVALID_COURSE');
    fields[key] = value;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw new ApiError('启用状态无效', 400, 'INVALID_COURSE');
    fields.isActive = body.isActive;
  }
  return fields;
}

async function scopedCourse(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  const course = await tx.course.findUnique({where: {id}});
  if (!course) throw new ApiError('课程类型不存在', 404, 'COURSE_NOT_FOUND');
  if (course.organizationId !== organizationId) throw new ApiError('无权访问该课程类型', 403, 'FORBIDDEN');
  return course;
}

// The institution lock serializes directory writes with schedule creation/deactivation.
async function ensureUnique(tx: Prisma.TransactionClient, organizationId: string, fields: {name?: string; code?: string}, excludeId?: string) {
  const scope = {organizationId, ...(excludeId ? {id: {not: excludeId}} : {})};
  if (fields.name !== undefined && await tx.course.findFirst({where: {...scope, name: {equals: fields.name, mode: 'insensitive'}}})) throw new ApiError('课程名称已存在（含已停用课程）', 400, 'NAME_EXISTS');
  if (fields.code !== undefined && await tx.course.findFirst({where: {...scope, code: {equals: fields.code, mode: 'insensitive'}}})) throw new ApiError('课程代码已存在（含已停用课程）', 400, 'CODE_EXISTS');
}

export const courseController = {
  getCourses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireCourseActor(req);
      if (req.query.capability === 'schedule_course_selection') {
        sendSuccess(res, {scheduleCourseSelection: true});
        return;
      }
      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      const pageSize = Math.min(1000, Math.max(1, Math.floor(Number(req.query.pageSize) || 10)));
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
      const where: Prisma.CourseWhereInput = {organizationId: actor.organizationId,
        ...(isActive !== undefined ? {isActive} : {}),
        ...(search ? {OR: [{name: {contains: search, mode: 'insensitive'}}, {code: {contains: search, mode: 'insensitive'}}]} : {}),
      };
      const [courses, count] = await prisma.$transaction([
        prisma.course.findMany({where, orderBy: [{createdAt: 'desc'}, {id: 'asc'}], skip: (page - 1) * pageSize, take: pageSize}),
        prisma.course.count({where}),
      ]);
      sendPaginated(res, courses, page, pageSize, count);
    } catch (error) { next(error); }
  },
  getCourseById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireCourseActor(req);
      sendSuccess(res, await scopedCourse(prisma, actor.organizationId, req.params.id));
    } catch (error) { next(error); }
  },
  createCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireCourseActor(req, true);
      const fields = courseFields(req.body, true);
      const course = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        await ensureUnique(tx, actor.organizationId, fields);
        return tx.course.create({data: {...fields, organizationId: actor.organizationId, name: fields.name!, code: fields.code ?? `COURSE-${randomUUID()}`}});
      });
      sendSuccess(res, course, '课程类型创建成功', 201);
    } catch (error) { next(error); }
  },
  updateCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireCourseActor(req, true);
      const fields = courseFields(req.body);
      const course = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        const previous = await scopedCourse(tx, actor.organizationId, req.params.id);
        await ensureUnique(tx, actor.organizationId, fields, req.params.id);
        if (fields.name !== undefined && fields.name !== previous.name) {
          await renameClassCourseType(tx, previous, fields.name);
        }
        return tx.course.update({where: {id: req.params.id}, data: fields});
      });
      sendSuccess(res, course, '课程类型更新成功');
    } catch (error) { next(error); }
  },
  deleteCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireCourseActor(req, true);
      await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        await scopedCourse(tx, actor.organizationId, req.params.id);
        await tx.course.update({where: {id: req.params.id}, data: {isActive: false}});
      });
      sendSuccess(res, null, '课程类型已停用，历史排课保留');
    } catch (error) { next(error); }
  },
};
