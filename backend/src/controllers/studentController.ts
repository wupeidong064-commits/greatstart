import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';
import * as XLSX from 'xlsx';

// 辅助函数：获取当前用户信息（兼容 req.user 和 req.memfireUser）
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const studentController = {
  getStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const campusId = req.query.campusId as string;
      const teacherId = req.query.teacherId as string;
      const maxRemainingLessons = req.query.maxRemainingLessons ? parseInt(req.query.maxRemainingLessons as string) : null;
      const excludeNoRenewal = req.query.excludeNoRenewal === 'true';
      const renewalStatus = req.query.renewalStatus as string;
      const currentUser = getCurrentUser(req);

      // 数据隔离：使用用户自己的机构ID，admin可以看到所有数据
      const targetOrgId = currentUser?.organizationId;

      // 如果指定了 teacherId，先通过子查询获取该教练负责的学员ID列表
      let filteredStudentIds: string[] | null = null;
      if (teacherId) {
        console.log('[DEBUG getStudents] 按教练过滤, teacherId:', teacherId);

        // 1. 获取该教练负责的所有班级
        const { data: classes } = await memfireAdmin
          .from('classes')
          .select('id')
          .eq('teacherId', teacherId)
          .eq('organizationId', targetOrgId);

        const classIds = (classes || []).map((c: any) => c.id);
        console.log('[DEBUG getStudents] 该教练的班级:', classIds);

        if (classIds.length > 0) {
          // 2. 获取这些班级中所有活跃的报名记录中的学员ID
          const { data: enrollments } = await memfireAdmin
            .from('enrollments')
            .select('studentId')
            .in('classId', classIds)
            .eq('status', 'active')
            .eq('organizationId', targetOrgId);

          console.log('[DEBUG getStudents] 这些班级的报名记录:', enrollments?.length || 0, '条');

          filteredStudentIds = Array.from(new Set((enrollments || []).map((e: any) => e.studentId)));
          console.log('[DEBUG getStudents] 过滤后的学员ID列表:', filteredStudentIds);
        }

        // 如果没有找到任何学员，直接返回空结果
        if (!filteredStudentIds || filteredStudentIds.length === 0) {
          return sendPaginated(res, [], page, pageSize, 0);
        }
      }

      let query = memfireAdmin
        .from('students')
        .select('*')
        .order('createdAt', { ascending: false });

      // Admin without orgId can see all students, otherwise filter by orgId
      if (targetOrgId) {
        query = query.eq('organizationId', targetOrgId);
      }

      // 校区过滤
      if (campusId) {
        query = query.eq('campusId', campusId);
      } else if (currentUser?.campusId) {
        query = query.eq('campusId', currentUser.campusId);
      }

      // 状态过滤
      if (status) {
        query = query.eq('status', status);
      }

      // 续费状态过滤
      if (renewalStatus) {
        query = query.eq('renewalStatus', renewalStatus);
      }

      // 排除不续费学员
      if (excludeNoRenewal) {
        query = query.is('renewalStatus', null);
      }

      // 教练过滤：通过学员ID列表过滤（必须在分页之前进行）
      if (filteredStudentIds) {
        query = query.in('id', filteredStudentIds);
      }

      // 分页：如果指定了 maxRemainingLessons，需要特殊处理
      // 因为剩余课时过滤是在客户端进行的，所以需要获取更多数据后再分页
      const actualPageSize = maxRemainingLessons !== null ? Math.max(pageSize * 5, 100) : pageSize;
      const actualPage = maxRemainingLessons !== null ? 1 : page;

      query = query.range((actualPage - 1) * actualPageSize, (actualPage - 1) * actualPageSize + actualPageSize - 1);

      const { data: students, error } = await query;

      if (error) {
        return next(new ApiError('获取学员列表失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数（需要使用相同的过滤条件）
      // 注意：当 maxRemainingLessons 指定时，count 不准确，因为该过滤是在客户端进行的
      // 我们会在后面根据实际的过滤结果更新 count
      let countQuery = memfireAdmin
        .from('students')
        .select('*', { count: 'exact', head: true });

      if (targetOrgId) {
        countQuery = countQuery.eq('organizationId', targetOrgId);
      }

      if (campusId) {
        countQuery = countQuery.eq('campusId', campusId);
      } else if (currentUser?.campusId && targetOrgId) {
        countQuery = countQuery.eq('campusId', currentUser.campusId);
      }

      if (status) {
        countQuery = countQuery.eq('status', status);
      }

      if (renewalStatus) {
        countQuery = countQuery.eq('renewalStatus', renewalStatus);
      }

      if (excludeNoRenewal) {
        countQuery = countQuery.is('renewalStatus', null);
      }

      if (filteredStudentIds) {
        countQuery = countQuery.in('id', filteredStudentIds);
      }

      const { count } = await countQuery;

      // 客户端搜索过滤
      let filteredStudents = students || [];
      if (search) {
        const searchLower = search.toLowerCase();
        filteredStudents = filteredStudents.filter((s: any) =>
          (s.name && s.name.toLowerCase().includes(searchLower)) ||
          (s.phone && s.phone.toLowerCase().includes(searchLower)) ||
          (s.parentName && s.parentName.toLowerCase().includes(searchLower)) ||
          (s.parentPhone && s.parentPhone.toLowerCase().includes(searchLower))
        );
      }

      // 剩余课时过滤（maxRemainingLessons）
      console.log('[DEBUG getStudents] 剩余课时过滤前, 学员数:', filteredStudents.length, 'maxRemainingLessons:', maxRemainingLessons);
      if (maxRemainingLessons !== null) {
        filteredStudents = filteredStudents.filter((s: any) =>
          s.remainingLessons !== null && s.remainingLessons <= maxRemainingLessons
        );
      }
      console.log('[DEBUG getStudents] 剩余课时过滤后, 学员数:', filteredStudents.length);

      // 如果指定了 maxRemainingLessons，需要在客户端进行分页
      // 计算实际的总数（在分页之前）
      let actualFilteredCount = count || 0;
      if (maxRemainingLessons !== null) {
        // 获取所有符合条件的学生（不分页）来计算准确的总数
        // 由于数据库限制，我们使用已获取的数据进行估算
        // 对于 renewal management 场景，100 条记录足够覆盖大多数情况
        actualFilteredCount = filteredStudents.length;
        console.log('[DEBUG getStudents] maxRemainingLessons 过滤后的实际总数:', actualFilteredCount);

        const clientOffset = (page - 1) * pageSize;
        const clientLimit = pageSize;
        filteredStudents = filteredStudents.slice(clientOffset, clientOffset + clientLimit);
        console.log('[DEBUG getStudents] 客户端分页后, 学员数:', filteredStudents.length, `offset=${clientOffset}, limit=${clientLimit}`);
      }

      // 批量获取学员的 enrollments 数据（用于显示班级信息）
      const studentIds = (filteredStudents || []).map((s: any) => s.id);
      console.log('[DEBUG getStudents] 查询学员 enrollments, studentIds:', studentIds);
      let enrollmentsMap: Record<string, any[]> = {};

      if (studentIds.length > 0) {
        // 1. 查询所有学员的报名记录
        const { data: enrollments } = await memfireAdmin
          .from('enrollments')
          .select('*')
          .in('studentId', studentIds)
          .eq('status', 'active')
          .eq('organizationId', targetOrgId);

        console.log('[DEBUG getStudents] 查询到的 enrollments:', enrollments?.length || 0, '条');

        // 2. 获取所有相关的班级ID
        const classIds = Array.from(new Set((enrollments || []).map((e: any) => e.classId).filter(Boolean)));
        console.log('[DEBUG getStudents] 查询到的 classIds:', classIds);

        // 3. 批量查询班级信息
        let classesMap: Record<string, any> = {};
        if (classIds.length > 0) {
          const { data: classes } = await memfireAdmin
            .from('classes')
            .select('id, name, code, teacherId')
            .in('id', classIds);

          console.log('[DEBUG getStudents] 查询到的 classes:', classes?.length || 0, '条');
          console.log('[DEBUG getStudents] classes 数据:', classes);

          classesMap = (classes || []).reduce((acc: Record<string, any>, c: any) => {
            acc[c.id] = c;
            return acc;
          }, {});
        }

        // 4. 按学员 ID 分组报名记录，并附上班级信息
        enrollmentsMap = (enrollments || []).reduce((acc: Record<string, any[]>, e: any) => {
          if (!acc[e.studentId]) {
            acc[e.studentId] = [];
          }
          acc[e.studentId].push({
            ...e,
            class: classesMap[e.classId] || null,
          });
          return acc;
        }, {});
      }

      console.log('[DEBUG getStudents] enrollmentsMap keys:', Object.keys(enrollmentsMap));

      // 将 enrollments 数据附加到每个学员
      const studentsWithEnrollments = (filteredStudents || []).map((s: any) => ({
        ...s,
        enrollments: enrollmentsMap[s.id] || [],
      }));

      console.log('[DEBUG getStudents] 返回给前端的学员数:', studentsWithEnrollments.length);
      console.log('[DEBUG getStudents] 返回数据样例:', studentsWithEnrollments.slice(0, 2).map(s => ({
        id: s.id,
        name: s.name,
        remainingLessons: s.remainingLessons,
        enrollments: s.enrollments?.length || 0
      })));
      console.log('[DEBUG getStudents] 发送到前端的分页信息:', {
        page,
        pageSize,
        total: actualFilteredCount
      });
      sendPaginated(res, studentsWithEnrollments, page, pageSize, actualFilteredCount);
    } catch (error) {
      next(error);
    }
  },

  getStudentById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: student, error } = await memfireAdmin
        .from('students')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && student.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      // 获取学员的 enrollments 数据（用于显示班级信息）
      let studentWithEnrollments = { ...student, enrollments: [] };

      const { data: enrollments } = await memfireAdmin
        .from('enrollments')
        .select('*')
        .eq('studentId', id)
        .eq('status', 'active')
        .eq('organizationId', student.organizationId);

      if (enrollments && enrollments.length > 0) {
        // 获取班级ID列表
        const classIds = Array.from(new Set(enrollments.map((e: any) => e.classId).filter(Boolean)));

        // 批量查询班级信息
        let classesMap: Record<string, any> = {};
        if (classIds.length > 0) {
          const { data: classes } = await memfireAdmin
            .from('classes')
            .select('id, name, code, teacherId')
            .in('id', classIds);

          classesMap = (classes || []).reduce((acc: Record<string, any>, c: any) => {
            acc[c.id] = c;
            return acc;
          }, {});
        }

        // 附上班级信息
        studentWithEnrollments = {
          ...student,
          enrollments: enrollments.map((e: any) => ({
            ...e,
            class: classesMap[e.classId] || null,
          })),
        };
      }

      sendSuccess(res, studentWithEnrollments);
    } catch (error) {
      next(error);
    }
  },

  createStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, gender, birthDate, phone, parentName, parentPhone, campusId, organizationId, remainingLessons, source, cardOpenDate, purchasedLessons, consumedLessons, totalPayment, salesId, lastClassDate } = req.body;
      const currentUser = getCurrentUser(req);

      // 数据隔离：使用用户自己的机构ID
      const targetOrgId = organizationId || currentUser?.organizationId;
      if (!targetOrgId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      if (currentUser?.role !== 'admin' && targetOrgId !== currentUser?.organizationId) {
        return next(new ApiError('无权在该机构创建学员', 403, 'FORBIDDEN'));
      }

      // 验证校区（如果指定）
      if (campusId) {
        const { data: campus } = await memfireAdmin
          .from('campuses')
          .select('id, organizationId')
          .eq('id', campusId)
          .maybeSingle();

        if (!campus || campus.organizationId !== targetOrgId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
      }

      const { data: student, error } = await memfireAdmin
        .from('students')
        .insert({
          name,
          gender,
          birthDate,
          phone,
          parentName,
          parentPhone,
          campusId,
          organizationId: targetOrgId,
          remainingLessons: remainingLessons || 0,
          source,
          status: 'active',
          // 新增字段
          cardOpenDate,
          purchasedLessons: purchasedLessons || 0,
          consumedLessons: consumedLessons || 0,
          totalPayment: totalPayment || 0,
          salesId,
          lastClassDate,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建学员失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, student, '学员创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, gender, birthDate, phone, parentName, parentPhone, campusId, status, deleteReason, expectedRecallDate, renewalStatus, noRenewalReason, noRenewalDate, remainingLessons, refundReason, refundDate, cardOpenDate, purchasedLessons, consumedLessons, totalPayment, salesId, lastClassDate } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: existing } = await memfireAdmin
        .from('students')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该学员', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (gender) updateData.gender = gender;
      if (birthDate) updateData.birthDate = birthDate;
      if (phone !== undefined) updateData.phone = phone;
      if (parentName !== undefined) updateData.parentName = parentName;
      if (parentPhone !== undefined) updateData.parentPhone = parentPhone;
      if (campusId) updateData.campusId = campusId;
      if (status) updateData.status = status;
      if (remainingLessons !== undefined) updateData.remainingLessons = remainingLessons;

      // 新增字段更新
      if (cardOpenDate !== undefined) updateData.cardOpenDate = cardOpenDate;
      if (purchasedLessons !== undefined) updateData.purchasedLessons = purchasedLessons;
      if (consumedLessons !== undefined) updateData.consumedLessons = consumedLessons;
      if (totalPayment !== undefined) updateData.totalPayment = totalPayment;
      if (salesId !== undefined) updateData.salesId = salesId;
      if (lastClassDate !== undefined) updateData.lastClassDate = lastClassDate;

      // 续费相关字段更新
      if (renewalStatus !== undefined) updateData.renewalStatus = renewalStatus;
      if (noRenewalReason !== undefined) updateData.noRenewalReason = noRenewalReason;
      if (noRenewalDate !== undefined) updateData.noRenewalDate = noRenewalDate;

      // 退费相关字段更新
      if (refundReason !== undefined) updateData.refundReason = refundReason;
      if (refundDate !== undefined) updateData.refundDate = refundDate;

      // 处理流失相关信息
      if (deleteReason !== undefined || expectedRecallDate !== undefined) {
        let currentDeleteReason = '';
        let currentRecallDate = '';

        // 解析现有的 notes，提取当前的删除原因和召回时间
        const notes = existing.notes || '';
        const reasonMatch = notes.match(/删除原因:([^,]*)/);
        const dateMatch = notes.match(/预计召回时间:([^,]*)/);

        if (reasonMatch) currentDeleteReason = reasonMatch[1];
        if (dateMatch) currentRecallDate = dateMatch[1];

        // 使用新值或保留现有值
        const finalDeleteReason = deleteReason !== undefined ? deleteReason : currentDeleteReason;
        const finalRecallDate = expectedRecallDate !== undefined ? expectedRecallDate : currentRecallDate;

        // 构建新的 notes 字段
        const notesParts: string[] = [];
        if (finalDeleteReason) {
          notesParts.push(`删除原因:${finalDeleteReason}`);
        }
        if (finalRecallDate) {
          notesParts.push(`预计召回时间:${finalRecallDate}`);
        }

        updateData.notes = notesParts.join(',');
      }

      const { data: updated, error } = await memfireAdmin
        .from('students')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新学员失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '学员更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: existing } = await memfireAdmin
        .from('students')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除该学员', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('students')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除学员失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '学员删除成功');
    } catch (error) {
      next(error);
    }
  },

  // 简化版本：导出功能（暂不支持复杂的出勤计算）
  exportStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const { data: students } = await memfireAdmin
        .from('students')
        .select('*')
        .eq('organizationId', targetOrgId)
        .order('createdAt', { ascending: false });

      // 创建 Excel
      const worksheet = XLSX.utils.json_to_sheet(students || []);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '学员数据');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=students_${Date.now()}.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  // 低出勤学员统计（优化版本）
  getLowAttendanceStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 并行获取所有需要的数据
      const [enrollmentsResult, schedulesResult, attendancesResult, teachersResult] = await Promise.all([
        // 获取所有活跃学员报名记录
        memfireAdmin
          .from('enrollments')
          .select(`
            id,
            studentId,
            classId,
            enrolledAt,
            student:students(id, name, phone),
            class:classes(id, name, code, teacherId)
          `)
          .eq('organizationId', targetOrgId)
          .eq('status', 'active'),
        // 获取所有已完成的排课
        memfireAdmin
          .from('schedules')
          .select('classId')
          .eq('organizationId', targetOrgId)
          .eq('status', 'completed'),
        // 获取所有出勤记录
        memfireAdmin
          .from('attendances')
          .select('studentId, status')
          .eq('organizationId', targetOrgId)
          .in('status', ['present', 'late', 'absent', 'leave']),
        // 获取所有教师（一次性获取，避免N+1查询）
        memfireAdmin
          .from('users')
          .select('id, name')
          .eq('organizationId', targetOrgId)
          .in('role', ['teacher', 'coach', 'manager']),
      ]);

      const enrollments = enrollmentsResult.data;
      const schedules = schedulesResult.data;
      const attendances = attendancesResult.data;
      const teachers = teachersResult.data || [];

      if (enrollmentsResult.error) {
        console.error('获取报名记录失败:', enrollmentsResult.error);
        return sendSuccess(res, []);
      }

      // 构建教师Map（避免N+1查询）
      const teacherMap = new Map(teachers.map((t: any) => [t.id, t]));

      // 计算每个班级的排课数
      const classScheduleCount = new Map<string, number>();
      for (const schedule of (schedules || [])) {
        const count = classScheduleCount.get(schedule.classId) || 0;
        classScheduleCount.set(schedule.classId, count + 1);
      }

      // 计算每个学员的出勤统计
      const studentAttendance = new Map<string, { total: number; present: number }>();
      for (const att of (attendances || [])) {
        const stats = studentAttendance.get(att.studentId) || { total: 0, present: 0 };
        stats.total++;
        if (att.status === 'present' || att.status === 'late') {
          stats.present++;
        }
        studentAttendance.set(att.studentId, stats);
      }

      // 计算每个学员的出勤率
      const lowAttendanceStudents: any[] = [];

      for (const enrollment of (enrollments || [])) {
        const student = enrollment.student as any;
        const classInfo = enrollment.class as any;

        if (!student || !classInfo) continue;

        const stats = studentAttendance.get(student.id) || { total: 0, present: 0 };
        const expectedSchedules = classScheduleCount.get(classInfo.id) || 0;

        // 只统计有足够排课数的学员（至少3次）
        if (expectedSchedules < 3) continue;

        const attendanceRate = stats.total > 0
          ? Math.round((stats.present / stats.total) * 100)
          : 100;

        // 只返回出勤率低于60%的学员
        if (attendanceRate < 60) {
          // 从Map中获取教师信息（O(1)复杂度）
          const teacher = classInfo.teacherId ? teacherMap.get(classInfo.teacherId) || null : null;

          lowAttendanceStudents.push({
            studentId: student.id,
            studentName: student.name,
            phone: student.phone,
            classId: classInfo.id,
            className: classInfo.name,
            classCode: classInfo.code,
            teacher,
            totalSchedules: expectedSchedules,
            attendedSchedules: stats.present,
            absentSchedules: stats.total - stats.present,
            attendanceRate,
          });
        }
      }

      // 按出勤率排序
      lowAttendanceStudents.sort((a, b) => a.attendanceRate - b.attendanceRate);

      sendSuccess(res, lowAttendanceStudents);
    } catch (error) {
      console.error('获取低出勤学员错误:', error);
      sendSuccess(res, []);
    }
  },

  // 续费学员统计（简化版本，暂不支持）
  getRenewalStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 简化版本：返回空数组
      sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },

  // 流失学员统计（简化版本，暂不支持）
  getLostStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 简化版本：返回空数组
      sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },

  // 连续请假学员（简化版本，暂不支持）
  getContinuousLeaveStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 简化版本：返回空数组
      sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },
};
