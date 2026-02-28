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

// 构建查询过滤器
const buildFilter = (filters: Record<string, any>) => {
  const params: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      params.push(`${key}=eq.${value}`);
    }
  }
  return params.join('&');
};

// 分页和排序
const buildPagination = (page: number, pageSize: number) => {
  return `&limit=${pageSize}&offset=${(page - 1) * pageSize}&order=createdAt.desc`;
};

export const userController = {
  getUsers: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const role = req.query.role as string;
      const organizationId = req.query.organizationId as string;
      const search = req.query.search as string;

      const currentUser = getCurrentUser(req);

      // 数据隔离：非admin只能查看自己机构的数据
      let targetOrganizationId = organizationId;
      if (currentUser?.role !== 'admin') {
        if (currentUser?.organizationId) {
          targetOrganizationId = currentUser.organizationId;
        } else {
          return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
        }
      }

      // 构建查询参数
      const filters: Record<string, any> = {};
      if (targetOrganizationId) filters.organizationId = targetOrganizationId;
      if (role) filters.role = role;

      const _filterStr = buildFilter(filters);
      const _paginationStr = buildPagination(page, pageSize);

      // 查询用户列表
      let query = memfireAdmin
        .from('users')
        .select('*')
        .order('createdAt', { ascending: false });

      // 应用机构过滤
      if (targetOrganizationId) {
        query = query.eq('organizationId', targetOrganizationId);
      }

      // 应用角色过滤
      if (role) {
        query = query.eq('role', role);
      }

      // 应用分页
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: users, error } = await query;

      if (error) {
        return next(new ApiError('获取用户列表失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数（先获取所有符合条件的用户）
      let countQuery = memfireAdmin.from('users').select('*', { count: 'exact', head: true });
      if (targetOrganizationId) countQuery = countQuery.eq('organizationId', targetOrganizationId);
      if (role) countQuery = countQuery.eq('role', role);

      const { count } = await countQuery;

      // 过滤搜索结果
      let filteredUsers = users || [];
      if (search) {
        const searchLower = search.toLowerCase();
        filteredUsers = filteredUsers.filter((u: any) =>
          (u.name && u.name.toLowerCase().includes(searchLower)) ||
          (u.email && u.email.toLowerCase().includes(searchLower))
        );
      }

      sendPaginated(res, filteredUsers, page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  getUserById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: user, error } = await memfireAdmin
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !user) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && user.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  },

  createUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, name, role, organizationId, campusId, phone } = req.body;
      const currentUser = getCurrentUser(req);

      // 检查邮箱是否已存在
      const { data: existingUser } = await memfireAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingUser) {
        return next(new ApiError('邮箱已被注册', 400, 'EMAIL_EXISTS'));
      }

      // 数据隔离：非admin只能在自己机构创建用户
      const targetOrgId = organizationId || currentUser?.organizationId;
      if (!targetOrgId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      if (currentUser?.role !== 'admin' && targetOrgId !== currentUser?.organizationId) {
        return next(new ApiError('无权在该机构创建用户', 403, 'FORBIDDEN'));
      }

      // 验证机构
      const { data: org } = await memfireAdmin
        .from('organizations')
        .select('id')
        .eq('id', targetOrgId)
        .maybeSingle();

      if (!org) {
        return next(new ApiError('机构不存在', 400, 'ORGANIZATION_NOT_FOUND'));
      }

      // 验证校区
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

      // 在 MemFire Auth 中创建用户
      const { data: authData, error: authError } = await memfireAdmin.auth.admin.createUser({
        email,
        password: password || '123456',
        email_confirm: true,
        user_metadata: { name },
      });

      if (authError) {
        if (authError.message.includes('already exists')) {
          return next(new ApiError('邮箱已被注册', 400, 'EMAIL_EXISTS'));
        }
        return next(new ApiError(authError.message, 400, 'AUTH_ERROR'));
      }

      // 在 users 表中创建记录
      const { data: newUser, error: userError } = await memfireAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          name,
          role,
          organizationId: targetOrgId,
          campusId,
          phone,
        })
        .select('id, email, name, role, organizationId, campusId, createdAt')
        .single();

      if (userError) {
        await memfireAdmin.auth.admin.deleteUser(authData.user.id);
        return next(new ApiError('创建用户失败', 500, 'USER_CREATE_ERROR'));
      }

      sendSuccess(res, newUser, '用户创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, phone, role, organizationId, campusId, isActive, password } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: existingUser, error } = await memfireAdmin
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !existingUser) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && existingUser.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该用户', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (role) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;

      // 只有admin可以修改机构
      if (organizationId && currentUser?.role === 'admin') {
        updateData.organizationId = organizationId;
        updateData.campusId = null;
      }

      if (campusId) {
        const { data: campus } = await memfireAdmin
          .from('campuses')
          .select('id, organizationId')
          .eq('id', campusId)
          .maybeSingle();

        if (!campus) {
          return next(new ApiError('校区不存在', 400, 'CAMPUS_NOT_FOUND'));
        }
        if (currentUser?.role !== 'admin' && campus.organizationId !== currentUser?.organizationId) {
          return next(new ApiError('无权分配该校区', 403, 'FORBIDDEN'));
        }
        updateData.campusId = campusId;
      }

      // 更新密码（如果提供）
      if (password) {
        await memfireAdmin.auth.admin.updateUserById(id, { password });
      }

      const { data: updatedUser, error: updateError } = await memfireAdmin
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select('id, email, name, phone, role, organizationId, campusId, isActive, updatedAt')
        .single();

      if (updateError) {
        return next(new ApiError('更新用户失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updatedUser, '用户更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      // 不能删除自己
      if (id === currentUser?.id) {
        return next(new ApiError('不能删除自己', 400, 'CANNOT_DELETE_SELF'));
      }

      const { data: user, error } = await memfireAdmin
        .from('users')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (error || !user) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      // 删除 Auth 用户和 users 表记录
      await memfireAdmin.auth.admin.deleteUser(id);
      await memfireAdmin.from('users').delete().eq('id', id);

      sendSuccess(res, null, '用户删除成功');
    } catch (error) {
      next(error);
    }
  },

  // 以下方法暂时保留使用 Prisma（因为涉及复杂的数据统计和关联查询）
  // TODO: 后续可以改用 MemFire REST API
  getTeachersStatistics: async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // 由于 Prisma 连接问题，暂时返回空数据
      sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },

  exportTeachersStatistics: async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // 暂时返回空 Excel
      const worksheet = XLSX.utils.json_to_sheet([]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '教练统计数据');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=teachers_statistics_${Date.now()}.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  getTeachersSalesData: async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // 暂时返回空数据
      sendSuccess(res, []);
    } catch (error) {
      next(error);
    }
  },

  exportTeachersSalesData: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // 暂时返回空 Excel
      const worksheet = XLSX.utils.json_to_sheet([]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '销售数据');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=销售数据_${Date.now()}.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  // 获取教师/教练员列表
  getTeachers: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 查询可以作为负责人的用户：教练、教师、销售、管理员
      // 注意：使用 name 作为主排序，如果没有 name 则使用 email
      const { data: teachers, error } = await memfireAdmin
        .from('users')
        .select('id, name, email, phone, role, organizationId, campusId')
        .eq('organizationId', targetOrgId)
        .in('role', ['coach', 'teacher', 'sales', 'manager', 'admin'])
        .eq('isActive', true)
        .order('name', { ascending: true, nullsFirst: false });

      // 为没有 name 的用户设置默认 name（使用 email 的用户名部分）
      const processedTeachers = (teachers || []).map((user: any) => ({
        ...user,
        name: user.name || user.email?.split('@')[0] || user.email || '未知用户',
      }));

      if (error) {
        return next(new ApiError('获取教师列表失败', 500, 'QUERY_ERROR'));
      }

      sendSuccess(res, processedTeachers);
    } catch (error) {
      next(error);
    }
  },

  // 获取教练统计数据 - 新端点（优化版）
  getCoachStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;
      const { startDate, endDate } = req.query;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 并行查询所有基础数据
      const [
        { data: coaches, error: coachError },
        { data: allStudents },
        { data: allClasses },
        { data: allEnrollments },
        { data: allSchedules },
        { data: allAttendances },
      ] = await Promise.all([
        // 教练列表
        memfireAdmin
          .from('users')
          .select('id, name, email, phone')
          .eq('organizationId', targetOrgId)
          .in('role', ['coach', 'teacher'])
          .eq('isActive', true),
        // 所有学员
        memfireAdmin
          .from('students')
          .select('id, status, renewalStatus, notes, updatedAt')
          .eq('organizationId', targetOrgId),
        // 所有班级
        memfireAdmin
          .from('classes')
          .select('id, teacherId')
          .eq('organizationId', targetOrgId)
          .eq('status', 'active'),
        // 所有报名记录
        memfireAdmin
          .from('enrollments')
          .select('studentId, status, createdAt, updatedAt, classId')
          .eq('organizationId', targetOrgId),
        // 所有排课
        memfireAdmin
          .from('schedules')
          .select('id, classId, status')
          .eq('organizationId', targetOrgId),
        // 所有出勤记录
        memfireAdmin
          .from('attendances')
          .select('id, classId, status')
          .eq('organizationId', targetOrgId)
          .in('status', ['present', 'late']),
      ]);

      if (coachError) {
        return next(new ApiError('获取教练列表失败', 500, 'QUERY_ERROR'));
      }

      // 获取成单记录
      let conversionsQuery = memfireAdmin
        .from('conversions')
        .select('id, studentId, salesId, courseType, price, totalLessons, conversionDate')
        .eq('organizationId', targetOrgId);

      if (startDate && endDate) {
        conversionsQuery = conversionsQuery
          .gte('conversionDate', startDate as string)
          .lte('conversionDate', endDate as string);
      }

      const { data: allConversions } = await conversionsQuery;

      // 计算平均课单价
      const lessonPrices = (allConversions || [])
        .filter((c: any) => c.price && c.totalLessons && c.totalLessons > 0)
        .map((c: any) => c.price / c.totalLessons);
      const avgLessonPrice = lessonPrices.length > 0
        ? lessonPrices.reduce((sum: number, p: number) => sum + p, 0) / lessonPrices.length
        : 0;

      // 按教练ID分组数据（内存中处理）
      const classesByCoach: Record<string, string[]> = {};
      (allClasses || []).forEach((cls: any) => {
        if (!classesByCoach[cls.teacherId]) {
          classesByCoach[cls.teacherId] = [];
        }
        classesByCoach[cls.teacherId].push(cls.id);
      });

      const enrollmentsByClass: Record<string, any[]> = {};
      (allEnrollments || []).forEach((e: any) => {
        if (!enrollmentsByClass[e.classId]) {
          enrollmentsByClass[e.classId] = [];
        }
        enrollmentsByClass[e.classId].push(e);
      });

      const schedulesByClass: Record<string, any[]> = {};
      (allSchedules || []).forEach((s: any) => {
        if (!schedulesByClass[s.classId]) {
          schedulesByClass[s.classId] = [];
        }
        schedulesByClass[s.classId].push(s);
      });

      const attendancesByClass: Record<string, any[]> = {};
      (allAttendances || []).forEach((a: any) => {
        if (!attendancesByClass[a.classId]) {
          attendancesByClass[a.classId] = [];
        }
        attendancesByClass[a.classId].push(a);
      });

      // 获取每个教练的统计数据（内存中计算，无数据库查询）
      const statistics = (coaches || []).map((coach: any) => {
        const classIds = classesByCoach[coach.id] || [];

        // 获取该教练班级的学员
        const coachStudentIds = new Set<string>();
        classIds.forEach(classId => {
          (enrollmentsByClass[classId] || []).forEach((e: any) => {
            if (e.status === 'active') {
              coachStudentIds.add(e.studentId);
            }
          });
        });
        const studentCount = coachStudentIds.size;

        // 计算出勤率
        let attendanceRate = 0;
        let consumptionAmount = 0;
        if (classIds.length > 0) {
          // 应出勤人次 = 完成的排课数 × 学员数
          let completedScheduleCount = 0;
          classIds.forEach(classId => {
            const schedules = schedulesByClass[classId] || [];
            completedScheduleCount += schedules.filter((s: any) => s.status === 'completed').length;
          });
          const expectedAttendance = completedScheduleCount * studentCount;

          // 实际出勤人次
          let actualAttendance = 0;
          classIds.forEach(classId => {
            actualAttendance += (attendancesByClass[classId] || []).length;
          });

          attendanceRate = expectedAttendance > 0
            ? Math.round((actualAttendance / expectedAttendance) * 100)
            : 0;

          // 课消金额
          consumptionAmount = Math.round(actualAttendance * avgLessonPrice * 100) / 100;
        }

        // 基本盘人数 = 活跃学员数
        const activeStudentIds = Array.from(coachStudentIds).filter(studentId => {
          const student = (allStudents || []).find(s => s.id === studentId);
          return student && student.status === 'active';
        });
        const baseCount = activeStudentIds.length;

        // 计算基本盘变化
        let baseCountChange = 0;
        let baseCountAdded = 0;
        let baseCountRecalled = 0;
        let baseCountNonRenewal = 0;
        let baseCountLost = 0;

        if (startDate && endDate && classIds.length > 0) {
          // 获取该教练班级的所有报名记录
          const coachEnrollments: any[] = [];
          classIds.forEach(classId => {
            coachEnrollments.push(...(enrollmentsByClass[classId] || []));
          });

          // 新增学员
          const newStudentIds = new Set(
            coachEnrollments
              .filter((e: any) => e.createdAt && e.createdAt >= startDate && e.createdAt <= endDate)
              .map((e: any) => e.studentId)
          );
          baseCountAdded = newStudentIds.size;

          // 流失学员
          const lostStudentIds = new Set<string>();
          coachEnrollments.forEach((e: any) => {
            const enrollmentIsLost = ['lost', 'inactive', 'cancelled', 'withdrawn', 'completed'].includes(e.status);
            const student = (allStudents || []).find(s => s.id === e.studentId);
            const studentIsLost = student?.status === 'lost';

            if (enrollmentIsLost || studentIsLost) {
              const updateTime = e.updatedAt || student?.updatedAt;
              const createdAtInRange = e.createdAt && e.createdAt >= startDate && e.createdAt <= endDate;
              const updatedAtInRange = updateTime && updateTime >= startDate && updateTime <= endDate;
              if (createdAtInRange || updatedAtInRange) {
                lostStudentIds.add(e.studentId);
              }
            }
          });
          baseCountLost = lostStudentIds.size;

          // 召回学员
          baseCountRecalled = (allStudents || []).filter((s: any) => {
            if (s.status !== 'active') return false;
            if (!s.notes || !s.notes.includes('删除原因')) return false;
            const updateTime = s.updatedAt;
            return updateTime && updateTime >= startDate && updateTime <= endDate;
          }).length;

          baseCountChange = baseCountAdded + baseCountRecalled - baseCountNonRenewal - baseCountLost;
        }

        // 个人新招数
        const coachConversions = (allConversions || []).filter(c => c.salesId === coach.id);
        const newRecruitConversions = coachConversions.filter((c: any) => {
          const courseType = c.courseType || '';
          return courseType !== '续费' && courseType !== 'renewal' && courseType !== '续报';
        });
        const newRecruits = new Set(newRecruitConversions.map((c: any) => c.studentId)).size;

        // 续费率
        const renewals = coachConversions.filter((c: any) => {
          const courseType = c.courseType || '';
          return courseType === '续费' || courseType === 'renewal' || courseType === '续报';
        });
        const renewalStudents = new Set(renewals.map((r: any) => r.studentId));
        const renewalRate = baseCount > 0
          ? Math.round((renewalStudents.size / baseCount) * 100)
          : 0;

        // 成单金额
        const totalOrderAmount = coachConversions.reduce((sum: number, c: any) => sum + (c.price || 0), 0);

        return {
          teacherId: coach.id,
          teacherName: coach.name,
          classCount: classIds.length,
          studentCount,
          attendanceRate,
          baseCount,
          baseCountChange,
          newRecruits: baseCountAdded,
          recalled: baseCountRecalled,
          nonRenewals: baseCountNonRenewal,
          deletedRoster: baseCountLost,
          personalNewRecruits: newRecruits,
          renewalRate,
          totalOrderAmount,
          consumptionAmount,
        };
      });

      sendSuccess(res, statistics);
    } catch (error) {
      next(error);
    }
  },

  // 获取销售统计数据 - 新端点（优化版）
  getSalesStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;
      const { startDate, endDate } = req.query;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 并行查询所有基础数据
      const [
        { data: salesStaff, error: salesError },
        { data: allLeads },
        { data: allExperienceLessons },
        { data: allConversions },
      ] = await Promise.all([
        // 销售人员列表
        memfireAdmin
          .from('users')
          .select('id, name, email, phone, role')
          .eq('organizationId', targetOrgId)
          .in('role', ['sales', 'coach', 'teacher', 'manager', 'admin'])
          .eq('isActive', true),
        // 所有线索
        memfireAdmin
          .from('leads')
          .select('id, assigneeId, createdAt')
          .eq('organizationId', targetOrgId),
        // 所有体验课
        memfireAdmin
          .from('experience_lessons')
          .select('id, assigneeId, status, createdAt')
          .eq('organizationId', targetOrgId),
        // 所有成单
        memfireAdmin
          .from('conversions')
          .select('id, salesId, courseType, price, conversionDate')
          .eq('organizationId', targetOrgId),
      ]);

      if (salesError) {
        return next(new ApiError('获取销售人员列表失败', 500, 'QUERY_ERROR'));
      }

      // 判断是否为续费
      const isRenewal = (courseType: string) => {
        if (!courseType) return false;
        const ct = courseType.toLowerCase();
        return ct === '续费' || ct === 'renewal' || ct === '续报';
      };

      // 内存中计算每个销售人员的统计数据
      const statistics = (salesStaff || []).map((sales: any) => {
        const displayName = sales.name || sales.email?.split('@')[0] || sales.email || '未知用户';

        // 线索数
        const leadsCount = (allLeads || []).filter((l: any) => {
          if (l.assigneeId !== sales.id) return false;
          if (startDate && endDate) {
            return l.createdAt >= startDate && l.createdAt <= endDate;
          }
          return true;
        }).length;

        // 邀约数
        const invitationCount = (allExperienceLessons || []).filter((e: any) => {
          if (e.assigneeId !== sales.id) return false;
          if (startDate && endDate) {
            return e.createdAt >= startDate && e.createdAt <= endDate;
          }
          return true;
        }).length;

        // 到场数
        const attendanceCount = (allExperienceLessons || []).filter((e: any) => {
          if (e.assigneeId !== sales.id || e.status !== 'completed') return false;
          if (startDate && endDate) {
            return e.createdAt >= startDate && e.createdAt <= endDate;
          }
          return true;
        }).length;

        // 成单数据
        const salesConversions = (allConversions || []).filter((c: any) => {
          if (c.salesId !== sales.id) return false;
          if (startDate && endDate) {
            return c.conversionDate >= startDate && c.conversionDate <= endDate;
          }
          return true;
        });

        const newConversions = salesConversions.filter((c: any) => !isRenewal(c.courseType));
        const renewalConversions = salesConversions.filter((c: any) => isRenewal(c.courseType));

        return {
          teacherId: sales.id,
          teacherName: displayName,
          addedCount: leadsCount,
          invitationCount,
          attendanceCount,
          orderCount: salesConversions.length,
          orderAmount: salesConversions.reduce((sum: number, c: any) => sum + (c.price || 0), 0),
          newOrderCount: newConversions.length,
          newOrderAmount: newConversions.reduce((sum: number, c: any) => sum + (c.price || 0), 0),
          renewalOrderCount: renewalConversions.length,
          renewalOrderAmount: renewalConversions.reduce((sum: number, c: any) => sum + (c.price || 0), 0),
        };
      });

      sendSuccess(res, statistics);
    } catch (error) {
      next(error);
    }
  },
};
