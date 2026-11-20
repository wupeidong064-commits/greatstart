import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { ApiError } from '../middleware/errorHandler';
import {
  assertScheduleAvailable, hiddenTimetableOccurrence, normalizeClassroom,
} from './scheduleConflicts';
import { previewWeeklyOccurrences, WeeklyClassRule, PreviewOccurrence } from './weeklyRules';
import { readClassWeeklyRules } from './classWeeklyRuleStore';

export const CLASS_RULES_GROUP_PREFIX = 'classrules-v1';

export type ClassRulesRequest = { classId: string; startDate: string; endDate: string };
export type SelectedRule = { weekday: number; startTime: string; endTime: string };

/** 预览与生成共用的日期/参数校验。 */
export function validateClassRulesRequest(body: {
  classId?: unknown; startDate?: unknown; endDate?: unknown; selectedRules?: unknown;
}): ClassRulesRequest & { selectedRules?: SelectedRule[] } {
  const { classId, startDate, endDate } = body;
  if (typeof classId !== 'string' || !classId) throw new ApiError('请指定班级', 400, 'INVALID_PARAMS');
  const validDate = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+new Date(`${value}T00:00:00+08:00`));
  if (!validDate(startDate)) throw new ApiError('开始日期无效，应为 YYYY-MM-DD', 400, 'INVALID_TIME');
  if (!validDate(endDate)) throw new ApiError('结束日期无效，应为 YYYY-MM-DD', 400, 'INVALID_TIME');
  if (endDate < startDate) throw new ApiError('结束日期不得早于开始日期', 400, 'INVALID_TIME');
  if (body.selectedRules === undefined) return { classId, startDate, endDate };
  // 2026-11-07 用户拍板：多时段班级可只选部分班级时间生成/操作；所选必须与该班规则完全一致。
  if (!Array.isArray(body.selectedRules) || !body.selectedRules.length) throw new ApiError('请至少选择一个班级时间', 400, 'INVALID_TIME');
  const clock = (value: unknown): value is string => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const selectedRules = body.selectedRules.map((item: any) => {
    if (!item || !Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6 || !clock(item.startTime) || !clock(item.endTime)) {
      throw new ApiError('所选班级时间无效', 400, 'INVALID_TIME');
    }
    return { weekday: item.weekday, startTime: item.startTime, endTime: item.endTime };
  });
  return { classId, startDate, endDate, selectedRules };
}

/** 将所选时段对齐到班级规则子集；任何一项对不上即拒绝。 */
export function filterSelectedRules(rules: WeeklyClassRule[], selected: SelectedRule[] | undefined): WeeklyClassRule[] {
  if (!selected) return rules;
  const key = (rule: { weekday: number; startTime: string; endTime: string }) => `${rule.weekday}|${rule.startTime}|${rule.endTime}`;
  const classKeys = new Set(rules.map(key));
  for (const item of selected) {
    if (!classKeys.has(key(item))) throw new ApiError('所选时段与该班的班级时间不一致，请刷新后重选', 400, 'INVALID_TIME');
  }
  return rules.filter(rule => selected.some(item => key(item) === key(rule)));
}

/** 与生成同一套口径：按规则展开日期范围，并只保留未来场次。 */
export function selectUpcomingOccurrences(rules: WeeklyClassRule[], startDate: string, endDate: string) {
  let occurrences: PreviewOccurrence[];
  try {
    occurrences = previewWeeklyOccurrences(rules, startDate, endDate);
  } catch (error) {
    // 规则展开的失败都是用户输入问题（无效日期/跨度/无匹配），统一按 400 返回明确提示。
    throw new ApiError(error instanceof Error ? error.message : '日期范围无效', 400, 'INVALID_TIME');
  }
  const now = new Date();
  const upcoming = occurrences.filter(row => row.startTime > now);
  return { occurrences: upcoming, skippedPast: occurrences.length - upcoming.length };
}

type ConflictClass = {
  id: string; campusId: string | null; teacherId: string | null;
};

/** 只读冲突标注：供确认前提示；生成事务内仍由 assertScheduleAvailable 逐一复核。 */
export async function annotateConflicts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  classData: ConflictClass,
  occurrences: PreviewOccurrence[],
) {
  const conflicts: Array<{ businessDate: string; startTime: string; kind: string; withName: string }> = [];
  if (!occurrences.length) return conflicts;
  const rangeStart = occurrences.reduce((min, row) => (row.startTime < min ? row.startTime : min), occurrences[0].startTime);
  const rangeEnd = occurrences.reduce((max, row) => (row.endTime > max ? row.endTime : max), occurrences[0].endTime);
  const overlapping = await tx.schedule.findMany({
    where: {
      organizationId,
      status: { notIn: ['cancelled', 'rescheduled'] },
      NOT: hiddenTimetableOccurrence(),
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    select: {
      id: true, classId: true, teacherId: true, campusId: true, classroom: true,
      startTime: true, endTime: true, status: true,
      class: { select: { name: true } }, teacher: { select: { name: true } },
    },
  });
  const roomOf = (classroom: string | null) => normalizeClassroom(classroom);
  for (const row of occurrences) {
    for (const other of overlapping) {
      if (!(other.startTime < row.endTime && other.endTime > row.startTime)) continue;
      const sameClass = other.classId === classData.id;
      const sameTeacher = !!classData.teacherId && other.teacherId === classData.teacherId;
      const sameRoom = !!row.classroom && other.campusId === classData.campusId
        && !!other.classroom && roomOf(other.classroom) === roomOf(row.classroom);
      if (!sameClass && !sameTeacher && !sameRoom) continue;
      // 完全相同的已排场次会被复用（重复确认不重复生成），不算冲突。
      const isExactReuse = sameClass && other.status === 'scheduled'
        && other.campusId === classData.campusId
        && roomOf(other.classroom) === roomOf(row.classroom)
        && +other.startTime === +row.startTime && +other.endTime === +row.endTime;
      if (isExactReuse) continue;
      conflicts.push({
        businessDate: row.businessDate,
        startTime: row.startTime.toISOString(),
        kind: sameClass ? '班级' : sameTeacher ? '教师' : '教室',
        withName: sameClass ? `「${other.class.name}」` : sameTeacher ? `教师「${other.teacher?.name || '未知'}」` : `教室「${other.classroom || '未命名'}」`,
      });
      break; // 每个待排场次只标注一个冲突，避免列表过长
    }
  }
  return conflicts;
}

/** 幂等组标识：同一 requestId + 同一意图 = 同一批场次。 */
export function classRulesGroupId(requestId: string, payload: unknown): string {
  return `${CLASS_RULES_GROUP_PREFIX}:${requestId.toLowerCase()}:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

/** 在生成事务内读取班级时间规则并产出待写场次；调用方持有机构课表锁。 */
export async function buildClassRuleSlots(
  tx: Prisma.TransactionClient,
  classId: string,
  startDate: string,
  endDate: string,
  selectedRules?: SelectedRule[],
): Promise<{ rules: WeeklyClassRule[]; slots: PreviewOccurrence[]; skippedPast: number }> {
  const allRules = await readClassWeeklyRules(tx, classId);
  if (!allRules.length) throw new ApiError('该班级还没有班级时间，请先在班级管理补充每周上课时间', 400, 'NO_CLASS_WEEKLY_RULES');
  const rules = filterSelectedRules(allRules, selectedRules);
  if (!rules.length) throw new ApiError('请至少选择一个班级时间', 400, 'INVALID_TIME');
  const { occurrences, skippedPast } = selectUpcomingOccurrences(rules, startDate, endDate);
  if (!occurrences.length) throw new ApiError('所选日期范围内没有未来的可排课场次', 400, 'NO_FUTURE_SCHEDULES');
  if (occurrences.length > 500) throw new ApiError('所选范围将生成超过500个场次，请缩短日期范围', 400, 'TOO_MANY_OCCURRENCES');
  return { rules, slots: occurrences, skippedPast };
}

export { assertScheduleAvailable };
