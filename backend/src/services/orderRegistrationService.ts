import { creditCents } from './lessonLedger';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { parentMobileFromContact, parseProfileDate, studentGenderFromConversion, validateRecordedAge, validateStudentName, validateBusinessDate, validateContactPhone } from '../utils/studentProfileFields';
import { enrollForConversion, lockEnrollmentStudent, rejectClientEnrollmentPeriod } from './enrollmentPeriod';
import { experienceAccess, registrationWindow, signupExperienceStatuses } from './experienceRegistrationService';
import { accessibleLead, managesRegistrations, registrationActor, RegistrationActor, requestKey, runRegistration,
  scopedStaff, textValue } from './registrationRequestService';
import { lockScheduleWrites } from './scheduleConflicts';

const selectSchedule = {
  id: true, classId: true, startTime: true, endTime: true, classroom: true, teacherId: true,
  teacher: { select: { name: true } }, class: { select: { name: true, code: true, courseType: true } },
  course: { select: { name: true } },
} satisfies Prisma.ScheduleSelect;

function scheduleScope(actor: RegistrationActor, period: ReturnType<typeof registrationWindow>): Prisma.ScheduleWhereInput {
  const tenant = { organizationId: actor.organizationId, campusId: actor.campusId };
  return { ...tenant, status: 'scheduled', class: { ...tenant, status: 'active' },
    startTime: { gt: period.start, lte: period.end }, endTime: { gt: prisma.schedule.fields.startTime },
    AND: [{ OR: [{ teacherId: null }, { teacher: tenant }] },
      { OR: [{ courseId: null }, { course: { organizationId: actor.organizationId } }] }] };
}

function scheduleSnapshot(row: Prisma.ScheduleGetPayload<{ select: typeof selectSchedule }>) {
  return { id: row.id, classId: row.classId, className: row.class.name, classCode: row.class.code,
    courseType: row.class.courseType.trim() || row.course?.name || null,
    startTime: row.startTime.toISOString(), endTime: row.endTime.toISOString(),
    classroom: row.classroom, teacherId: row.teacherId, teacherName: row.teacher?.name ?? null };
}

export async function orderRegistrationSchedules(actor: RegistrationActor) {
  const period = registrationWindow();
  const rows = await prisma.schedule.findMany({ where: scheduleScope(actor, period), select: selectSchedule,
    orderBy: [{ class: { name: 'asc' } }, { class: { code: 'asc' } }, { startTime: 'asc' }, { id: 'asc' }] });
  return { period, schedules: rows.map(scheduleSnapshot) };
}

const isRenewal = (value: string | null) => ['续费', '续报', 'renewal'].includes(value?.trim().toLowerCase() || '');

function orderCommand(req: AuthRequest, actor: RegistrationActor) {
  const body = req.body;
  rejectClientEnrollmentPeriod(body);
  if (body.existingStudentId != null || body.studentId != null) {
    throw new ApiError('已有学员请使用续费或直接增课办理', 409, 'USE_RENEWAL_OR_LESSON_ADD');
  }
  const scheduleId = textValue(body.scheduleId, '排课');
  // Explicit schedule selection (including null) supersedes the legacy class picker.
  const legacyClassId = 'scheduleId' in body ? null : textValue(body.classId, '班级');
  const submittedType = scheduleId ? null : textValue(body.courseType, '课程类型');
  if (isRenewal(submittedType)) throw new ApiError('续费请使用续费业务办理', 409, 'USE_RENEWAL_TRANSACTION');
  const salesId = textValue(body.salesId, '销售');
  const conversionDate = textValue(body.conversionDate, '成单日期');
  if (conversionDate) validateBusinessDate(conversionDate, '成单日期');
  const totalLessons = body.totalLessons ?? null;
  if (totalLessons !== null && (!Number.isSafeInteger(totalLessons) || totalLessons < 0 || totalLessons > 2147483647)) {
    throw new ApiError('课时数须为 0 至 2147483647 的整数', 400, 'INVALID_LESSONS');
  }
  let price: number | null = null;
  if (body.price != null) {
    const text = String(body.price).trim();
    if ((typeof body.price !== 'string' && typeof body.price !== 'number') || !/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) {
      throw new ApiError('金额须为 0 至 99999999.99，最多两位小数', 400, 'INVALID_PRICE');
    }
    price = Number(text);
  }
  const paymentStatus = textValue(body.paymentStatus, '支付状态') || 'paid';
  if (!['paid', 'pending', 'partial', 'unpaid'].includes(paymentStatus))
    throw new ApiError('支付状态无效', 400, 'INVALID_PAYMENT');
  return { studentName: validateStudentName(body.studentName), contact: validateContactPhone(textValue(body.contact, '联系方式', true))!,
    age: validateRecordedAge(body.age), gender: textValue(body.gender, '性别'), parentName: textValue(body.parentName, '家长姓名'),
    address: textValue(body.address, '地址'), scheduleId, legacyClassId, legacyCourseType: legacyClassId ? submittedType : null,
    totalLessons, price, paymentMethod: textValue(body.paymentMethod, '支付方式'), paymentStatus,
    salesId: salesId || (managesRegistrations(actor) ? null : actor.id), conversionDate, notes: textValue(body.notes, '备注'),
    experienceLessonId: textValue(body.experienceLessonId, '体验课'), leadId: textValue(body.leadId, '线索') };
}

// The sales, class and student scope mirrors the order list. Never disclose a prior order outside that scope.
export function orderAccess(actor: RegistrationActor): Prisma.ConversionWhereInput {
  const tenant = { organizationId: actor.organizationId, campusId: actor.campusId };
  return { organizationId: actor.organizationId, ...(!managesRegistrations(actor) ? { salesId: actor.id } : {}),
    OR: [{ class: tenant }, { classId: null, student: tenant }, { classId: null, studentId: null, sales: tenant }] };
}

async function resolveSchedule(tx: Prisma.TransactionClient, actor: RegistrationActor, id: string) {
  // Timetable mutations use the institution lock. The occurrence row lock serializes attendance status changes too.
  await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${id} AND "organizationId" = ${actor.organizationId} AND "campusId" = ${actor.campusId} FOR UPDATE`;
  const row = await tx.schedule.findFirst({ where: { id, ...scheduleScope(actor, registrationWindow()) }, select: selectSchedule });
  if (!row) throw new ApiError('排课已变更、已开始或不属于当前校区，请重新选择', 409, 'SCHEDULE_UNAVAILABLE');
  return scheduleSnapshot(row);
}

const correction = () => new ApiError('关联体验课的原成单已作废或待更正，请通过成单更正流程处理', 409, 'USE_CONVERSION_CORRECTION');

export async function registerOrder(req: AuthRequest) {
  const actor = registrationActor(req);
  const key = requestKey(req);
  const command = orderCommand(req, actor);
  const tenant = { organizationId: actor.organizationId, campusId: actor.campusId };
  return runRegistration({ actor, key, operation: 'conversion', command,
    authorizeReplay: async (tx, id) => {
      const row = await tx.conversion.findFirst({ where: { id, ...orderAccess(actor) }, select: { approvalStatus: true } });
      if (!row) throw new ApiError('成单不在当前负责范围', 403, 'FORBIDDEN');
      if (row.approvalStatus !== 'confirmed') throw new ApiError('该成单已作废或状态已变更，请核对原单', 409, 'USE_CONVERSION_CORRECTION');
    },
    create: async tx => {
      if (!managesRegistrations(actor) && command.salesId !== actor.id) {
        throw new ApiError('您只能为自己创建成单记录', 403, 'FORBIDDEN');
      }
      await lockScheduleWrites(tx, tenant.organizationId);
      const { experienceLessonId, studentName, contact, age, gender, parentName, address, totalLessons, price } = command;
      let leadId = command.leadId;
      if (experienceLessonId) {
        await tx.$queryRaw`SELECT id FROM experience_lessons WHERE id = ${experienceLessonId} AND "organizationId" = ${tenant.organizationId} FOR UPDATE`;
        const lesson = await tx.experienceLesson.findFirst({ where: { id: experienceLessonId, ...experienceAccess(actor) } });
        if (!lesson) throw new ApiError('无权访问该体验课', 403, 'FORBIDDEN');
        if (!signupExperienceStatuses.includes(lesson.status)) throw new ApiError('体验课已取消或状态已变更，请重新选择', 409, 'EXPERIENCE_UNAVAILABLE');
        if (lesson.leadId && leadId && leadId !== lesson.leadId) throw new ApiError('体验课与线索不匹配', 409, 'LEAD_MISMATCH');
        leadId = lesson.leadId || leadId;
      }
      if (leadId) {
        await tx.$queryRaw`SELECT id FROM leads WHERE id = ${leadId} AND "organizationId" = ${tenant.organizationId} FOR UPDATE`;
        await accessibleLead(tx, actor, leadId);
      }
      if (experienceLessonId) {
        const previous = await tx.conversion.findFirst({ where: { experienceLessonId, organizationId: tenant.organizationId },
          select: { id: true, approvalStatus: true, courseType: true } });
        if (previous) {
          if (previous.approvalStatus !== 'confirmed' || isRenewal(previous.courseType)) throw correction();
          // Only an exact receipt replay can reuse a new-style registration. Legacy callers historically got the existing order.
          if (key) throw new ApiError('该体验课已有成单，请查看原单', 409, 'EXPERIENCE_ALREADY_CONVERTED');
          const visible = await tx.conversion.findFirst({ where: { id: previous.id, ...orderAccess(actor) } });
          if (!visible) throw new ApiError('原成单不在当前负责范围', 403, 'FORBIDDEN');
          return visible;
        }
      }

      // The organization lock above serializes duplicate checks with other new orders.
      // A shared parent phone alone is not a child's identity.
      const phoneKey = (value: string | null) => (value || '').replace(/[\s()\-]/g, '').replace(/^\+86/, '');
      const matches = await tx.student.findMany({ where: { ...tenant, name: studentName },
        select: { phone: true, parentPhone: true } });
      if (matches.some(row => [row.phone, row.parentPhone].some(phone => phoneKey(phone) && phoneKey(phone) === phoneKey(contact))))
        throw new ApiError('该学员已有档案，请到成单信息或续费管理使用“续费”办理；新成单不会重复建档', 409, 'USE_RENEWAL_TRANSACTION');
      if (!leadId) {
        const owners = managesRegistrations(actor)
          ? { OR: [{ assignee: tenant }, { assigneeId: null, createdById: { in: (await tx.user.findMany({where:tenant,select:{id:true}})).map(u => u.id) } }] }
          : { assigneeId: actor.id };
        const leads = await tx.lead.findMany({ where: { organizationId: actor.organizationId, customerName: studentName, status: { not: 'converted' }, ...owners }, select: { id: true, contact: true } });
        const candidates = leads.filter(row => phoneKey(row.contact) && phoneKey(row.contact) === phoneKey(contact));
        if (candidates.length > 1) throw new ApiError('匹配到多条同名同电话线索，请从对应体验课转成单，或先核对线索',409,'LEAD_AMBIGUOUS');
        if (candidates.length === 1) leadId = candidates[0].id;
      }

      const slot = command.scheduleId ? await resolveSchedule(tx, actor, command.scheduleId) : null;
      const legacyClass = command.legacyClassId ? await tx.class.findFirst({ where: { id: command.legacyClassId, ...tenant },
        select: { id: true, name: true, status: true, courseType: true } }) : null;
      if (command.legacyClassId && !legacyClass) throw new ApiError('无权访问该班级', 403, 'FORBIDDEN');
      if (legacyClass?.status === 'deleted') throw new ApiError('已删除班级不能办理成单', 409, 'CLASS_DELETED');
      const classId = slot?.classId || legacyClass?.id || null;
      const className = slot?.className || legacyClass?.name || null;
      const subject = slot?.courseType || command.legacyCourseType || legacyClass?.courseType || null;
      // Reports classify renewal via courseType. Preserve any literal class label in the immutable snapshot.
      const courseType = !subject || isRenewal(subject) ? '新签' : subject;
      const salesperson = command.salesId ? await scopedStaff(tx, actor, command.salesId) : null;
      const conversionDate = command.conversionDate || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      if (price===null) throw new ApiError('新签成单须填写成交金额，零元请明确填写0',400,'INVALID_PRICE');
      if (totalLessons === null || totalLessons === 0) {
        throw new ApiError('购买课时须为正整数', 400, 'INVALID_LESSONS');
      }
      const student = await tx.student.create({ data: { ...tenant, name: studentName, gender: studentGenderFromConversion(gender),
        phone: contact, parentPhone: parentMobileFromContact(contact), parentName, address, recordedAge: age, salesId: salesperson?.id,
        recordedAgeAt: age === null ? null : parseProfileDate(conversionDate), status: 'active',
        remainingLessons: totalLessons ?? 0, purchasedLessons: totalLessons ?? 0 } });
      await lockEnrollmentStudent(tx, student.id, tenant);
      const conversion = await tx.conversion.create({ data: { organizationId: tenant.organizationId, studentId: student.id,
        studentName, age, gender, contact, parentName, address, classId, className, courseType, registrationSchedule: slot ?? undefined,
        totalLessons, price, paymentMethod: command.paymentMethod, paymentStatus: command.paymentStatus,
        salesId: salesperson?.id, salesName: salesperson?.name, conversionDate, notes: command.notes,
        experienceLessonId, leadId, approvalStatus: 'confirmed' } });
      if (totalLessons !== null && totalLessons > 0) await tx.lessonLog.create({ data: { organizationId: tenant.organizationId, studentId: student.id,
        studentName, type: 'add', lessonSource: 'paid', creditAmountCents: creditCents(price,totalLessons,totalLessons), lessons: totalLessons, businessDate: conversionDate, conversionId: conversion.id,
        notes: '新签入账：' + conversion.id, operatorId: actor.id, operatorName: req.user?.email } });
      if (classId) await enrollForConversion(tx, student.id, classId, tenant, false, actor.id);
      if (experienceLessonId) await tx.experienceLesson.update({ where: { id: experienceLessonId },
        data: { status: 'converted', convertedAt: conversionDate } });
      if (leadId) await tx.lead.update({ where: { id: leadId }, data: { status: 'converted' } });
      return conversion;
    },
  });
}
