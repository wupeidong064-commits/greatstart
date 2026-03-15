import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const attendanceController = {
  getAttendances: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const studentId = req.query.studentId as string;
      const scheduleId = req.query.scheduleId as string;
      const classId = req.query.classId as string;
      const status = req.query.status as string;
      const date = req.query.date as string;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      let query = memfireAdmin
        .from('attendances')
        .select('*')
        .order('checkInTime', { ascending: false });

      if (targetOrgId) {
        query = query.eq('organizationId', targetOrgId);
      }
      if (studentId) query = query.eq('studentId', studentId);
      if (scheduleId) query = query.eq('scheduleId', scheduleId);
      if (classId) query = query.eq('classId', classId);
      if (status) query = query.eq('status', status);
      if (date) query = query.eq('date', date);

      // 分页
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: attendances, error } = await query;

      if (error) {
        return next(new ApiError('获取出勤记录失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数
      let countQuery = memfireAdmin
        .from('attendances')
        .select('*', { count: 'exact', head: true });

      if (targetOrgId) countQuery = countQuery.eq('organizationId', targetOrgId);
      if (studentId) countQuery = countQuery.eq('studentId', studentId);
      if (scheduleId) countQuery = countQuery.eq('scheduleId', scheduleId);
      if (classId) countQuery = countQuery.eq('classId', classId);
      if (status) countQuery = countQuery.eq('status', status);

      const { count } = await countQuery;

      sendPaginated(res, attendances || [], page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  getAttendanceById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: attendance, error } = await memfireAdmin
        .from('attendances')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !attendance) {
        return next(new ApiError('出勤记录不存在', 404, 'ATTENDANCE_NOT_FOUND'));
      }

      if (currentUser?.role !== 'admin' && attendance.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, attendance);
    } catch (error) {
      next(error);
    }
  },

  createAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId, scheduleId, status, checkInTime, notes } = req.body;
      const currentUser = getCurrentUser(req);
      const organizationId = req.body.organizationId || currentUser?.organizationId;

      if (!organizationId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 验证学员
      const { data: student } = await memfireAdmin
        .from('students')
        .select('id, organizationId')
        .eq('id', studentId)
        .maybeSingle();

      if (!student || student.organizationId !== organizationId) {
        return next(new ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
      }

      // 验证排课
      const { data: schedule } = await memfireAdmin
        .from('schedules')
        .select('id, organizationId, classId')
        .eq('id', scheduleId)
        .maybeSingle();

      if (!schedule || schedule.organizationId !== organizationId) {
        return next(new ApiError('排课不存在或不属于该机构', 400, 'SCHEDULE_NOT_FOUND'));
      }

      const { data: attendance, error } = await memfireAdmin
        .from('attendances')
        .insert({
          organizationId,
          studentId,
          scheduleId,
          classId: schedule.classId,
          status,
          checkInTime: checkInTime || new Date().toISOString(),
          checkedInBy: currentUser?.id,
          notes,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建出勤记录失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, attendance, '出勤记录创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  batchCheckIn: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { scheduleId, studentIds, status, notes } = req.body;
      const currentUser = getCurrentUser(req);
      const organizationId = req.body.organizationId || currentUser?.organizationId;

      if (!organizationId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 获取排课信息（需要startTime来检查日期）
      const { data: schedule } = await memfireAdmin
        .from('schedules')
        .select('id, organizationId, classId, startTime')
        .eq('id', scheduleId)
        .maybeSingle();

      if (!schedule || schedule.organizationId !== organizationId) {
        return next(new ApiError('排课不存在或不属于该机构', 400, 'SCHEDULE_NOT_FOUND'));
      }

      // 获取课程日期（不再限制只能当天划课）
      const scheduleDate = new Date(schedule.startTime);
      scheduleDate.setHours(0, 0, 0, 0);
      const scheduleDateStr = scheduleDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // 【修改】检查非管理员是否已划过该课程日期的课（基于课程日期而非当前日期）
      const userRole = currentUser?.role;
      if (userRole !== 'admin' && userRole !== 'manager') {
        const { data: existingRecord } = await memfireAdmin
          .from('lesson_deduction_records')
          .select('*')
          .eq('organizationId', organizationId)
          .eq('classId', schedule.classId)
          .eq('operatorId', currentUser?.id)
          .eq('deductionDate', scheduleDateStr)
          .maybeSingle();

        if (existingRecord) {
          return next(new ApiError(
            `您已经在 ${scheduleDateStr} 为该班级划过课了，每个课程日期只能划一次`,
            400,
            'ALREADY_DEDUCTED_FOR_DATE'
          ));
        }
      }

      const attendanceData = studentIds.map((studentId: string) => ({
        organizationId,
        studentId,
        scheduleId,
        classId: schedule.classId,
        status: status || 'present',
        checkInTime: new Date().toISOString(),
        checkedInBy: currentUser?.id,
        notes,
      }));

      const { data: results, error } = await memfireAdmin
        .from('attendances')
        .insert(attendanceData)
        .select();

      if (error) {
        return next(new ApiError('批量签到失败', 500, 'BATCH_CHECKIN_ERROR'));
      }

      // 【修改】创建划课记录（非管理员），使用课程日期而非当前日期
      if (userRole !== 'admin' && userRole !== 'manager') {
        try {
          await memfireAdmin
            .from('lesson_deduction_records')
            .insert({
              organizationId,
              classId: schedule.classId,
              operatorId: currentUser?.id,
              operatorName: (currentUser as any)?.name || '未知',
              deductionDate: scheduleDateStr,
              deductionCount: studentIds.length,
            });
        } catch (recordError) {
          console.error('创建划课记录失败:', recordError);
          // 不影响主流程，只记录错误
        }
      }

      sendSuccess(res, {
        success: results?.length || 0,
        failed: 0,
        results: results || [],
        errors: [],
      }, '批量签到完成');
    } catch (error) {
      next(error);
    }
  },

  updateAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, checkInTime, checkOutTime, notes } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: attendance } = await memfireAdmin
        .from('attendances')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!attendance) {
        return next(new ApiError('出勤记录不存在', 404, 'ATTENDANCE_NOT_FOUND'));
      }

      if (currentUser?.role !== 'admin' && attendance.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该出勤记录', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (checkInTime) updateData.checkInTime = checkInTime;
      if (checkOutTime !== undefined) updateData.checkOutTime = checkOutTime;
      if (notes !== undefined) updateData.notes = notes;

      const { data: updated, error } = await memfireAdmin
        .from('attendances')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新出勤记录失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '出勤记录更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: attendance } = await memfireAdmin
        .from('attendances')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!attendance) {
        return next(new ApiError('出勤记录不存在', 404, 'ATTENDANCE_NOT_FOUND'));
      }

      if (currentUser?.role !== 'admin' && attendance.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除该出勤记录', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('attendances')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除出勤记录失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '出勤记录删除成功');
    } catch (error) {
      next(error);
    }
  },

  getStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const [totalRes, presentRes, absentRes, lateRes, leaveRes] = await Promise.all([
        memfireAdmin.from('attendances').select('*', { count: 'exact', head: true }).eq('organizationId', targetOrgId),
        memfireAdmin.from('attendances').select('*', { count: 'exact', head: true }).eq('organizationId', targetOrgId).eq('status', 'present'),
        memfireAdmin.from('attendances').select('*', { count: 'exact', head: true }).eq('organizationId', targetOrgId).eq('status', 'absent'),
        memfireAdmin.from('attendances').select('*', { count: 'exact', head: true }).eq('organizationId', targetOrgId).eq('status', 'late'),
        memfireAdmin.from('attendances').select('*', { count: 'exact', head: true }).eq('organizationId', targetOrgId).eq('status', 'leave'),
      ]);

      const total = totalRes.count || 0;
      const present = presentRes.count || 0;
      const absent = absentRes.count || 0;
      const late = lateRes.count || 0;
      const leave = leaveRes.count || 0;
      const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

      sendSuccess(res, { total, present, absent, late, leave, attendanceRate });
    } catch (error) {
      next(error);
    }
  },

  getContinuousLeaveStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 获取所有活跃学员
      const { data: students, error: studentError } = await memfireAdmin
        .from('students')
        .select('id, name, phone')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active');

      if (studentError) {
        return sendSuccess(res, []);
      }

      const continuousLeaveStudents: any[] = [];

      for (const student of (students || [])) {
        // 获取学员的报名信息
        const { data: enrollments } = await memfireAdmin
          .from('enrollments')
          .select('classId, classes(id, name, code, teacherId)')
          .eq('studentId', student.id)
          .eq('status', 'active');

        if (!enrollments || enrollments.length === 0) continue;

        for (const enrollment of enrollments) {
          const classInfo = enrollment.classes as any;

          // 获取最近的出勤记录
          const { data: recentAttendances } = await memfireAdmin
            .from('attendances')
            .select('status')
            .eq('studentId', student.id)
            .eq('classId', enrollment.classId)
            .order('checkInTime', { ascending: false })
            .limit(5);

          // 检查是否连续请假
          let continuousAbsentCount = 0;
          for (const att of (recentAttendances || [])) {
            if (att.status === 'absent' || att.status === 'leave') {
              continuousAbsentCount++;
            } else {
              break;
            }
          }

          if (continuousAbsentCount >= 2) {
            let teacher = null;
            if (classInfo?.teacherId) {
              const { data: teacherData } = await memfireAdmin
                .from('users')
                .select('id, name')
                .eq('id', classInfo.teacherId)
                .maybeSingle();
              teacher = teacherData;
            }

            continuousLeaveStudents.push({
              id: student.id,
              studentName: student.name,
              phone: student.phone,
              classId: enrollment.classId,
              className: classInfo?.name,
              classCode: classInfo?.code,
              teacher,
              continuousAbsentCount,
            });
          }
        }
      }

      sendSuccess(res, continuousLeaveStudents);
    } catch (error) {
      console.error('获取连续请假学员错误:', error);
      sendSuccess(res, []);
    }
  },

  getHoneymoonAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const HONEYMOON_DAYS = 30;
      const now = new Date();
      const honeymoonStartDate = new Date(now);
      honeymoonStartDate.setDate(honeymoonStartDate.getDate() - HONEYMOON_DAYS);

      // 批量查询1: 获取蜜月期内的报名记录
      const { data: enrollments, error } = await memfireAdmin
        .from('enrollments')
        .select(`
          id,
          enrolledAt,
          studentId,
          classId,
          students(id, name, phone),
          classes(id, name, code, teacherId)
        `)
        .eq('organizationId', targetOrgId)
        .eq('status', 'active')
        .gte('enrolledAt', honeymoonStartDate.toISOString())
        .order('enrolledAt', { ascending: false });

      if (error || !enrollments || enrollments.length === 0) {
        return sendSuccess(res, { students: [], stats: { total: 0, avgAttendanceRate: 0, highAttendance: 0, lowAttendance: 0 } });
      }

      // 去重学员（只取第一条报名记录）
      const studentMap = new Map<string, any>();
      const studentIds: string[] = [];
      const classIds: string[] = [];

      for (const enrollment of enrollments) {
        const student = enrollment.students as any;
        if (student && !studentMap.has(student.id)) {
          const classInfo = enrollment.classes as any;
          studentMap.set(student.id, {
            student,
            classId: enrollment.classId,
            classInfo,
            enrolledAt: enrollment.enrolledAt,
          });
          studentIds.push(student.id);
          if (!classIds.includes(enrollment.classId)) {
            classIds.push(enrollment.classId);
          }
        }
      }

      // 批量查询2: 获取所有教练信息
      const teacherIds = [...new Set(
        Array.from(studentMap.values())
          .map((d: any) => d.classInfo?.teacherId)
          .filter(Boolean)
      )];
      const { data: teachers } = await memfireAdmin
        .from('users')
        .select('id, name')
        .in('id', teacherIds);
      const teacherMap = new Map((teachers || []).map((t: any) => [t.id, t]));

      // 批量查询3: 获取所有相关班级的排课数（按班级和时间范围）
      // 需要按每个学员的报名时间来计算，所以先获取所有排课
      const { data: schedules } = await memfireAdmin
        .from('schedules')
        .select('classId, startTime')
        .eq('organizationId', targetOrgId)
        .eq('status', 'completed')
        .in('classId', classIds)
        .gte('startTime', honeymoonStartDate.toISOString())
        .lte('startTime', now.toISOString());

      // 按班级分组排课
      const classSchedulesMap = new Map<string, Date[]>();
      for (const s of (schedules || [])) {
        const times = classSchedulesMap.get(s.classId) || [];
        times.push(new Date(s.startTime));
        classSchedulesMap.set(s.classId, times);
      }

      // 批量查询4: 获取所有出勤记录
      const { data: attendances } = await memfireAdmin
        .from('attendances')
        .select('studentId, classId, status, checkInTime')
        .eq('organizationId', targetOrgId)
        .in('classId', classIds)
        .in('studentId', studentIds)
        .gte('checkInTime', honeymoonStartDate.toISOString())
        .lte('checkInTime', now.toISOString());

      // 按学员+班级分组出勤
      const studentAttendanceMap = new Map<string, { status: string; checkInTime: string }[]>();
      for (const a of (attendances || [])) {
        const key = `${a.studentId}_${a.classId}`;
        const records = studentAttendanceMap.get(key) || [];
        records.push({ status: a.status, checkInTime: a.checkInTime });
        studentAttendanceMap.set(key, records);
      }

      // 组装结果
      const honeymoonStudents: any[] = [];

      for (const [studentId, data] of studentMap) {
        const { student, classId, classInfo, enrolledAt } = data;
        const enrollmentDate = new Date(enrolledAt);
        const daysPassed = Math.floor((now.getTime() - enrollmentDate.getTime()) / (1000 * 60 * 60 * 24));

        // 计算该学员报名后的排课数（应出勤次数）
        const classSchedules = classSchedulesMap.get(classId) || [];
        const validSchedules = classSchedules.filter(t => t >= enrollmentDate && t <= now);
        const expectedAttendance = validSchedules.length;

        // 获取该学员的实际出勤次数
        const key = `${studentId}_${classId}`;
        const attendanceRecords = studentAttendanceMap.get(key) || [];
        const validAttendances = attendanceRecords.filter(r => {
          const checkTime = new Date(r.checkInTime);
          return checkTime >= enrollmentDate && checkTime <= now;
        });
        const actualAttendance = validAttendances.filter(r => r.status === 'present' || r.status === 'late').length;
        const absentCount = Math.max(0, expectedAttendance - actualAttendance);
        const attendanceRate = expectedAttendance > 0 ? Math.round((actualAttendance / expectedAttendance) * 100) : 100;

        const teacher = classInfo?.teacherId ? teacherMap.get(classInfo.teacherId) : null;

        honeymoonStudents.push({
          id: studentId,
          studentName: student.name,
          phone: student.phone,
          enrollmentDate: enrolledAt,
          daysPassed,
          daysRemaining: Math.max(0, HONEYMOON_DAYS - daysPassed),
          classId,
          className: classInfo?.name,
          classCode: classInfo?.code,
          teacher,
          expectedAttendance,
          actualAttendance,
          absentCount,
          attendanceRate,
        });
      }

      // 按报名日期排序（最新的在前）
      honeymoonStudents.sort((a, b) => new Date(b.enrollmentDate).getTime() - new Date(a.enrollmentDate).getTime());

      const stats = {
        total: honeymoonStudents.length,
        avgAttendanceRate: honeymoonStudents.length > 0
          ? Math.round(honeymoonStudents.reduce((sum, s) => sum + s.attendanceRate, 0) / honeymoonStudents.length)
          : 0,
        highAttendance: honeymoonStudents.filter((s) => s.attendanceRate >= 80).length,
        lowAttendance: honeymoonStudents.filter((s) => s.attendanceRate < 60).length,
      };

      sendSuccess(res, { students: honeymoonStudents, stats });
    } catch (error) {
      console.error('获取蜜月期出勤错误:', error);
      sendSuccess(res, { students: [], stats: { total: 0, avgAttendanceRate: 0, highAttendance: 0, lowAttendance: 0 } });
    }
  },

  getLowAttendanceClasses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;
      const threshold = parseInt(req.query.threshold as string) || 60;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 获取所有活跃班级
      const { data: classes, error: classesError } = await memfireAdmin
        .from('classes')
        .select('id, name, code, capacity, teacherId, teacher:users(id, name)')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active');

      if (classesError) {
        console.error('获取班级列表失败:', classesError);
        return sendSuccess(res, []);
      }

      // 计算最近两周的日期范围
      const now = new Date();
      const twoWeeksAgo = new Date(now);
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const lowAttendanceClasses = await Promise.all(
        (classes || []).map(async (cls: any) => {
          // 获取班级学员数
          const { count: totalStudents } = await memfireAdmin
            .from('enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('classId', cls.id)
            .eq('status', 'active');

          if (!totalStudents || totalStudents === 0) {
            return null;
          }

          // 获取最近两周的排课数
          const { count: scheduleCount } = await memfireAdmin
            .from('schedules')
            .select('*', { count: 'exact', head: true })
            .eq('classId', cls.id)
            .gte('startTime', twoWeeksAgo.toISOString())
            .lte('startTime', now.toISOString());

          // 获取最近两周的出勤记录 - 使用 createdAt 因为 checkInTime 可能为空
          const { data: attendances } = await memfireAdmin
            .from('attendances')
            .select('status, createdAt')
            .eq('classId', cls.id)
            .eq('organizationId', targetOrgId)
            .gte('createdAt', twoWeeksAgo.toISOString())
            .lte('createdAt', now.toISOString());

          // 计算总应出勤人次
          const expectedAttendance = (scheduleCount || 0) * (totalStudents || 0);

          // 计算实际出勤人次
          const actualAttendance = (attendances || []).filter(
            (a: any) => a.status === 'present' || a.status === 'late'
          ).length;

          // 计算整体出勤率
          const attendanceRate = expectedAttendance > 0
            ? Math.round((actualAttendance / expectedAttendance) * 100)
            : 100;

          // 如果出勤率高于阈值，返回null
          if (attendanceRate >= threshold) {
            return null;
          }

          // 计算第一周出勤率
          const week1Attendances = (attendances || []).filter((a: any) =>
            new Date(a.checkInTime) >= twoWeeksAgo && new Date(a.checkInTime) < oneWeekAgo
          );
          const week1Expected = Math.ceil((scheduleCount || 0) / 2) * (totalStudents || 0);
          const week1Actual = week1Attendances.filter(
            (a: any) => a.status === 'present' || a.status === 'late'
          ).length;
          const week1Rate = week1Expected > 0
            ? Math.round((week1Actual / week1Expected) * 100)
            : 100;

          // 计算第二周出勤率
          const week2Attendances = (attendances || []).filter((a: any) =>
            new Date(a.checkInTime) >= oneWeekAgo
          );
          const week2Expected = Math.floor((scheduleCount || 0) / 2) * (totalStudents || 0);
          const week2Actual = week2Attendances.filter(
            (a: any) => a.status === 'present' || a.status === 'late'
          ).length;
          const week2Rate = week2Expected > 0
            ? Math.round((week2Actual / week2Expected) * 100)
            : 100;

          // 计算低出勤学员数（出勤率低于50%的学员）
          // 简化处理：返回0，因为需要更复杂的查询
          const lowAttendanceCount = 0;

          return {
            class: {
              ...cls,
              _count: {
                enrollments: totalStudents || 0,
              },
            },
            attendanceRate,
            week1Rate,
            week2Rate,
            totalStudents: totalStudents || 0,
            lowAttendanceCount,
          };
        })
      );

      // 过滤掉null值
      const result = lowAttendanceClasses.filter(Boolean);

      sendSuccess(res, result);
    } catch (error) {
      console.error('获取低出勤班级错误:', error);
      sendSuccess(res, []);
    }
  },

  getClassAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { classId } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('id, name, organizationId')
        .eq('id', classId)
        .maybeSingle();

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      if (currentUser?.role !== 'admin' && classData.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, {
        className: classData.name,
        totalStudents: 0,
        actualAttendance: 0,
        attendanceRate: 0,
        totalSchedules: 0,
      });
    } catch (error) {
      next(error);
    }
  },

  getAllClassesAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const { data: classes } = await memfireAdmin
        .from('classes')
        .select('id, name, code')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active');

      sendSuccess(res, (classes || []).map((cls: any) => ({
        id: cls.id,
        name: cls.name,
        code: cls.code,
        studentCount: 0,
        scheduleCount: 0,
        presentCount: 0,
        attendanceRate: 100,
      })));
    } catch (error) {
      next(error);
    }
  },

  getClassAttendanceStats: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 获取所有班级
      const { data: classes } = await memfireAdmin
        .from('classes')
        .select('id, name, code, level, teacherId')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active');

      if (!classes || classes.length === 0) {
        return sendSuccess(res, []);
      }

      const classIds = classes.map((c: any) => c.id);

      // 获取每个班级的学员数
      const { data: enrollments } = await memfireAdmin
        .from('enrollments')
        .select('classId, studentId')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active')
        .in('classId', classIds);

      const classStudentCount = new Map<string, number>();
      for (const e of (enrollments || [])) {
        const count = classStudentCount.get(e.classId) || 0;
        classStudentCount.set(e.classId, count + 1);
      }

      // 获取每个班级的排课数（已完成的）
      const { data: schedules } = await memfireAdmin
        .from('schedules')
        .select('classId')
        .eq('organizationId', targetOrgId)
        .eq('status', 'completed')
        .in('classId', classIds);

      const classScheduleCount = new Map<string, number>();
      for (const s of (schedules || [])) {
        const count = classScheduleCount.get(s.classId) || 0;
        classScheduleCount.set(s.classId, count + 1);
      }

      // 获取每个班级的出勤数
      const { data: attendances } = await memfireAdmin
        .from('attendances')
        .select('classId, status')
        .eq('organizationId', targetOrgId)
        .in('classId', classIds)
        .in('status', ['present', 'late']);

      const classAttendanceCount = new Map<string, number>();
      for (const a of (attendances || [])) {
        const count = classAttendanceCount.get(a.classId) || 0;
        classAttendanceCount.set(a.classId, count + 1);
      }

      // 获取所有教练信息
      const teacherIds = [...new Set(classes.map((c: any) => c.teacherId).filter(Boolean))];
      const { data: teachers } = await memfireAdmin
        .from('users')
        .select('id, name')
        .in('id', teacherIds);

      const teacherMap = new Map((teachers || []).map((t: any) => [t.id, t]));

      // 组装结果
      const stats = (classes || []).map((cls: any) => {
        const studentCount = classStudentCount.get(cls.id) || 0;
        const scheduleCount = classScheduleCount.get(cls.id) || 0;
        const actualAttendance = classAttendanceCount.get(cls.id) || 0;
        const expectedAttendance = studentCount * scheduleCount;
        const attendanceRate = expectedAttendance > 0
          ? Math.round((actualAttendance / expectedAttendance) * 100)
          : 100;

        return {
          classId: cls.id,
          className: cls.name,
          classCode: cls.code,
          level: cls.level,
          teacher: teacherMap.get(cls.teacherId) || null,
          totalStudents: studentCount,
          scheduleCount,
          expectedAttendance,
          actualAttendance,
          attendanceRate,
        };
      });

      sendSuccess(res, stats);
    } catch (error) {
      console.error('获取班级出勤统计错误:', error);
      next(error);
    }
  },

  // 获取低出勤学员 - 优化版（批量查询）
  getLowAttendanceStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;
      const { startDate, endDate, teacherId, threshold, continuousAbsentOnly } = req.query;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const thresholdValue = parseInt(threshold as string) || 60;
      const filterContinuousAbsent = continuousAbsentOnly === 'true';

      // 构建日期条件
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      end.setHours(23, 59, 59, 999);

      // 批量查询1: 获取所有活跃班级
      let classesQuery = memfireAdmin
        .from('classes')
        .select('id, name, code, teacherId')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active');

      // 如果指定了教练，提前过滤班级
      if (teacherId) {
        classesQuery = classesQuery.eq('teacherId', teacherId);
      }

      const { data: classes, error: classesError } = await classesQuery;

      if (classesError || !classes || classes.length === 0) {
        return sendSuccess(res, []);
      }

      const classIds = classes.map((c: any) => c.id);
      const classMap = new Map(classes.map((c: any) => [c.id, c]));
      const teacherIds = [...new Set(classes.map((c: any) => c.teacherId).filter(Boolean))];

      // 批量查询2: 获取所有教练信息
      const { data: teachers } = await memfireAdmin
        .from('users')
        .select('id, name')
        .in('id', teacherIds);
      const teacherMap = new Map((teachers || []).map((t: any) => [t.id, t]));

      // 批量查询3: 获取这些班级的所有活跃报名
      const { data: enrollments, error: enrollmentsError } = await memfireAdmin
        .from('enrollments')
        .select('id, studentId, classId, enrolledAt, students(id, name, phone)')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active')
        .in('classId', classIds);

      if (enrollmentsError || !enrollments || enrollments.length === 0) {
        return sendSuccess(res, []);
      }

      // 构建学员-班级映射
      const studentClassMap = new Map<string, any>();
      const studentIds: string[] = [];

      for (const e of enrollments) {
        const student = e.students as any;
        if (student && !studentClassMap.has(student.id)) {
          studentClassMap.set(student.id, {
            student,
            classId: e.classId,
            enrolledAt: e.enrolledAt,
          });
          studentIds.push(student.id);
        }
      }

      // 批量查询4: 获取时间范围内的排课数（按班级分组）
      const { data: schedules } = await memfireAdmin
        .from('schedules')
        .select('classId')
        .eq('organizationId', targetOrgId)
        .eq('status', 'completed')
        .in('classId', classIds)
        .gte('startTime', start.toISOString())
        .lte('startTime', end.toISOString());

      // 按班级统计排课数
      const classScheduleCount = new Map<string, number>();
      for (const s of (schedules || [])) {
        const count = classScheduleCount.get(s.classId) || 0;
        classScheduleCount.set(s.classId, count + 1);
      }

      // 批量查询5: 获取时间范围内的出勤记录
      const { data: attendances } = await memfireAdmin
        .from('attendances')
        .select('studentId, classId, status, checkInTime')
        .eq('organizationId', targetOrgId)
        .in('classId', classIds)
        .in('studentId', studentIds)
        .gte('checkInTime', start.toISOString())
        .lte('checkInTime', end.toISOString())
        .order('checkInTime', { ascending: false });

      // 按学员+班级统计出勤
      type AttendanceRecord = { status: string; checkInTime: string };
      const studentAttendanceMap = new Map<string, {
        presentCount: number;
        absentCount: number;
        records: AttendanceRecord[];
      }>();

      for (const a of (attendances || [])) {
        const key = `${a.studentId}_${a.classId}`;
        const stat = studentAttendanceMap.get(key) || { presentCount: 0, absentCount: 0, records: [] };
        if (a.status === 'present' || a.status === 'late') {
          stat.presentCount++;
        } else {
          stat.absentCount++;
        }
        stat.records.push({ status: a.status, checkInTime: a.checkInTime });
        studentAttendanceMap.set(key, stat);
      }

      // 计算连续缺勤（按时间倒序排列的记录中，从最近的开始计算连续缺勤/请假）
      const calculateContinuousAbsent = (records: AttendanceRecord[]): number => {
        // 按时间降序排序（最新的在前）
        const sorted = [...records].sort((a, b) =>
          new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime()
        );
        let count = 0;
        for (const r of sorted) {
          if (r.status === 'absent' || r.status === 'leave') {
            count++;
          } else {
            break; // 遇到出勤就停止
          }
        }
        return count;
      };

      // 组装结果
      const lowAttendanceStudents: any[] = [];

      for (const [studentId, data] of studentClassMap) {
        const { student, classId, enrolledAt } = data;
        const classInfo = classMap.get(classId);
        const scheduleCount = classScheduleCount.get(classId) || 0;

        // 如果没有排课，跳过
        if (scheduleCount === 0) continue;

        const key = `${studentId}_${classId}`;
        const attendanceStat = studentAttendanceMap.get(key) || { presentCount: 0, absentCount: 0, records: [] };
        const presentCount = attendanceStat.presentCount;
        const absentCount = scheduleCount - presentCount;
        const attendanceRate = scheduleCount > 0 ? Math.round((presentCount / scheduleCount) * 100) : 100;

        // 过滤低出勤学员
        if (attendanceRate >= thresholdValue) continue;

        // 计算连续缺勤
        const continuousAbsentCount = calculateContinuousAbsent(attendanceStat.records);
        const isContinuousAbsent = continuousAbsentCount >= 2;

        // 如果需要连续缺勤过滤
        if (filterContinuousAbsent && !isContinuousAbsent) continue;

        const teacher = classInfo?.teacherId ? teacherMap.get(classInfo.teacherId) : null;

        lowAttendanceStudents.push({
          id: studentId,
          studentName: student.name,
          phone: student.phone,
          enrollmentDate: enrolledAt,
          classId,
          className: classInfo?.name,
          classCode: classInfo?.code,
          teacher,
          scheduleCount,
          presentCount,
          absentCount,
          continuousAbsentCount,
          attendanceRate,
          isContinuousAbsent,
        });
      }

      // 按出勤率升序排序
      lowAttendanceStudents.sort((a, b) => a.attendanceRate - b.attendanceRate);

      sendSuccess(res, lowAttendanceStudents);
    } catch (error) {
      console.error('获取低出勤学员错误:', error);
      sendSuccess(res, []);
    }
  },
};
