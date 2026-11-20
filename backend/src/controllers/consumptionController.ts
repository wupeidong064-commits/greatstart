import prisma from '../config/database';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { resolveScope } from '../utils/scope';
import { businessPeriod } from '../utils/businessPeriod';
import { computeSessionAttendance } from '../services/attendanceStatsService';
import { periodCourseTypes, readConsumptionData } from '../services/consumptionPeriod';
import { classEnrollmentFlow, enrollmentFlow } from '../services/enrollmentFlow';

function scopeOf(req: AuthRequest) {
  const scope = resolveScope(req);
  if (!scope.campusId) throw new ApiError('未分配校区', 403, 'FORBIDDEN');
  return { organizationId: scope.organizationId, campusId: scope.campusId };
}
const changeNote =
  '当前人数按本校区活跃班级内活跃学员的活跃报名计；新增按入班日期计（同人跨班分别计）。存量报名的退班/转班生效日期及历史快照证据不全，期初人数、流失和净变化不可核定，不从当前状态倒推。';
export const consumptionController = {
  getStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = scopeOf(req),
        { start, end } = businessPeriod(req.query);
      const { allClasses, catalog, students, schedules, enrollments, sessionNet, activityLessons, valuation } = await readConsumptionData(scope, start, end);
      const classes = allClasses.filter(c => c.status === 'active');
      const session = computeSessionAttendance({
        schedules,
        enrollments,
        attendances: schedules.flatMap((s) => s.attendances),
      });
      const net = sessionNet + activityLessons;
      const classIds = new Set(classes.map((c) => c.id)),
        activeStudentIds = new Set(students.filter((s) => s.status === 'active').map((s) => s.id));
      const active = [...new Map(enrollments.filter(
        (e) => classIds.has(e.classId) && activeStudentIds.has(e.studentId) && e.status === 'active' && e.enrolledAt <= new Date() && (!e.endedAt || e.endedAt > new Date())
      ).map(e => [`${e.classId}:${e.studentId}`, e])).values()];
      // 2026-11-08 拍板：开班口径只计「有在读学员的班」——空班（学员走光但班级仍为进行中）不计入当前与类型结构。
      const endNonEmptyIds = new Set(active.map((e) => e.classId));
      const classCurrent = endNonEmptyIds.size;
      const emptyClasses = classIds.size - classCurrent;
      const capacity = classes.reduce((n, c) => n + c.capacity, 0);
      // 2026-11-07 用户拍板：课消收入页可视化改造——课程类型占比饼图与名额占用明细（替换幼儿/精英班计数与单一占用率）。
      const occupiedSeats = new Set(active.map((e) => `${e.classId}:${e.studentId}`)).size;
      const typeCounts = new Map<string, number>();
      for (const c of classes) {
        if (!endNonEmptyIds.has(c.id)) continue; // 空班不进类型结构，与在读班级总数同口径
        const key = (c.courseType || '').trim() || '未分类';
        typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
      }
      const courseTypeDistribution = [...typeCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      // 2026-11-07 用户拍板：单线分段流水图——存量实线、减少虚线、新增实线。
      const inPeriod = (d: Date | null | undefined) => !!d && d >= start && d <= end;
      const scopedEnrollments = enrollments;
      const removedNonRenewal = students.filter(s => s.renewalStatus === 'no_renewal' && inPeriod(s.noRenewalDate)).length;
      const lostStudents = new Set(enrollments.filter(e => inPeriod(e.endedAt)).map(e => e.studentId)).size;
      const flow = enrollmentFlow(scopedEnrollments, start, end);
      // 归档学员：archivedAt 落在区间内（专用归档操作写入，可核定）
      const archivedStudents = students.filter((s) => inPeriod(s.archivedAt)).length;
      // 未定班学员：活跃学员中不在任何活跃班级花名册（含新建档未定班、移除/归档恢复后待重排）
      const enrolledStudentIds = new Set(active.map((e) => e.studentId));
      const undecidedStudents = students.filter(
        (s) => s.status === 'active' && !enrolledStudentIds.has(s.id)
      ).length;
      // 多班学员（一周多次课）：同一活跃学员同时报名 ≥2 个活跃班级，基本盘按班级内人数计被计多次
      const pairsByStudent = new Map<string, number>();
      for (const e of active) pairsByStudent.set(e.studentId, (pairsByStudent.get(e.studentId) || 0) + 1);
      const distinctStudents = pairsByStudent.size;
      let multiClassStudents = 0;
      for (const n of pairsByStudent.values()) if (n >= 2) multiClassStudents++;
      const classHistory = classEnrollmentFlow(enrollments, start, end);
      // Capacity and active/lost class-state histories are not stored; do not infer them from updatedAt.
      const startOccupiedSeats = null, startCapacity = null;
      sendSuccess(res, {
        totalAttendance: net,
        sessionNetLessons: sessionNet,
        activityDeductLessons: activityLessons,
        totalAttendanceCount: session.expected,
        present: session.present,
        attendanceRate: session.rate,
        baseCount: active.length,
        rosterCount: active.length,
        newRecruits: students.filter((s) => s.createdAt >= start && s.createdAt <= end).length,
        recalled: null,
        recalledAvailable: false,
        nonRenewals: students.filter(
          (s) =>
            s.renewalStatus === 'no_renewal' &&
            s.noRenewalDate &&
            s.noRenewalDate >= start &&
            s.noRenewalDate <= end
        ).length,
        deletedRoster: null,
        suspended: null,
        lessonPrice: null, // Kept for older clients; actual consumption has no campus-wide unit price.
        classCount: classCurrent, // 在读班级（空班不计入）
        emptyClasses,
        preschoolClassCount: classes.filter((c) => /幼儿|preschool/i.test(c.courseType)).length,
        eliteClassCount: classes.filter((c) => /精英|elite/i.test(c.courseType)).length,
        actualConsumptionAmount: valuation.actualConsumptionAmount,
        knownConsumptionAmount: valuation.knownConsumptionAmount,
        unpricedConsumptionLessons: valuation.unpricedConsumptionLessons,
        monetaryHistoryComplete: valuation.monetaryHistoryComplete,
        totalRevenue: valuation.actualConsumptionAmount,
        revenueEstimated: false,
        revenueNote:
          '实际课消逐笔汇总核销金额：付费课时按购买批次先买先用，赠课为0元。取消划课按原批次原金额返还；场次归入上课日，活动归入业务日。',
        confirmedRevenue: valuation.actualConsumptionAmount,
        courseTypeDistribution,
        periodCourseTypes: periodCourseTypes(allClasses, catalog, enrollments, start, end),
        seatStats: { occupied: occupiedSeats, capacity, startOccupied: startOccupiedSeats, startCapacity },
        baseFlow: {
          ...flow,
          snapshotCount: active.length,
          removedNonRenewal,
          lostStudents: flow.historyAvailable ? lostStudents : null,
          archivedStudents,
          undecidedStudents,
          distinctStudents,
          multiClassStudents,
          note: flow.historyAvailable ? '区间流转按报名起止记录计算，同人跨班分别计；同班退后重报分别记录进出，停课不抹掉报名历史。期末报名人数不等于当前活跃学员及活跃班级快照；未结束的报名仍计入期末。' : `历史报名有 ${flow.unknownPeriods} 条缺少有效结束日期，区间流转待核对，不从当前状态倒推。当前在读人数仍按当前快照展示。`,
        },
        classFlow: {
          ...classHistory,
          currentCount: classCurrent,
          emptyClasses,
          removedStatus: null,
          removedEmpty: classHistory.removedTotal,
          removed: classHistory.removedTotal,
          note: classHistory.historyAvailable ? '区间班级流转按实际报名期间计算：首次有报名或空班补员为进入，最后一条报名结束为退出。未招到学员的空班不计入；当前停课状态不反写历史。当前在读班级数、空班数及利用率另按当前快照。' : '历史报名结束时间不完整，区间班级流转待核对；当前在读班级和空班仍按当前快照。',
        },
        fullClassRate: capacity > 0 ? Math.round((occupiedSeats / capacity) * 1000) / 10 : null,
        venueUtilizationRate: null,
        completedSchedules: schedules.length,
        period: { start, end },
        caliberNote: session.caliberNote,
        changeNote:
          '基本盘按班级内人数计（同一学员多班分别计）、满班率为当前快照；新增按建档日，不续费按标记日期，归档按归档操作时间。',
      });
    } catch (e) {
      next(e);
    }
  },
  getClassStudentChanges: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = scopeOf(req),
        { start, end } = businessPeriod(req.query);
      const classes = await prisma.class.findMany({
        where: { ...scope, status: 'active' },
        include: {
          teacher: { select: { id: true, name: true, campusId: true, organizationId: true } },
        },
      });
      const enrollments = await prisma.enrollment.findMany({
        where: {
          organizationId: scope.organizationId,
          classId: { in: classes.map((c) => c.id) },
          student: scope,
        },
        include: { student: { select: { status: true } } },
      });
      const rows = classes.map((cls) => {
        const own = enrollments.filter((e) => e.classId === cls.id),
          current = new Set(
            own
              .filter((e) => e.status === 'active' && e.student.status === 'active')
              .map((e) => e.studentId)
          ).size;
        const added = new Set(
          own.filter((e) => e.enrolledAt >= start && e.enrolledAt <= end).map((e) => e.studentId)
        ).size;
        return {
          id: cls.id,
          name: cls.name,
          code: cls.code,
          courseType: cls.courseType,
          teacherId: cls.teacherId,
          teacherName:
            cls.teacher?.campusId === scope.campusId &&
            cls.teacher.organizationId === scope.organizationId
              ? cls.teacher.name
              : '未分配',
          currentStudents: current,
          maxStudents: cls.capacity,
          capacity: cls.capacity,
          fullnessRate: cls.capacity > 0 ? Math.round((current / cls.capacity) * 1000) / 10 : null,
          newAdded: added,
          startStudents: null,
          previousStudents: null,
          lost: null,
          change: null,
          changeRate: null,
        };
      });
      sendSuccess(res, {
        classes: rows,
        stats: {
          totalClasses: rows.length,
          totalNewAdded: rows.reduce((n, c) => n + c.newAdded, 0),
          decreasedClasses: null,
          increasedClasses: null,
          unchangedClasses: null,
          totalLost: null,
          netChange: null,
        },
        lostStudents: [],
        historicalChangesAvailable: false,
        caliberNote: changeNote,
        period: { start, end },
      });
    } catch (e) {
      next(e);
    }
  },
};
