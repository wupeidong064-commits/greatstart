import { ExperienceLesson, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { experienceScopeWhere } from '../utils/experienceScope';
import { parseProfileDate, validateRecordedAge } from '../utils/studentProfileFields';
import { assertExperiencePersonAvailable } from './experiencePersonIdentity';
import { lockScheduleWrites } from './scheduleConflicts';
import {
  accessibleLead, managesRegistrations, registrationActor, RegistrationActor, requestKey,
  runRegistration, scopedStaff, textValue,
} from './registrationRequestService';

const SHANGHAI_OFFSET = 8 * 3600000;
const shanghaiStamp = (date: Date) => new Date(+date + SHANGHAI_OFFSET).toISOString();
export const attendedStatuses = ['completed', 'unconverted', 'converted'];
const statuses = ['pending', ...attendedStatuses, 'cancelled', 'no-show', 'noshow'];
// Pre-enrollment sales responsibility is independent of the class/teaching teacher.
// A pending booking can sign up before attending; cancelled bookings cannot.
export const signupExperienceStatuses = ['pending', ...attendedStatuses, 'noshow', 'no-show'];

export function registrationWindow(start = new Date()) {
  const local = new Date(+start + SHANGHAI_OFFSET);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, lastDay));
  return { start, end: new Date(+local - SHANGHAI_OFFSET), timezone: 'Asia/Shanghai' as const };
}

export function experienceAccess(actor: RegistrationActor): Prisma.ExperienceLessonWhereInput {
  return { ...experienceScopeWhere(actor.organizationId, actor.campusId),
    ...(!managesRegistrations(actor) ? { assigneeId: actor.id } : {}) };
}

// Keep the order-scope precedence and confirmed signup definition aligned with the cashflow summary.
export function confirmedSignup(actor: RegistrationActor): Prisma.ConversionWhereInput {
  const tenant = { organizationId: actor.organizationId, campusId: actor.campusId };
  return { organizationId: tenant.organizationId, approvalStatus: 'confirmed', AND: [
    { OR: [{ class: tenant }, { classId: null, student: tenant }, { classId: null, studentId: null, sales: tenant }] },
    { OR: [{ courseType: null }, { courseType: { notIn: ['续费', 'renewal', '续报'] } }] },
  ] };
}

export function unconvertedWhere(actor: RegistrationActor, includeNoShows = false): Prisma.ExperienceLessonWhereInput {
  return { status: { in: includeNoShows ? [...attendedStatuses, 'noshow', 'no-show'] : attendedStatuses },
    conversions: { none: confirmedSignup(actor) } };
}

const scheduleSelect = {
  id: true, classId: true, startTime: true, endTime: true, classroom: true, teacherId: true,
  class: { select: { name: true } }, teacher: { select: { name: true } },
} satisfies Prisma.ScheduleSelect;

function availableWhere(actor: RegistrationActor, classId: string, period: ReturnType<typeof registrationWindow>): Prisma.ScheduleWhereInput {
  const tenant = { organizationId: actor.organizationId, campusId: actor.campusId };
  return { ...tenant, classId, class: { ...tenant, status: 'active' }, status: 'scheduled',
    startTime: { gt: period.start, lte: period.end },
    OR: [{ teacherId: null }, { teacher: tenant }] };
}

export async function availableSchedules(actor: RegistrationActor, classId: unknown) {
  if (typeof classId !== 'string' || !classId.trim()) throw new ApiError('请先选择班级', 400, 'CLASS_REQUIRED');
  const cls = await prisma.class.findFirst({ where: { id: classId, organizationId: actor.organizationId, campusId: actor.campusId },
    select: { status: true } });
  if (!cls) throw new ApiError('班级不存在或不属于当前校区', 403, 'FORBIDDEN');
  if (cls.status !== 'active') throw new ApiError('该班级未开课，不能邀约体验', 409, 'CLASS_UNAVAILABLE');
  const period = registrationWindow();
  const rows = await prisma.schedule.findMany({ where: availableWhere(actor, classId, period), select: scheduleSelect,
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }] });
  return { period, schedules: rows.map(row => ({
    id: row.id, classId: row.classId, className: row.class.name, startTime: row.startTime, endTime: row.endTime,
    classroom: row.classroom, teacherId: row.teacherId, teacherName: row.teacher?.name ?? null,
  })) };
}

function requireDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !parseProfileDate(value)) {
    throw new ApiError('请填写有效上课日期', 400, 'INVALID_DATE');
  }
  return value;
}

function clock(value: unknown) {
  const time = textValue(value, '上课时间');
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError('上课时间应为 HH:mm', 400, 'INVALID_TIME');
  return time;
}

function realStatus(value: unknown) {
  if (typeof value !== 'string' || !statuses.includes(value)) throw new ApiError('体验课状态无效', 400, 'INVALID_STATUS');
  return value;
}

export async function registerExperience(req: AuthRequest) {
  const actor = registrationActor(req);
  const body = req.body;
  const key = requestKey(req);
  const scheduleId = textValue(body.scheduleId, '场次');
  const command = {
    studentName: textValue(body.studentName, '学员姓名', true)!, age: validateRecordedAge(body.age),
    contact: textValue(body.contact, '联系方式', true)!, source: textValue(body.source, '来源'),
    notes: textValue(body.notes, '备注'), leadId: textValue(body.leadId, '线索'),
    assigneeId: textValue(body.assigneeId, '负责人') || actor.id, status: realStatus(body.status || 'pending'),
    classId: textValue(body.classId, '班级'), scheduleId,
    manual: scheduleId ? null : {
      scheduleDate: requireDate(body.scheduleDate), startTime: clock(body.startTime),
      endTime: clock(body.endTime), classroom: textValue(body.classroom, '教室'),
      teachingTeacherId: textValue(body.teachingTeacherId, '上课老师'),
    },
  };
  if (!managesRegistrations(actor) && command.assigneeId !== actor.id) {
    throw new ApiError('只能为自己登记体验课', 403, 'FORBIDDEN');
  }
  if (scheduleId && !command.classId) throw new ApiError('场次必须关联所选班级', 400, 'CLASS_REQUIRED');
  return runRegistration({ actor, operation: 'experience', key, command,
    authorizeReplay: async (tx, id) => {
      if (!await tx.experienceLesson.findFirst({ where: { id, ...experienceAccess(actor) }, select: { id: true } })) {
        throw new ApiError('体验课不在当前负责范围', 403, 'FORBIDDEN');
      }
      if (command.leadId) await accessibleLead(tx, actor, command.leadId);
    },
    create: async tx => {
      await lockScheduleWrites(tx, actor.organizationId);
      if (command.status === 'converted') throw new ApiError('请先登记关联的新签订单', 409, 'CONVERSION_REQUIRED');
      const assignee = await scopedStaff(tx, actor, command.assigneeId);
      const cls = command.classId ? await tx.class.findFirst({ where: {
        id: command.classId, organizationId: actor.organizationId, campusId: actor.campusId,
      }, select: { id: true, name: true, status: true } }) : null;
      if (command.classId && !cls) throw new ApiError('无权访问该班级', 403, 'FORBIDDEN');
      if (cls?.status === 'deleted') throw new ApiError('已删除班级不能安排体验课', 409, 'CLASS_DELETED');
      if (scheduleId && cls && cls.status !== 'active') {
        throw new ApiError('该班级不可登记体验课', 409, 'CLASS_UNAVAILABLE');
      }
      if (command.leadId) {
        // Re-check ownership after taking the row lock so a reassignment cannot slip between validation and contact.
        await tx.$queryRaw`SELECT id FROM leads WHERE id = ${command.leadId} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
        await accessibleLead(tx, actor, command.leadId);
      }
      let slot;
      if (scheduleId && cls) {
        // All timetable mutations take the institution schedule lock; row lock also covers attendance status changes.
        await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${scheduleId} AND "organizationId" = ${actor.organizationId} AND "campusId" = ${actor.campusId} FOR UPDATE`;
        const row = await tx.schedule.findFirst({ where: { id: scheduleId, ...availableWhere(actor, cls.id, registrationWindow()) },
          select: scheduleSelect });
        if (!row) throw new ApiError('场次已变更、已开始或不在所选班级，请重新选择', 409, 'SCHEDULE_UNAVAILABLE');
        slot = { scheduleDate: shanghaiStamp(row.startTime).slice(0, 10), startTime: shanghaiStamp(row.startTime).slice(11, 16),
          endTime: shanghaiStamp(row.endTime).slice(11, 16), classroom: row.classroom,
          teachingTeacherId: row.teacherId, teachingTeacherName: row.teacher?.name ?? null };
      } else {
        const manual = command.manual!;
        const teacher = manual.teachingTeacherId ? await scopedStaff(tx, actor, manual.teachingTeacherId, true) : null;
        slot = { ...manual, teachingTeacherName: teacher?.name ?? null };
      }
      await assertExperiencePersonAvailable(tx, actor.organizationId, command);
      const lesson = await tx.experienceLesson.create({ data: { organizationId: actor.organizationId, createdById: actor.id,
        studentName: command.studentName, age: command.age, contact: command.contact, source: command.source, notes: command.notes,
        status: command.status, leadId: command.leadId, classId: cls?.id, className: cls?.name, scheduleId,
        assigneeId: assignee.id, assigneeName: assignee.name, ...slot } });
      if (command.leadId) await tx.lead.updateMany({
        where: { id: command.leadId, OR: [{ lastContactAt: null }, { lastContactAt: { lt: lesson.createdAt } }] },
        data: { lastContactAt: lesson.createdAt },
      });
      return lesson;
    },
  });
}

export async function editExperience(actor: RegistrationActor, id: string, body: Record<string, unknown>) {
  return prisma.$transaction(async tx => {
    await lockScheduleWrites(tx, actor.organizationId);
    await tx.$queryRaw`SELECT id FROM experience_lessons WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
    const current = await tx.experienceLesson.findFirst({ where: { id, ...experienceAccess(actor) } });
    if (!current) throw new ApiError('体验课不存在或不在当前负责范围', 404, 'NOT_FOUND');
    const data: Prisma.ExperienceLessonUncheckedUpdateInput = {};
    if (body.status !== undefined) {
      const status = realStatus(body.status);
      data.status = status;
      if (status === 'converted' || (status !== current.status && (current.status === 'converted' || !attendedStatuses.includes(status)))) {
        const order = await tx.conversion.findFirst({ where: { experienceLessonId: id, ...confirmedSignup(actor) }, select: { id: true } });
        if (status === 'converted' && !order) throw new ApiError('请先登记已确认的新签订单', 409, 'CONVERSION_REQUIRED');
        if (status !== 'converted' && order) throw new ApiError('已成单体验课请通过订单更正处理', 409, 'USE_CONVERSION_CORRECTION');
      }
    }
    const snapshotFields = ['scheduleId', 'classId', 'className', 'scheduleDate', 'startTime', 'endTime', 'classroom',
      'teachingTeacherId', 'teachingTeacherName'] as const;
    if (current.scheduleId && snapshotFields.some(k => body[k] !== undefined && body[k] !== current[k])) {
      throw new ApiError('已关联排课，不能改写登记时的场次信息', 409, 'SCHEDULE_SNAPSHOT_LOCKED');
    }
    if (!current.scheduleId && body.scheduleId) throw new ApiError('编辑时不能新增场次关联', 409, 'SCHEDULE_SNAPSHOT_LOCKED');
    if (body.studentName !== undefined) data.studentName = textValue(body.studentName, '学员姓名', true)!;
    if (body.contact !== undefined) data.contact = textValue(body.contact, '联系方式', true)!;
    if (body.studentName !== undefined || body.contact !== undefined) {
      await assertExperiencePersonAvailable(tx, actor.organizationId, {
        studentName: data.studentName ?? current.studentName, contact: data.contact ?? current.contact,
      }, current);
    }
    if (body.age !== undefined) data.age = validateRecordedAge(body.age);
    if (body.notes !== undefined) data.notes = textValue(body.notes, '备注');
    if (body.source !== undefined) data.source = textValue(body.source, '来源');
    if (body.assigneeId === undefined && body.status !== undefined && !['converted','cancelled'].includes(String(data.status)) && current.assigneeId) {
      await scopedStaff(tx, actor, current.assigneeId);
    }
    if (body.assigneeId !== undefined) {
      const assigneeId = textValue(body.assigneeId, '负责人') || actor.id;
      if (!managesRegistrations(actor) && assigneeId !== actor.id) throw new ApiError('不能修改其他人的负责人', 403, 'FORBIDDEN');
      const staff = await scopedStaff(tx, actor, assigneeId);
      data.assigneeId = staff.id; data.assigneeName = staff.name;
    }
    if (!current.scheduleId) await editManualFields(tx, actor, body, current, data);
    return tx.experienceLesson.update({ where: { id }, data });
  });
}

async function editManualFields(tx: Prisma.TransactionClient, actor: RegistrationActor, body: Record<string, unknown>,
  current: ExperienceLesson, data: Prisma.ExperienceLessonUncheckedUpdateInput) {
  if (body.classId !== undefined && body.classId !== current.classId) {
    const classId = textValue(body.classId, '班级');
    const cls = classId ? await tx.class.findFirst({ where: { id: classId, organizationId: actor.organizationId, campusId: actor.campusId } }) : null;
    if (classId && !cls) throw new ApiError('无权访问该班级', 403, 'FORBIDDEN');
    if (cls?.status === 'deleted' && cls.id !== current.classId) throw new ApiError('已删除班级不能安排体验课', 409, 'CLASS_DELETED');
    data.classId = classId; data.className = cls?.name ?? null;
  }
  if (body.teachingTeacherId !== undefined && body.teachingTeacherId !== current.teachingTeacherId) {
    const teacherId = textValue(body.teachingTeacherId, '上课老师');
    const teacher = teacherId ? await scopedStaff(tx, actor, teacherId, true) : null;
    data.teachingTeacherId = teacherId; data.teachingTeacherName = teacher?.name ?? null;
  }
  if (body.scheduleDate !== undefined) data.scheduleDate = requireDate(body.scheduleDate);
  if (body.startTime !== undefined) data.startTime = clock(body.startTime);
  if (body.endTime !== undefined) data.endTime = clock(body.endTime);
  if (body.classroom !== undefined) data.classroom = textValue(body.classroom, '教室');
}
