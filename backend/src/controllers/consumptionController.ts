import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const consumptionController = {
  // 获取消耗统计
  getStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;
      const { startDate, endDate } = req.query;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const start = startDate ? new Date(startDate as string) : null;
      const end = endDate ? new Date(endDate as string) : null;
      if (end) {
        end.setHours(23, 59, 59, 999);
      }

      // 1. 获取班级统计数据
      const { data: allClasses, error: classesError } = await memfireAdmin
        .from('classes')
        .select('id, name, code, courseType, level, capacity, teacherId')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active');

      if (classesError) {
        console.error('获取班级数据失败:', classesError);
      }

      const classCount = (allClasses || []).length;

      // 幼儿班数量
      const preschoolClassCount = (allClasses || []).filter(
        (c: any) => c.courseType && (c.courseType.includes('幼儿') || c.courseType.toLowerCase().includes('preschool'))
      ).length;

      // 精英班数量
      const eliteClassCount = (allClasses || []).filter(
        (c: any) => c.courseType && (c.courseType.includes('精英') || c.courseType.toLowerCase().includes('elite'))
      ).length;

      // 2. 获取出勤数据（实际划课数）
      let attendanceQuery = memfireAdmin
        .from('attendances')
        .select('id, status')
        .eq('organizationId', targetOrgId)
        .in('status', ['present', 'late']);

      if (start && end) {
        // 使用 createdAt 过滤，因为 checkInTime 可能为空
        attendanceQuery = attendanceQuery.gte('createdAt', start.toISOString()).lte('createdAt', end.toISOString());
      }

      const { data: attendances, error: attendancesError } = await attendanceQuery;

      const totalAttendance = (attendances || []).length;

      // 3. 获取排课数据
      let scheduleQuery = memfireAdmin
        .from('schedules')
        .select('id, classId, status')
        .eq('organizationId', targetOrgId);

      if (start && end) {
        scheduleQuery = scheduleQuery.gte('startTime', start.toISOString()).lte('startTime', end.toISOString());
      }

      const { data: schedules, error: schedulesError } = await scheduleQuery;

      const completedSchedules = (schedules || []).filter((s: any) => s.status === 'completed').length;

      // 计算应划课数（基于排课和班级人数）
      let totalAttendanceCount = 0;
      for (const schedule of (schedules || [])) {
        const classData = (allClasses || []).find((c: any) => c.id === schedule.classId);
        if (classData) {
          // 简化处理：假设每个班级平均10人
          totalAttendanceCount += 10;
        }
      }

      // 出勤率
      const attendanceRate = totalAttendanceCount > 0
        ? Math.round((totalAttendance / totalAttendanceCount) * 100 * 10) / 10
        : 0;

      // 4. 获取活跃学员数（基本盘人数/花名册人数）
      const { data: activeEnrollments } = await memfireAdmin
        .from('enrollments')
        .select('studentId')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active');

      const baseCount = new Set((activeEnrollments || []).map((e: any) => e.studentId)).size;
      const rosterCount = baseCount;

      // 5. 计算新增人数
      let newRecruits = 0;
      if (start && end) {
        const { count } = await memfireAdmin
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('organizationId', targetOrgId)
          .gte('createdAt', start.toISOString())
          .lte('createdAt', end.toISOString());
        newRecruits = count || 0;
      }

      // 6. 召回人数（简化处理）
      const recalled = 0;

      // 7. 不续费人数
      let nonRenewals = 0;
      if (start && end) {
        const { count } = await memfireAdmin
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('organizationId', targetOrgId)
          .eq('status', 'inactive')
          .gte('updatedAt', start.toISOString())
          .lte('updatedAt', end.toISOString());
        nonRenewals = count || 0;
      }

      // 8. 删除花名册人数（流失学员）
      // 需要统计：enrollments.status = 'cancelled' OR students.status = 'lost'
      let deletedRoster = 0;
      if (start && end) {
        // 方法1：统计enrollments中status为cancelled的记录
        const { count: cancelledCount } = await memfireAdmin
          .from('enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('organizationId', targetOrgId)
          .eq('status', 'cancelled')
          .gte('updatedAt', start.toISOString())
          .lte('updatedAt', end.toISOString());

        // 方法2：统计students中status为lost的学员，这些学员在时间范围内有报名记录
        const { data: lostStudents } = await memfireAdmin
          .from('students')
          .select('id')
          .eq('organizationId', targetOrgId)
          .eq('status', 'lost')
          .gte('updatedAt', start.toISOString())
          .lte('updatedAt', end.toISOString());

        let lostStudentCount = 0;
        if (lostStudents && lostStudents.length > 0) {
          const lostStudentIds = lostStudents.map((s: any) => s.id);
          // 检查这些流失学员是否有报名记录
          const { count: lostEnrollmentCount } = await memfireAdmin
            .from('enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('organizationId', targetOrgId)
            .in('studentId', lostStudentIds);
          lostStudentCount = lostEnrollmentCount || 0;
        }

        deletedRoster = (cancelledCount || 0) + lostStudentCount;
      }

      // 9. 获取收入数据（计算课单价和确认收入）
      // 课单价 = price / totalLessons，从 conversions 表计算平均课单价
      // 确认收入 = 课消数 × 平均课单价
      let conversionQuery = memfireAdmin
        .from('conversions')
        .select('price, totalLessons')
        .eq('organizationId', targetOrgId);

      if (start && end) {
        conversionQuery = conversionQuery.gte('conversionDate', start.toISOString()).lte('conversionDate', end.toISOString());
      }

      const { data: conversions } = await conversionQuery;

      // 计算平均课单价（price / totalLessons 的平均值）
      let avgLessonPrice = 0;
      if (conversions && conversions.length > 0) {
        const lessonPrices = (conversions as any[])
          .filter((c: any) => c.price && c.totalLessons && c.totalLessons > 0)
          .map((c: any) => c.price / c.totalLessons);

        if (lessonPrices.length > 0) {
          avgLessonPrice = lessonPrices.reduce((sum: number, p: number) => sum + p, 0) / lessonPrices.length;
        }
      }

      // 确认收入 = 课消数 × 平均课单价
      const totalRevenue = Math.round(totalAttendance * avgLessonPrice * 100) / 100;

      // 10. 课单价（用于显示）
      const lessonPrice = Math.round(avgLessonPrice * 100) / 100;

      // 11. 计算满班率
      let totalCapacity = 0;
      let totalEnrolled = 0;
      for (const cls of (allClasses || [])) {
        totalCapacity += cls.capacity || 0;
        // 简化处理：假设每个班级平均10人
        totalEnrolled += 10;
      }
      const fullClassRate = totalCapacity > 0
        ? Math.round((totalEnrolled / totalCapacity) * 100 * 10) / 10
        : 0;

      // 12. 场地使用率（由前端计算）
      const venueUtilizationRate = 0;

      const statistics = {
        totalAttendance,
        totalAttendanceCount,
        baseCount,
        rosterCount,
        newRecruits,
        recalled,
        nonRenewals,
        deletedRoster,
        attendanceRate,
        lessonPrice,
        classCount,
        preschoolClassCount,
        eliteClassCount,
        totalRevenue,
        fullClassRate,
        venueUtilizationRate,
        completedSchedules,
        period: {
          start: start ? start.toISOString() : null,
          end: end ? end.toISOString() : null,
        },
      };

      sendSuccess(res, statistics);
    } catch (error) {
      console.error('获取统计数据错误:', error);
      // 返回默认值而不是报错
      sendSuccess(res, {
        totalAttendance: 0,
        totalAttendanceCount: 0,
        baseCount: 0,
        rosterCount: 0,
        newRecruits: 0,
        recalled: 0,
        nonRenewals: 0,
        deletedRoster: 0,
        attendanceRate: 0,
        lessonPrice: 0,
        classCount: 0,
        preschoolClassCount: 0,
        eliteClassCount: 0,
        totalRevenue: 0,
        fullClassRate: 0,
        venueUtilizationRate: 0,
        completedSchedules: 0,
      });
    }
  },

  // 获取班级学员变动（重构版：专注于发现人数减少的班级）
  getClassStudentChanges: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;
      const { startDate, endDate } = req.query;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const start = startDate ? new Date(startDate as string) : null;
      const end = endDate ? new Date(endDate as string) : null;
      if (end) {
        end.setHours(23, 59, 59, 999);
      }

      // 1. 获取所有活跃班级 - 使用直接 fetch 查询
      const envKey = process.env.MEMFIRE_SERVICE_ROLE_KEY || '';
      const envUrl = process.env.MEMFIRE_URL || '';

      const fetchUrl = `${envUrl}/rest/v1/classes?select=id,name,code,capacity,teacherId,courseType&organizationId=eq.${targetOrgId}&status=eq.active`;

      const fetchResponse = await fetch(fetchUrl, {
        headers: {
          'apikey': envKey,
          'Authorization': `Bearer ${envKey}`,
          'Content-Type': 'application/json'
        }
      });

      const classes = await fetchResponse.json();
      const classesError = !fetchResponse.ok ? { message: fetchResponse.statusText } : null;

      if (classesError) {
        console.error('获取班级数据失败:', classesError);
        return sendSuccess(res, { classes: [], stats: getDefaultStats(), lostStudents: [] });
      }

      if (!classes || classes.length === 0) {
        return sendSuccess(res, { classes: [], stats: getDefaultStats(), lostStudents: [] });
      }

      const classIds = classes.map((c: any) => c.id);
      const classMap: Record<string, any> = {};
      classes.forEach((c: any) => {
        classMap[c.id] = c;
      });

      // 2. 批量获取所有教练信息
      const teacherIdSet = new Set<string>();
      classes.forEach((c: any) => {
        if (c.teacherId) teacherIdSet.add(c.teacherId);
      });
      const teacherIds = Array.from(teacherIdSet);
      const teacherMap: Record<string, string> = {};

      if (teacherIds.length > 0) {
        const { data: teachers } = await memfireAdmin
          .from('users')
          .select('id, name')
          .in('id', teacherIds);
        (teachers || []).forEach((t: any) => {
          teacherMap[t.id] = t.name;
        });
      }

      // 3. 获取当前活跃学员（按班级统计）
      const { data: activeEnrollments } = await memfireAdmin
        .from('enrollments')
        .select('classId, studentId, enrolledAt')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active')
        .in('classId', classIds);

      // 统计每个班级的当前学员数和学员ID集合
      const currentStudentCounts: Record<string, number> = {};
      const currentStudentIdSets: Record<string, Set<string>> = {};

      for (const e of (activeEnrollments || [])) {
        currentStudentCounts[e.classId] = (currentStudentCounts[e.classId] || 0) + 1;
        if (!currentStudentIdSets[e.classId]) {
          currentStudentIdSets[e.classId] = new Set();
        }
        currentStudentIdSets[e.classId].add(e.studentId);
      }

      // 4. 获取学员变动数据（新增和流失）
      let newAddedMap: Record<string, number> = {};
      let lostMap: Record<string, number> = {};
      let lostStudentsList: any[] = [];

      if (start) {
        // 方法1: 查询学员表中状态为 inactive/lost 的学员，且在时间范围内更新
        const { data: lostStudentsData } = await memfireAdmin
          .from('students')
          .select('id, name, status, updatedAt')
          .eq('organizationId', targetOrgId)
          .in('status', ['inactive', 'lost'])
          .gte('updatedAt', start.toISOString())
          .lte('updatedAt', end ? end.toISOString() : new Date().toISOString());

        // 对于这些流失学员，查找他们的报名记录
        if (lostStudentsData && lostStudentsData.length > 0) {
          const lostStudentIds = lostStudentsData.map(s => s.id);
          const { data: lostStudentEnrollments } = await memfireAdmin
            .from('enrollments')
            .select('classId, studentId')
            .eq('organizationId', targetOrgId)
            .in('classId', classIds)
            .in('studentId', lostStudentIds);

          // 统计每个班级的流失学员（基于学员状态）
          for (const e of (lostStudentEnrollments || [])) {
            // 检查是否已经被统计
            const alreadyCounted = lostStudentsList.some(
              (l) => l.classId === e.classId && l.studentId === e.studentId
            );
            if (!alreadyCounted) {
              lostMap[e.classId] = (lostMap[e.classId] || 0) + 1;
              const studentInfo = lostStudentsData.find(s => s.id === e.studentId);
              const cls = classMap[e.classId];
              lostStudentsList.push({
                classId: e.classId,
                className: cls?.name || '未知班级',
                studentId: e.studentId,
                studentName: studentInfo?.name || '未知学员',
                studentStatus: studentInfo?.status,
              });
            }
          }
        }

        // 方法1.6: 查询续费管理中标记为不续费的学员
        const { data: noRenewalStudentsData } = await memfireAdmin
          .from('students')
          .select('id, name, renewalStatus, noRenewalDate, noRenewalReason')
          .eq('organizationId', targetOrgId)
          .eq('renewalStatus', 'no_renewal')
          .gte('noRenewalDate', start.toISOString())
          .lte('noRenewalDate', end ? end.toISOString() : new Date().toISOString());

        // 对于这些不续费学员，查找他们的报名记录
        if (noRenewalStudentsData && noRenewalStudentsData.length > 0) {
          const noRenewalStudentIds = noRenewalStudentsData.map(s => s.id);
          const { data: noRenewalEnrollments } = await memfireAdmin
            .from('enrollments')
            .select('classId, studentId')
            .eq('organizationId', targetOrgId)
            .in('classId', classIds)
            .in('studentId', noRenewalStudentIds);

          // 统计每个班级的不续费学员
          for (const e of (noRenewalEnrollments || [])) {
            // 检查是否已经被统计
            const alreadyCounted = lostStudentsList.some(
              (l) => l.classId === e.classId && l.studentId === e.studentId
            );
            if (!alreadyCounted) {
              lostMap[e.classId] = (lostMap[e.classId] || 0) + 1;
              const studentInfo = noRenewalStudentsData.find(s => s.id === e.studentId);
              const cls = classMap[e.classId];
              lostStudentsList.push({
                classId: e.classId,
                className: cls?.name || '未知班级',
                studentId: e.studentId,
                studentName: studentInfo?.name || '未知学员',
                studentStatus: 'no_renewal',
                noRenewalReason: studentInfo?.noRenewalReason,
              });
            }
          }
        }

        // 方法1.7: 查询退费学员
        const { data: refundedStudentsData } = await memfireAdmin
          .from('students')
          .select('id, name, refundReason, refundDate')
          .eq('organizationId', targetOrgId)
          .eq('status', 'refunded')
          .gte('refundDate', start.toISOString())
          .lte('refundDate', end ? end.toISOString() : new Date().toISOString());

        // 对于这些退费学员，查找他们的报名记录
        if (refundedStudentsData && refundedStudentsData.length > 0) {
          const refundedStudentIds = refundedStudentsData.map(s => s.id);
          const { data: refundedEnrollments } = await memfireAdmin
            .from('enrollments')
            .select('classId, studentId')
            .eq('organizationId', targetOrgId)
            .in('classId', classIds)
            .in('studentId', refundedStudentIds);

          // 统计每个班级的退费学员
          for (const e of (refundedEnrollments || [])) {
            // 检查是否已经被统计
            const alreadyCounted = lostStudentsList.some(
              (l) => l.classId === e.classId && l.studentId === e.studentId
            );
            if (!alreadyCounted) {
              lostMap[e.classId] = (lostMap[e.classId] || 0) + 1;
              const studentInfo = refundedStudentsData.find(s => s.id === e.studentId);
              const cls = classMap[e.classId];
              lostStudentsList.push({
                classId: e.classId,
                className: cls?.name || '未知班级',
                studentId: e.studentId,
                studentName: studentInfo?.name || '未知学员',
                studentStatus: 'refunded',
                refundReason: studentInfo?.refundReason,
              });
            }
          }
        }

        // 方法2: 同时也使用期初对比法（作为补充）
        // 获取在时间范围开始前就存在的所有报名记录（无论当前状态如何）
        const { data: periodStartEnrollments } = await memfireAdmin
          .from('enrollments')
          .select('classId, studentId, enrolledAt, student:students(id, name)')
          .eq('organizationId', targetOrgId)
          .in('classId', classIds)
          .lt('enrolledAt', start.toISOString());

        const periodStartStudentIds: Record<string, Set<string>> = {};
        for (const e of (periodStartEnrollments || [])) {
          if (!periodStartStudentIds[e.classId]) {
            periodStartStudentIds[e.classId] = new Set();
          }
          periodStartStudentIds[e.classId].add(e.studentId);
        }

        // 期初学员中不在当前学员列表的就是流失的（如果还没被方法1统计到）
        for (const classId of Object.keys(periodStartStudentIds)) {
          const periodStartSet = periodStartStudentIds[classId];
          const currentSet = currentStudentIdSets[classId] || new Set();
          for (const studentId of Array.from(periodStartSet)) {
            if (!currentSet.has(studentId)) {
              // 检查是否已经被方法1统计
              const alreadyCounted = lostStudentsList.some(
                (l) => l.classId === classId && l.studentId === studentId
              );
              if (!alreadyCounted) {
                lostMap[classId] = (lostMap[classId] || 0) + 1;
                const periodStartEnrollment = (periodStartEnrollments || []).find(
                  (e: any) => e.classId === classId && e.studentId === studentId
                );
                const studentData = periodStartEnrollment?.student as { name?: string } | null;
                const cls = classMap[classId];
                lostStudentsList.push({
                  classId,
                  className: cls?.name || '未知班级',
                  studentId,
                  studentName: studentData?.name || '未知学员',
                });
              }
            }
          }
        }

        // 计算新增：当前学员中在时间范围内报名的
        const { data: newEnrollments } = await memfireAdmin
          .from('enrollments')
          .select('classId')
          .eq('organizationId', targetOrgId)
          .eq('status', 'active')
          .in('classId', classIds)
          .gte('enrolledAt', start.toISOString())
          .lte('enrolledAt', end ? end.toISOString() : new Date().toISOString());

        for (const e of (newEnrollments || [])) {
          newAddedMap[e.classId] = (newAddedMap[e.classId] || 0) + 1;
        }
      }

      // 5. 构建结果
      const classChanges = classes.map((cls: any) => {
        const currentStudents = currentStudentCounts[cls.id] || 0;
        const newAdded = newAddedMap[cls.id] || 0;
        const lost = lostMap[cls.id] || 0;
        // 期初人数 = 当前人数 - 新增 + 流失
        const startStudents = currentStudents - newAdded + lost;
        const change = newAdded - lost;
        const changeRate = startStudents > 0 ? Math.round((change / startStudents) * 100 * 10) / 10 : 0;
        const fullnessRate = cls.capacity > 0 ? Math.round((currentStudents / cls.capacity) * 100 * 10) / 10 : 0;

        return {
          id: cls.id,
          name: cls.name,
          code: cls.code,
          teacherId: cls.teacherId,
          teacherName: teacherMap[cls.teacherId] || '未分配',
          currentStudents,
          startStudents,  // 期初人数
          newAdded,
          lost,
          change,
          changeRate,
          fullnessRate,
          courseType: cls.courseType,
        };
      });

      // 7. 计算汇总统计
      const stats = {
        totalClasses: classChanges.length,
        decreasedClasses: classChanges.filter((c) => c.change < 0).length,
        increasedClasses: classChanges.filter((c) => c.change > 0).length,
        unchangedClasses: classChanges.filter((c) => c.change === 0).length,
        totalLost: classChanges.reduce((sum, c) => sum + c.lost, 0),
        totalNewAdded: classChanges.reduce((sum, c) => sum + c.newAdded, 0),
        netChange: classChanges.reduce((sum, c) => sum + c.change, 0),
      };

      sendSuccess(res, {
        classes: classChanges,
        stats,
        lostStudents: lostStudentsList,  // 流失学员名单
      });
    } catch (error) {
      console.error('获取班级学员变动错误:', error);
      sendSuccess(res, { classes: [], stats: getDefaultStats(), lostStudents: [] });
    }
  },
};

// 默认统计数据
const getDefaultStats = () => ({
  totalClasses: 0,
  decreasedClasses: 0,
  increasedClasses: 0,
  unchangedClasses: 0,
  totalLost: 0,
  totalNewAdded: 0,
  netChange: 0,
});
