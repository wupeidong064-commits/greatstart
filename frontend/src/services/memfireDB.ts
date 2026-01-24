import { memfire } from '../lib/memfire';
import dayjs from 'dayjs';

if (!memfire) {
  // eslint-disable-next-line no-console
  console.warn('[MemFireDB] memfire 客户端未初始化，数据库功能不可用');
}

// 学员管理
export const studentsDB = {
  /**
   * 获取学员列表（分页）
   */
  async list(params?: {
    page?: number;
    pageSize?: number;
    lowAttendanceOnly?: boolean;
    search?: string;
    keyword?: string;  // 支持 keyword 参数作为 search 的别名
    unscheduledOnly?: boolean;  // 仅显示未排课学员
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { page = 1, pageSize = 10, lowAttendanceOnly = false, search = '', keyword = '', unscheduledOnly = false } = params || {};
    const searchTerm = keyword || search;  // 优先使用 keyword
    
    let query = memfire
      .from('students')
      .select(`
        *,
        enrollments:enrollments(
          id,
          status,
          class:classes(
            id,
            name,
            code,
            teacher:users(id, name)
          )
        )
      `, { count: 'exact' })
      .order('createdAt', { ascending: false });

    // 搜索过滤
    if (searchTerm) {
      query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,parentPhone.ilike.%${searchTerm}%`);
    }

    // 低出勤筛选 - 需要与出勤表关联，这里暂时跳过，后续实现
    // TODO: 实现低出勤筛选逻辑

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    let enrichedData = data || [];
    
    // 如果筛选未排课学员，过滤掉已有 active 状态报名记录的学员
    if (unscheduledOnly) {
      enrichedData = enrichedData.filter((student: any) => {
        const hasActiveEnrollment = student.enrollments?.some((enrollment: any) => enrollment.status === 'active');
        return !hasActiveEnrollment;
      });
    }

    const studentIds = enrichedData.map((student: any) => student.id).filter(Boolean);
    if (studentIds.length > 0) {
      try {
        const { data: conversionData } = await memfire
          .from('conversions')
          .select('studentId, totalLessons')
          .in('studentId', studentIds);

        const lessonsMap: Record<string, number> = {};
        (conversionData || []).forEach((item: any) => {
          if (!item.studentId) return;
          lessonsMap[item.studentId] = (lessonsMap[item.studentId] || 0) + (item.totalLessons || 0);
        });

        enrichedData = enrichedData.map((student: any) => ({
          ...student,
          totalLessonsPurchased: lessonsMap[student.id] || 0,
        }));
      } catch (error: any) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('conversions 表不存在，无法统计总课时');
        } else {
          throw error;
        }
      }
    }

    return {
      data: enrichedData,
      pagination: {
        total: unscheduledOnly ? enrichedData.length : (count || 0),
        current: page,
        pageSize,
      },
    };
  },

  /**
   * 获取所有学员（不分页，用于下拉选择等场景）
   */
  async listAll() {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('students')
      .select('id, name, phone, parentPhone, parentName, remainingLessons, status, age, gender')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * 根据 ID 获取学员详情
   */
  async getById(id: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('students')
      .select(`
        *,
        enrollments:enrollments(
          id,
          classId,
          status,
          class:classes(
            id,
            name,
            code,
            organizationId
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 创建学员
   */
  async create(student: any) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 从当前用户获取 organizationId（假设已存储在状态中）
    // 这里暂时需要从前端传入 organizationId
    const { data, error } = await memfire
      .from('students')
      .insert(student)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 更新学员
   */
  async update(id: string, updates: any) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 自动更新 updatedAt 字段
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    console.log('🔄 更新学员:', { id, updates: updateData });

    const { data, error } = await memfire
      .from('students')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ 更新学员失败:', error);
      throw error;
    }
    
    console.log('✅ 学员更新成功');
    return data;
  },

  /**
   * 删除学员
   */
  async delete(id: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { error } = await memfire
      .from('students')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * 获取需要续费的学员列表（剩余课时少于指定值）
   */
  async listForRenewal(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    teacherId?: string;
    maxRemainingLessons?: number;
    excludeNoRenewal?: boolean;
    renewalStartDate?: string;
    renewalEndDate?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { 
      page = 1, 
      pageSize = 10, 
      search = '', 
      teacherId,
      maxRemainingLessons = 10,
      excludeNoRenewal = true,
    } = params || {};

    let query = memfire
      .from('students')
      .select(`
        *,
        enrollments:enrollments(
          id,
          status,
          classId,
          class:classes(
            id,
            name,
            code,
            teacher:users(id, name)
          )
        )
      `, { count: 'exact' })
      .lt('remainingLessons', maxRemainingLessons)
      .order('remainingLessons', { ascending: true });

    // 排除已标记不续费的学员
    if (excludeNoRenewal) {
      query = query.or('renewalStatus.is.null,renewalStatus.neq.no_renewal');
    }

    // 搜索
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,parentPhone.ilike.%${search}%`);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('获取续费学员列表失败:', error);
      throw error;
    }

    // 如果需要按教练筛选，在前端过滤
    let filteredData = data || [];
    if (teacherId) {
      filteredData = filteredData.filter((student: any) => {
        const activeEnrollment = student.enrollments?.find((e: any) => e.status === 'active');
        return activeEnrollment?.class?.teacher?.id === teacherId;
      });
    }

    // 查询每个学员的续费次数、总消课数和上次续费/报名信息
    const studentIds = filteredData.map((s: any) => s.id);
    if (studentIds.length > 0) {
      // 查询所有转化记录（包括首次报名和续费）
      const { data: conversionData } = await memfire
        .from('conversions')
        .select('studentId, price, totalLessons, conversionDate, courseType')
        .in('studentId', studentIds)
        .order('conversionDate', { ascending: false });

      // 统计每个学员的续费次数和最近一次的价格/课时信息
      const renewalInfoMap: Record<string, { count: number; lastPrice?: number; lastLessons?: number; lastDate?: string }> = {};
      (conversionData || []).forEach((item: any) => {
        if (!renewalInfoMap[item.studentId]) {
          // 记录最近一次的价格和课时（不论是续费还是首次报名）
          renewalInfoMap[item.studentId] = {
            count: item.courseType === '续费' ? 1 : 0,
            lastPrice: item.price,
            lastLessons: item.totalLessons,
            lastDate: item.conversionDate,
          };
        } else {
          // 只统计续费次数
          if (item.courseType === '续费') {
            renewalInfoMap[item.studentId].count += 1;
          }
        }
      });

      // 查询所有成单记录（包括新报名和续费），统计总购买课时数
      const { data: allConversions } = await memfire
        .from('conversions')
        .select('studentId, totalLessons')
        .in('studentId', studentIds);

      // 统计每个学员的总购买课时数
      const totalLessonsPurchasedMap: Record<string, number> = {};
      (allConversions || []).forEach((item: any) => {
        if (item.studentId && item.totalLessons) {
          totalLessonsPurchasedMap[item.studentId] = (totalLessonsPurchasedMap[item.studentId] || 0) + item.totalLessons;
        }
      });

      // 将续费次数、总购买课时数和上次续费信息添加到学员数据中
      filteredData = filteredData.map((student: any) => {
        const renewalInfo = renewalInfoMap[student.id];
        return {
          ...student,
          renewalCount: renewalInfo?.count || 0,
          lastRenewalPrice: renewalInfo?.lastPrice,
          lastRenewalLessons: renewalInfo?.lastLessons,
          lastRenewalDate: renewalInfo?.lastDate,
          totalLessonsPurchased: totalLessonsPurchasedMap[student.id] || 0,
        };
      });
    }

    // 时间筛选：只有当用户选择了时间范围时才应用
    const startDate = params?.renewalStartDate ? dayjs(params.renewalStartDate) : null;
    const endDate = params?.renewalEndDate ? dayjs(params.renewalEndDate) : null;
    if (startDate || endDate) {
      filteredData = filteredData.filter((student: any) => {
        // 如果没有续费记录，保留学员（首次报名的学员）
        if (!student.lastRenewalDate) return true;
        const lastDate = dayjs(student.lastRenewalDate);
        if (startDate && lastDate.isBefore(startDate, 'day')) return false;
        if (endDate && lastDate.isAfter(endDate, 'day')) return false;
        return true;
      });
    }

    return {
      data: filteredData,
      pagination: {
        total: teacherId ? filteredData.length : (count || 0),
        current: page,
        pageSize,
      },
    };
  },

  /**
   * 获取不续费学员列表（包括已毕业学员）
   */
  async listNoRenewal(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { page = 1, pageSize = 10, search = '' } = params || {};

    let query = memfire
      .from('students')
      .select(`
        *,
        enrollments:enrollments(
          id,
          status,
          class:classes(
            id,
            name,
            teacher:users(id, name)
          )
        )
      `, { count: 'exact' })
      .or(`renewalStatus.eq.no_renewal,status.eq.graduated`)  // 包括不续费和已毕业
      .order('updatedAt', { ascending: false });

    // 搜索
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,parentPhone.ilike.%${search}%`);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('获取不续费学员列表失败:', error);
      // 如果字段不存在，返回空列表
      if (error.message?.includes('does not exist')) {
        return {
          data: [],
          pagination: { total: 0, current: page, pageSize },
        };
      }
      throw error;
    }

    const processed = (data || []).map((student: any) => {
      const activeEnrollment = student.enrollments?.find((e: any) => e.status === 'active');
      const classInfo = activeEnrollment?.class;
      return {
        ...student,
        teacherName: classInfo?.teacher?.name || '-',
        teacherId: classInfo?.teacher?.id || null,
      };
    });

    return {
      data: processed,
      pagination: {
        total: count || 0,
        current: page,
        pageSize,
      },
    };
  },

  /**
   * 转班操作
   */
  async transfer(studentId: string, fromClassId: string, toClassId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 先获取学员信息，获取 organizationId
    const { data: student, error: studentError } = await memfire
      .from('students')
      .select('organizationId')
      .eq('id', studentId)
      .single();

    if (studentError) throw studentError;
    if (!student?.organizationId) {
      throw new Error('学员缺少机构信息，无法转班');
    }

    // 更新 enrollments 表
    // 1. 将原班级的 enrollment 状态改为 transferred
    // 2. 创建新班级的 enrollment
    
    const { error: updateError } = await memfire
      .from('enrollments')
      .update({ status: 'transferred' })
      .eq('studentId', studentId)
      .eq('classId', fromClassId)
      .eq('status', 'active');

    if (updateError) throw updateError;

    const { data, error: insertError } = await memfire
      .from('enrollments')
      .insert({
        organizationId: student.organizationId,
        studentId,
        classId: toClassId,
        status: 'active',
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return data;
  },
};

// 班级管理
export const classesDB = {
  /**
   * 获取班级列表（完整信息）
   */
  async list() {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('classes')
      .select(`
        *,
        teacher:users(id, name),
        enrollments:enrollments(id, status)
      `)
      .order('createdAt', { ascending: false });

    if (error) throw error;
    
    // 计算每个班级的活跃学员数
    const classesWithCount = (data || []).map((cls: any) => {
      const activeEnrollments = (cls.enrollments || []).filter(
        (e: any) => e.status === 'active'
      );
      return {
        ...cls,
        _count: {
          enrollments: activeEnrollments.length,
        },
      };
    });
    
    return classesWithCount;
  },

  /**
   * 获取班级列表（包含学员数统计）
   * 用于优先安排体验课功能
   */
  async listWithStudentCount() {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('classes')
      .select(`
        *,
        teacher:users(id, name),
        enrollments:enrollments(id, studentId, status)
      `)
      .eq('status', 'active')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    // 计算每个班级的学员数、空位数、满班率
    const classesWithStats = (data || []).map((cls: any) => {
      const activeEnrollments = (cls.enrollments || []).filter(
        (e: any) => e.status === 'active'
      );
      const currentStudents = activeEnrollments.length;
      const capacity = cls.capacity || 20;
      const availableSlots = Math.max(0, capacity - currentStudents);
      const fillRate = capacity > 0 ? Math.round((currentStudents / capacity) * 100) : 0;

      return {
        ...cls,
        currentStudents,
        availableSlots,
        fillRate,
        _count: {
          enrollments: currentStudents, // 添加 _count 字段以匹配表格显示逻辑
        },
        enrollments: undefined, // 移除 enrollments 字段，减少数据量
      };
    });

    return classesWithStats;
  },

  /**
   * 获取优先安排体验课的班级
   * 按空位数降序排序（空位多的排在前面）
   */
  async listForExperiencePriority() {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const classesWithStats = await this.listWithStudentCount();

    // 按空位数降序排序（空位多的优先）
    // 如果空位数相同，按满班率升序排序（满班率低的优先）
    const sorted = classesWithStats.sort((a: any, b: any) => {
      if (b.availableSlots !== a.availableSlots) {
        return b.availableSlots - a.availableSlots;
      }
      return a.fillRate - b.fillRate;
    });

    return sorted;
  },

  /**
   * 获取所有班级（用于下拉选择，包含教练信息）
   */
  async listAll() {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('classes')
      .select(`
        id, 
        name, 
        code, 
        status,
        teacherId,
        teacher:users(id, name)
      `)
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) throw error;
    
    // 处理 teacher 数据（Supabase 返回的是数组，需要取第一个）
    return (data || []).map((cls: any) => ({
      ...cls,
      teacher: Array.isArray(cls.teacher) ? cls.teacher[0] : cls.teacher,
    }));
  },

  /**
   * 创建班级
   */
  async create(classData: any) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('classes')
      .insert(classData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 更新班级
   */
  async update(id: string, updates: any) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('classes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 删除班级
   */
  async delete(id: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { error } = await memfire
      .from('classes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * 获取班级学员名单
   */
  async getClassStudents(classId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('enrollments')
      .select(`
        id,
        createdAt,
        status,
        student:students(
          id,
          name,
          gender,
          phone,
          parentName,
          parentPhone,
          status,
          remainingLessons
        )
      `)
      .eq('classId', classId)
      .eq('status', 'active')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    // 转换数据格式
    return (data || []).map((enrollment: any) => ({
      id: enrollment.student.id,
      name: enrollment.student.name,
      gender: enrollment.student.gender,
      phone: enrollment.student.phone,
      parentName: enrollment.student.parentName,
      parentPhone: enrollment.student.parentPhone,
      status: enrollment.student.status,
      remainingLessons: enrollment.student.remainingLessons || 0,
      enrollmentDate: enrollment.createdAt,
    }));
  },
};

// 报名管理
export const enrollmentsDB = {
  /**
   * 获取学员的报名信息（当前所在班级）
   */
  async getByStudentId(studentId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('enrollments')
      .select(`
        *,
        class:classes(id, name, code)
      `)
      .eq('studentId', studentId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  },

  /**
   * 创建报名
   */
  async create(enrollment: any) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 如果没有传入 organizationId，从学员记录中获取
    let enrollmentData = { ...enrollment };
    if (!enrollmentData.organizationId && enrollment.studentId) {
      const { data: student } = await memfire
        .from('students')
        .select('organizationId')
        .eq('id', enrollment.studentId)
        .single();
      
      if (student?.organizationId) {
        enrollmentData.organizationId = student.organizationId;
      }
    }

    const { data, error } = await memfire
      .from('enrollments')
      .insert(enrollmentData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

// 排课管理
export const schedulesDB = {
  /**
   * 获取排课列表
   */
  async list(params?: {
    classId?: string;
    startDate?: string;
    endDate?: string;
    includeAll?: boolean; // 是否包含所有状态（包括已取消）
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    let query = memfire
      .from('schedules')
      .select(`
        *,
        class:classes(
          id, 
          name, 
          code,
          enrollments:enrollments(id, status)
        ),
        teacher:users(id, name)
      `)
      .order('startTime', { ascending: true });

    if (params?.classId) {
      query = query.eq('classId', params.classId);
    }
    if (params?.startDate) {
      query = query.gte('startTime', params.startDate);
    }
    if (params?.endDate) {
      query = query.lte('startTime', params.endDate);
    }
    
    // 默认只显示未取消的排课
    if (!params?.includeAll) {
      query = query.neq('status', 'cancelled');
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * 创建重复排课
   */
  async createRecurring(data: {
    classId: string;
    organizationId: string;
    recurrenceType: 'weekly' | 'daily';
    startDate: string;
    endDate: string;
    weekDays?: number[];
    startTime: string;
    endTime: string;
    location?: string;
    teacherId?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 验证参数
    if (data.recurrenceType === 'weekly' && (!data.weekDays || data.weekDays.length === 0)) {
      throw new Error('每周重复模式必须选择至少一个上课日期');
    }

    const schedules: any[] = [];
    const start = dayjs(data.startDate);
    const end = dayjs(data.endDate);
    
    let current = start;
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      let shouldCreate = false;

      if (data.recurrenceType === 'daily') {
        shouldCreate = true;
      } else if (data.recurrenceType === 'weekly' && data.weekDays && data.weekDays.length > 0) {
        const dayOfWeek = current.day();
        shouldCreate = data.weekDays.includes(dayOfWeek);
      }

      if (shouldCreate) {
        // 确保时间格式正确（HH:mm）
        const startTime = data.startTime.length === 5 ? data.startTime : data.startTime.padStart(5, '0');
        const endTime = data.endTime.length === 5 ? data.endTime : data.endTime.padStart(5, '0');
        
        // 使用本地时间并明确指定时区偏移，避免UTC转换问题
        const dateStr = current.format('YYYY-MM-DD');
        const startDateTime = `${dateStr}T${startTime}:00+08:00`; // 中国时区
        const endDateTime = `${dateStr}T${endTime}:00+08:00`;
        
        schedules.push({
          organizationId: data.organizationId,
          classId: data.classId,
          teacherId: data.teacherId || null,
          startTime: startDateTime,
          endTime: endDateTime,
          classroom: data.location || null,
          isRecurring: true,
          recurrenceRule: data.recurrenceType === 'weekly' 
            ? `weekly:${data.weekDays?.join(',')}` 
            : 'daily',
          status: 'scheduled',
        });
      }

      current = current.add(1, 'day');
    }

    if (schedules.length === 0) {
      throw new Error('没有生成任何排课记录，请检查日期范围和上课日期设置');
    }

    const { data: result, error } = await memfire
      .from('schedules')
      .insert(schedules)
      .select();

    if (error) throw error;
    return result;
  },

  /**
   * 取消排课（将状态改为 cancelled）
   */
  async cancel(scheduleId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('schedules')
      .update({ status: 'cancelled' })
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 批量取消该班级以后所有排课
   */
  async cancelAllFuture(classId: string, fromDate: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('schedules')
      .update({ status: 'cancelled' })
      .eq('classId', classId)
      .eq('status', 'scheduled')
      .gte('startTime', fromDate);

    if (error) throw error;
    return data;
  },

  /**
   * 删除排课
   */
  async delete(scheduleId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { error } = await memfire
      .from('schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) throw error;
    return true;
  },

  /**
   * 根据班级和日期查找排课
   */
  async findByClassAndDate(classId: string, date: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;

    const { data, error } = await memfire
      .from('schedules')
      .select('*')
      .eq('classId', classId)
      .gte('startTime', startOfDay)
      .lte('startTime', endOfDay)
      .neq('status', 'cancelled')
      .order('startTime', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * 创建单个排课
   */
  async create(data: {
    organizationId: string;
    classId: string;
    startTime: string;
    endTime: string;
    status: string;
    isRecurring: boolean;
    classroom?: string;
    teacherId?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data: result, error } = await memfire
      .from('schedules')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  /**
   * 取消班级的所有待上课排课（只取消未来的排课）
   */
  async cancelByClass(classId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const now = new Date().toISOString();
    
    const { data, error } = await memfire
      .from('schedules')
      .update({ status: 'cancelled' })
      .eq('classId', classId)
      .eq('status', 'scheduled')
      .gte('startTime', now)
      .select();

    if (error) throw error;
    return data;
  },
};

// 考勤管理
export const attendancesDB = {
  /**
   * 创建考勤记录
   */
  async create(data: {
    organizationId: string;
    classId: string;
    scheduleId: string;
    studentId: string;
    status: string;
    notes?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data: result, error } = await memfire
      .from('attendances')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  /**
   * 获取考勤记录
   */
  async list(params?: {
    classId?: string;
    scheduleId?: string;
    studentId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    let query = memfire
      .from('attendances')
      .select(`
        *,
        student:students(id, name),
        schedule:schedules(id, startTime, endTime)
      `)
      .order('createdAt', { ascending: false });

    if (params?.classId) {
      query = query.eq('classId', params.classId);
    }
    if (params?.scheduleId) {
      query = query.eq('scheduleId', params.scheduleId);
    }
    if (params?.studentId) {
      query = query.eq('studentId', params.studentId);
    }

    const { data, error} = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * 更新考勤记录
   */
  async update(id: string, updates: { status?: string; notes?: string }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('attendances')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 按日期范围查询考勤记录（用于划课记录显示）
   */
  async getByDateRange(startDate: string, endDate: string, organizationId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    try {
      console.log('🔍 查询考勤记录:', { startDate, endDate, organizationId });

      // 先通过排课时间筛选
      const { data: schedules, error: schedError } = await memfire
        .from('schedules')
        .select('id, startTime, endTime, classId')
        .gte('startTime', startDate + 'T00:00:00')
        .lte('startTime', endDate + 'T23:59:59')
        .neq('status', 'cancelled');

      if (schedError) {
        console.error('❌ 查询排课失败:', schedError);
        throw schedError;
      }

      console.log('📅 查询到排课数:', schedules?.length || 0);

      if (!schedules || schedules.length === 0) {
        console.log('⚠️ 没有排课记录，返回空数组');
        return [];
      }

      const scheduleIds = schedules.map((s: any) => s.id);

      // 查询这些排课的考勤记录
      const { data, error } = await memfire
        .from('attendances')
        .select(`
          id,
          studentId,
          scheduleId,
          classId,
          status,
          createdAt,
          student:students(id, name),
          schedule:schedules(id, startTime, endTime),
          class:classes(id, name, code)
        `)
        .in('scheduleId', scheduleIds)
        .order('createdAt', { ascending: false });

      if (error) {
        console.error('❌ 查询考勤记录失败:', error);
        throw error;
      }

      console.log('✅ 查询到考勤记录数:', data?.length || 0);

      // 格式化数据
      return (data || []).map((att: any) => ({
        id: att.id,
        studentId: att.studentId,
        studentName: att.student?.name || '未知学员',
        scheduleId: att.scheduleId,
        classId: att.classId,
        className: att.class?.name || '未知班级',
        status: att.status,
        attendanceDate: att.schedule?.startTime,
        scheduleTime: att.schedule?.startTime,
        createdAt: att.createdAt,
        operatorName: '系统管理员',
      }));
    } catch (error) {
      console.error('❌ getByDateRange 错误:', error);
      throw error;
    }
  },

  /**
   * 获取低出勤班级列表
   * 筛选条件：连续两周出勤率低于60%
   */
  async getLowAttendanceClasses(threshold: number = 60) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 计算两周前的日期
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. 获取所有活跃班级及其学员数
    const { data: classes, error: classesError } = await memfire
      .from('classes')
      .select(`
        id,
        name,
        code,
        courseType,
        level,
        capacity,
        status,
        teacher:users(id, name),
        enrollments:enrollments(id, studentId, status)
      `)
      .eq('status', 'active');

    if (classesError) throw classesError;

    // 2. 获取过去两周的排课记录（不限制状态，只要不是取消的）
    const { data: schedules, error: schedulesError } = await memfire
      .from('schedules')
      .select('id, classId, startTime, status')
      .gte('startTime', twoWeeksAgo.toISOString())
      .lte('startTime', now.toISOString())
      .neq('status', 'cancelled');

    if (schedulesError) throw schedulesError;

    // 3. 获取对应的考勤记录
    const scheduleIds = (schedules || []).map((s: any) => s.id);
    let attendances: any[] = [];
    
    if (scheduleIds.length > 0) {
      const { data: attendanceData, error: attendancesError } = await memfire
        .from('attendances')
        .select('id, classId, scheduleId, studentId, status')
        .in('scheduleId', scheduleIds);

      if (attendancesError) throw attendancesError;
      attendances = attendanceData || [];
    }

    // 4. 计算每个班级的出勤率
    const result: any[] = [];

    for (const cls of classes || []) {
      // 计算班级活跃学员数
      const activeEnrollments = (cls.enrollments || []).filter(
        (e: any) => e.status === 'active'
      );
      const totalStudents = activeEnrollments.length;

      if (totalStudents === 0) continue; // 跳过没有学员的班级

      // 获取该班级的排课
      const classSchedules = (schedules || []).filter(
        (s: any) => s.classId === cls.id
      );

      if (classSchedules.length === 0) continue; // 跳过没有排课的班级

      // 分周统计
      const week1Schedules = classSchedules.filter((s: any) => {
        const time = new Date(s.startTime);
        return time >= twoWeeksAgo && time < oneWeekAgo;
      });
      const week2Schedules = classSchedules.filter((s: any) => {
        const time = new Date(s.startTime);
        return time >= oneWeekAgo && time <= now;
      });

      // 计算第一周出勤率
      const week1ScheduleIds = week1Schedules.map((s: any) => s.id);
      const week1Attendances = attendances.filter(
        (a: any) => week1ScheduleIds.includes(a.scheduleId)
      );
      const week1Present = week1Attendances.filter(
        (a: any) => a.status === 'present'
      ).length;
      // 应该按排课数量计算，如果有排课但没考勤记录，算作0%出勤
      const week1ExpectedTotal = week1Schedules.length * totalStudents;
      const week1Rate = week1ExpectedTotal > 0 ? (week1Present / week1ExpectedTotal) * 100 : null;

      // 计算第二周出勤率
      const week2ScheduleIds = week2Schedules.map((s: any) => s.id);
      const week2Attendances = attendances.filter(
        (a: any) => week2ScheduleIds.includes(a.scheduleId)
      );
      const week2Present = week2Attendances.filter(
        (a: any) => a.status === 'present'
      ).length;
      // 应该按排课数量计算，如果有排课但没考勤记录，算作0%出勤
      const week2ExpectedTotal = week2Schedules.length * totalStudents;
      const week2Rate = week2ExpectedTotal > 0 ? (week2Present / week2ExpectedTotal) * 100 : null;

      // 计算整体平均出勤率（基于排课数量，而不是考勤记录数量）
        const totalPresent = week1Present + week2Present;
      const totalExpected = week1ExpectedTotal + week2ExpectedTotal;
      const averageRate = totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 0;

      // 判断是否为低出勤班级：
      // 1. 必须有排课记录
      // 2. 整体平均出勤率低于阈值，或者连续两周都低于阈值
      const hasSchedule = classSchedules.length > 0;
      const isBothWeeksLow = 
        week1Rate !== null && week1Rate < threshold &&
        week2Rate !== null && week2Rate < threshold;
      const isAverageLow = averageRate < threshold;
      
      const isLowAttendance = hasSchedule && (isBothWeeksLow || isAverageLow);

      if (isLowAttendance) {
        // 计算低出勤学员数（出勤率低于60%的学员）
        const totalScheduleCount = classSchedules.length;
        const studentAttendanceMap = new Map<string, { present: number; expected: number }>();
        
        // 初始化所有活跃学员，期望的考勤次数 = 排课数量
        activeEnrollments.forEach((e: any) => {
          studentAttendanceMap.set(e.studentId, { 
            present: 0, 
            expected: totalScheduleCount 
          });
        });
        
        // 统计实际的出勤记录
        [...week1Attendances, ...week2Attendances].forEach((a: any) => {
          const current = studentAttendanceMap.get(a.studentId);
          if (current && a.status === 'present') {
            current.present += 1;
          }
        });

        // 计算低出勤学员数
        let lowAttendanceCount = 0;
        studentAttendanceMap.forEach((stats) => {
          const rate = stats.expected > 0 ? (stats.present / stats.expected) * 100 : 0;
          if (rate < threshold) lowAttendanceCount += 1;
        });

        result.push({
          id: cls.id,
          class: {
            id: cls.id,
            name: cls.name,
            code: cls.code,
            courseType: cls.courseType,
            level: cls.level,
            capacity: cls.capacity,
            teacher: cls.teacher,
          },
          totalStudents,
          attendanceRate: averageRate,
          week1Rate: week1Rate !== null ? Math.round(week1Rate) : null,
          week2Rate: week2Rate !== null ? Math.round(week2Rate) : null,
          lowAttendanceCount,
        });
      }
    }

    // 按出勤率升序排序（最低的在前面）
    result.sort((a, b) => a.attendanceRate - b.attendanceRate);

    return result;
  },

  /**
   * 获取班级出勤统计
   * 显示每个班级的总人数、实际到场数、出勤率
   * @param params.startDate 开始日期
   * @param params.endDate 结束日期
   * @param params.teacherId 教练员ID（可选，用于筛选）
   */
  async getClassAttendanceStats(params?: {
    startDate?: string;
    endDate?: string;
    teacherId?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 1. 获取所有活跃班级及其学员数
    let classQuery = memfire
      .from('classes')
      .select(`
        id,
        name,
        code,
        courseType,
        level,
        capacity,
        teacherId,
        teacher:users(id, name),
        enrollments:enrollments(id, studentId, status)
      `)
      .eq('status', 'active')
      .order('name', { ascending: true });

    // 如果指定了教练员，筛选该教练员负责的班级
    if (params?.teacherId) {
      classQuery = classQuery.eq('teacherId', params.teacherId);
    }

    const { data: classes, error: classesError } = await classQuery;

    if (classesError) throw classesError;

    // 2. 获取指定时间范围的排课记录（默认最近一周）
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const startDate = params?.startDate || defaultStartDate.toISOString();
    const endDate = params?.endDate || now.toISOString();

    const { data: schedules, error: schedulesError } = await memfire
      .from('schedules')
      .select('id, classId, startTime, status')
      .gte('startTime', startDate)
      .lte('startTime', endDate)
      .neq('status', 'cancelled'); // 排除已取消的排课

    if (schedulesError) throw schedulesError;

    // 3. 获取对应的考勤记录
    const scheduleIds = (schedules || []).map((s: any) => s.id);
    let attendances: any[] = [];

    if (scheduleIds.length > 0) {
      const { data: attendanceData, error: attendancesError } = await memfire
        .from('attendances')
        .select('id, classId, scheduleId, studentId, status')
        .in('scheduleId', scheduleIds);

      if (attendancesError) throw attendancesError;
      attendances = attendanceData || [];
    }

    // 4. 计算每个班级的出勤统计
    const result = (classes || []).map((cls: any) => {
      // 班级活跃学员数
      const activeEnrollments = (cls.enrollments || []).filter(
        (e: any) => e.status === 'active'
      );
      const totalStudents = activeEnrollments.length;

      // 获取该班级的排课次数
      const classSchedules = (schedules || []).filter((s: any) => s.classId === cls.id);
      const scheduleCount = classSchedules.length;

      // 获取该班级的考勤记录
      const classAttendances = attendances.filter((a: any) => a.classId === cls.id);
      const presentCount = classAttendances.filter((a: any) => a.status === 'present').length;
      const totalRecords = classAttendances.length;

      // 计算出勤率：出勤人次 / (排课次数 × 班级总人数)
      // 如果班级没有学员或没有排课，出勤率为0
      const expectedAttendance = scheduleCount * totalStudents;
      const attendanceRate = expectedAttendance > 0 
        ? Math.round((presentCount / expectedAttendance) * 100) 
        : 0;

      return {
        classId: cls.id,
        className: cls.name,
        classCode: cls.code,
        courseType: cls.courseType,
        level: cls.level,
        teacher: cls.teacher,
        totalStudents,
        actualAttendance: presentCount,
        totalRecords,
        scheduleCount,
        expectedAttendance,
        attendanceRate,
      };
    });

    // 按班级名称排序
    result.sort((a: any, b: any) => a.className.localeCompare(b.className, 'zh-CN'));

    return result;
  },

  /**
   * 获取低出勤学员列表
   * @param params.startDate 开始日期
   * @param params.endDate 结束日期
   * @param params.threshold 出勤率阈值（低于此值的学员会被筛选出来），默认60%
   * @param params.teacherId 教练员ID（可选，用于筛选特定教练员负责的学员）
   * @param params.continuousAbsentOnly 是否只显示连续请假两周及以上的学员
   */
  async getLowAttendanceStudents(params?: {
    startDate?: string;
    endDate?: string;
    threshold?: number;
    teacherId?: string;
    continuousAbsentOnly?: boolean;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const threshold = params?.threshold ?? 60;
    const teacherId = params?.teacherId;
    const continuousAbsentOnly = params?.continuousAbsentOnly ?? false;

    // 1. 获取所有活跃学员及其班级信息（包含报名时间）
    // 注意：包含所有历史班级（active 和 transferred），用于累计出勤记录
    const { data: students, error: studentsError } = await memfire
      .from('students')
      .select(`
        id,
        name,
        phone,
        parentPhone,
        status,
        enrollments:enrollments(
          id,
          status,
          createdAt,
          classId,
          class:classes(
            id,
            name,
            code,
            teacherId,
            teacher:users(id, name)
          )
        )
      `)
      .eq('status', 'active')
      .order('name', { ascending: true});

    if (studentsError) throw studentsError;

    // 2. 获取指定时间范围的排课记录（默认最近30天）
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const startDate = params?.startDate || defaultStartDate.toISOString();
    const endDate = params?.endDate || now.toISOString();

    const { data: schedules, error: schedulesError } = await memfire
      .from('schedules')
      .select('id, classId, startTime, status')
      .gte('startTime', startDate)
      .lte('startTime', endDate)
      .neq('status', 'cancelled'); // 排除已取消的排课

    if (schedulesError) throw schedulesError;

    // 3. 获取对应的考勤记录
    const scheduleIds = (schedules || []).map((s: any) => s.id);
    let attendances: any[] = [];

    if (scheduleIds.length > 0) {
      const { data: attendanceData, error: attendancesError } = await memfire
        .from('attendances')
        .select('id, classId, scheduleId, studentId, status')
        .in('scheduleId', scheduleIds);

      if (attendancesError) throw attendancesError;
      attendances = attendanceData || [];
    }

    // 4. 计算每个学员的出勤率
    const result: any[] = [];

    for (const student of students || []) {
      // 获取学员的当前活跃班级（用于显示）
      const activeEnrollment = (student.enrollments || []).find(
        (e: any) => e.status === 'active'
      );

      if (!activeEnrollment?.class) continue;

      const classInfo = activeEnrollment.class as any;

      // 如果指定了教练员，只筛选该教练员负责的班级学员
      if (teacherId && classInfo.teacherId !== teacherId) continue;

      // 获取学员的所有班级记录（包括已调班的）
      const allEnrollments = (student.enrollments || []).filter(
        (e: any) => e.status === 'active' || e.status === 'transferred'
      );

      // 累计所有班级的排课次数和出勤记录
      let totalScheduleCount = 0;
      const allStudentAttendances: any[] = [];

      for (const enrollment of allEnrollments) {
        const enrollmentDate = new Date(enrollment.createdAt);
        const enrollmentClassId = enrollment.classId;

        // 获取该班级在学员加入后的排课
        const classSchedules = (schedules || []).filter(
          (s: any) => s.classId === enrollmentClassId && new Date(s.startTime) >= enrollmentDate
        );

        totalScheduleCount += classSchedules.length;

        // 获取该学员在该班级的考勤记录
        const classAttendances = attendances.filter(
          (a: any) => a.studentId === student.id && a.classId === enrollmentClassId
        );

        allStudentAttendances.push(...classAttendances);
      }

      if (totalScheduleCount === 0) continue; // 跳过没有排课的学员

      const totalRecords = allStudentAttendances.length;
      const presentCount = allStudentAttendances.filter(
        (a: any) => a.status === 'present'
      ).length;
      const absentCount = allStudentAttendances.filter(
        (a: any) => a.status === 'absent'
      ).length;

      // 计算出勤率：累计出勤次数 / 累计应出勤次数（所有班级） × 100%
      const scheduleCount = totalScheduleCount;
      const attendanceRate = scheduleCount > 0
        ? Math.round((presentCount / scheduleCount) * 100)
        : 0;

      // 计算连续缺勤次数
      // 如果学员出勤率低于60%且基本没上课，应该算作连续缺勤
      let continuousAbsentCount = 0;
      
      // 情况1：如果完全没有考勤记录但有排课，说明一节课都没上
      if (totalRecords === 0 && scheduleCount > 0) {
        continuousAbsentCount = scheduleCount;
      } 
      // 情况2：如果有考勤记录，计算实际连续缺勤次数
      else if (totalRecords > 0) {
        // 按时间排序考勤记录（最新的在前面）
        const sortedAttendances = [...allStudentAttendances].sort((a: any, b: any) => {
          const scheduleA = (schedules || []).find((s: any) => s.id === a.scheduleId);
          const scheduleB = (schedules || []).find((s: any) => s.id === b.scheduleId);
          const timeA = scheduleA ? new Date(scheduleA.startTime).getTime() : 0;
          const timeB = scheduleB ? new Date(scheduleB.startTime).getTime() : 0;
          return timeB - timeA; // 最新的在前面
        });

        // 计算从最近开始连续缺勤的次数
        for (const att of sortedAttendances) {
          if (att.status === 'absent') {
            continuousAbsentCount++;
          } else {
            break; // 遇到出勤就停止计数
          }
        }
        
        // 如果全部考勤记录都是缺勤（一节课都没上），则连续缺勤次数应该等于排课数
        // 因为可能有排课但还没打卡
        if (continuousAbsentCount === totalRecords && absentCount === totalRecords && scheduleCount > totalRecords) {
          continuousAbsentCount = scheduleCount;
        }
      }

      // 判断是否连续请假两周（每周1次课，两周就是2次）
      const isContinuousAbsent = continuousAbsentCount >= 2;

      // 根据筛选条件决定是否加入结果
      // 修改条件：如果有排课记录就应该被考虑，即使没有考勤记录
      const meetsThreshold = attendanceRate < threshold && scheduleCount > 0;
      const meetsContinuousAbsent = !continuousAbsentOnly || isContinuousAbsent;

      if (meetsThreshold && meetsContinuousAbsent) {
        result.push({
          id: student.id,
          studentName: student.name,
          phone: student.phone || student.parentPhone,
          className: classInfo.name,
          classCode: classInfo.code,
          teacher: classInfo.teacher,
          scheduleCount,
          totalRecords,
          presentCount,
          absentCount,
          attendanceRate,
          continuousAbsentCount,
          isContinuousAbsent,
        });
      }
    }

    // 按出勤率升序排序（最低的在前面）
    result.sort((a, b) => a.attendanceRate - b.attendanceRate);

    return result;
  },
};

// 用户管理（教练员等）
export const usersDB = {
  /**
   * 获取当前用户的机构ID（复用 leadsDB 的逻辑）
   */
  async getOrganizationId(): Promise<string> {
    return leadsDB.getOrganizationId();
  },

  /**
   * 获取教练员列表
   */
  async listTeachers() {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('users')
      .select('id, name, email, role')
      .in('role', ['coach', 'sales', 'admin', 'super_admin']) // 包含教练、销售、管理等可作为负责人的角色
      .eq('isActive', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * 获取所有用户列表
   */
  async listAll() {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('users')
      .select('id, name, email, phone, role, isActive, group')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * 更新用户信息
   */
  async update(userId: string, updates: any) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('users')
      .update({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 创建新用户
   */
  async create(userData: any) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('users')
      .insert({
        ...userData,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 删除用户
   */
  async delete(userId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { error } = await memfire
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;
    return true;
  },

  /**
   * 获取销售数据统计（按销售人员）
   * @param params.startDate 开始日期（用于筛选成单、体验课等时间相关数据）
   * @param params.endDate 结束日期
   */
  async getSalesStatistics(params?: { startDate?: string; endDate?: string }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 1. 获取所有销售人员（角色为 teacher、sales 或 coach）
    const { data: salesPeople, error: salesError } = await memfire
      .from('users')
      .select('id, name, email')
      .in('role', ['teacher', 'sales', 'coach'])
      .eq('isActive', true);

    if (salesError) {
      console.error('获取销售人员列表失败:', salesError);
      throw salesError;
    }

    if (!salesPeople || salesPeople.length === 0) {
      return [];
    }

    // 2. 构建每个销售人员的统计数据
    const statisticsPromises = salesPeople.map(async (salesperson) => {
      const memfireClient = memfire;
      if (!memfireClient) throw new Error('MemFire 客户端未初始化');

      // 添加数：鱼池表中的线索数 + 体验课表中的数量（因为转化后会从鱼池移除）
      let leadsQuery = memfireClient
        .from('leads')
        .select('id', { count: 'exact' })
        .eq('assigneeId', salesperson.id);
      
      if (params?.startDate) {
        leadsQuery = leadsQuery.gte('createdAt', params.startDate);
      }
      if (params?.endDate) {
        leadsQuery = leadsQuery.lte('createdAt', params.endDate);
      }
      
      const { count: leadsCount } = await leadsQuery;

      let experienceQuery = memfireClient
        .from('experience_lessons')
        .select('id', { count: 'exact' })
        .eq('assigneeId', salesperson.id);
      
      if (params?.startDate) {
        experienceQuery = experienceQuery.gte('scheduleDate', params.startDate);
      }
      if (params?.endDate) {
        experienceQuery = experienceQuery.lte('scheduleDate', params.endDate);
      }
      
      const { count: experienceCount } = await experienceQuery;

      const addedCount = (leadsCount || 0) + (experienceCount || 0);

      // 邀约数：所有登记在体验课表的数量（不限状态）
      const invitationCount = experienceCount || 0;

      // 到场数：体验课表中已成单的学员数（只统计 converted 状态）
      let attendanceQuery = memfireClient
        .from('experience_lessons')
        .select('id', { count: 'exact' })
        .eq('assigneeId', salesperson.id)
        .eq('status', 'converted');
      
      if (params?.startDate) {
        attendanceQuery = attendanceQuery.gte('scheduleDate', params.startDate);
      }
      if (params?.endDate) {
        attendanceQuery = attendanceQuery.lte('scheduleDate', params.endDate);
      }
      
      const { count: attendanceCount } = await attendanceQuery;

      // 成单数和成单金额：从 conversions 表获取（成单信息表）
      let ordersQuery = memfireClient
        .from('conversions')
        .select('id, price, courseType')
        .eq('salesId', salesperson.id);
      
      if (params?.startDate) {
        ordersQuery = ordersQuery.gte('conversionDate', params.startDate);
      }
      if (params?.endDate) {
        ordersQuery = ordersQuery.lte('conversionDate', params.endDate);
      }
      
      const { data: orders } = await ordersQuery;

      // 区分续费成单和新签成单
      const renewalOrders = orders?.filter(order => order.courseType === '续费') || [];
      const newOrders = orders?.filter(order => order.courseType !== '续费') || [];

      const orderCount = orders?.length || 0;
      const orderAmount = orders?.reduce((sum, order) => sum + (order.price || 0), 0) || 0;
      
      // 续费成单数据
      const renewalOrderCount = renewalOrders.length;
      const renewalOrderAmount = renewalOrders.reduce((sum, order) => sum + (order.price || 0), 0);
      
      // 新签成单数据
      const newOrderCount = newOrders.length;
      const newOrderAmount = newOrders.reduce((sum, order) => sum + (order.price || 0), 0);

      return {
        teacherId: salesperson.id,
        teacherName: salesperson.name,
        email: salesperson.email,
        addedCount,
        invitationCount,
        attendanceCount: attendanceCount || 0,
        orderCount,
        orderAmount,
        // 新增：续费成单数据
        renewalOrderCount,
        renewalOrderAmount,
        // 新增：新签成单数据
        newOrderCount,
        newOrderAmount,
      };
    });

    const statistics = await Promise.all(statisticsPromises);
    
    // 按成单金额降序排序
    return statistics.sort((a, b) => b.orderAmount - a.orderAmount);
  },

  /**
   * 获取教练统计数据
   * @param params.startDate 开始日期（用于筛选成单、课消等时间相关数据）
   * @param params.endDate 结束日期
   */
  async getCoachStatistics(params?: { startDate?: string; endDate?: string }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');
    
    console.log('开始获取教练统计数据', params);

    // 1. 获取所有角色为 coach 的用户（不限制 organizationId）
    const { data: coaches, error: coachesError } = await memfire
      .from('users')
      .select('id, name')
      .eq('role', 'coach')
      .eq('isActive', true);

    if (coachesError) {
      console.error('获取教练列表失败:', coachesError);
      throw coachesError;
    }
    
    console.log('找到的教练:', coaches);
    
    if (!coaches || coaches.length === 0) {
      console.log('没有找到任何教练，返回空数组');
      return [];
    }

    const coachIds = coaches.map(c => c.id);
    console.log('教练ID列表:', coachIds);

    // 2. 获取每个教练负责的班级数和学员数
    const { data: enrollments, error: enrollmentsError } = await memfire
      .from('enrollments')
      .select('id, studentId, classId, class:classes(id, teacherId)')
      .eq('status', 'active')
      .in('class.teacherId', coachIds);

    if (enrollmentsError) {
      console.error('获取报名信息失败:', enrollmentsError);
      throw enrollmentsError;
    }
    console.log('报名信息:', enrollments);

    // 3. 获取每个教练的出勤率数据
    const { data: attendances, error: attendancesError } = await memfire
      .from('attendances')
      .select('id, studentId, status, schedule:schedules(id, classId, class:classes(teacherId))')
      .in('schedule.class.teacherId', coachIds);

    if (attendancesError) {
      console.error('获取出勤信息失败:', attendancesError);
      // 不抛出错误，继续处理
      console.warn('出勤数据获取失败，将使用空数据');
    }
    console.log('出勤信息:', attendances);

    // 4. 获取每个教练的成单数据（作为销售的）
    let conversionsQuery = memfire
      .from('conversions')
      .select('id, studentId, price, salesId, conversionDate, courseType, totalLessons');
    
    // 如果有时间范围，筛选成单日期
    if (params?.startDate) {
      conversionsQuery = conversionsQuery.gte('conversionDate', params.startDate);
    }
    if (params?.endDate) {
      conversionsQuery = conversionsQuery.lte('conversionDate', params.endDate);
    }

    const { data: conversions, error: conversionsError } = await conversionsQuery;

    if (conversionsError) {
      console.error('获取成单信息失败:', conversionsError);
      console.warn('成单数据获取失败，将使用空数据');
    }
    console.log('成单信息:', conversions);

    // 5. 获取学员信息（用于计算基本盘）
    const { data: students, error: studentsError } = await memfire
      .from('students')
      .select('id, name, status, createdAt');

    if (studentsError) {
      console.error('获取学员信息失败:', studentsError);
      console.warn('学员数据获取失败，将使用空数据');
    }
    console.log('学员信息:', students);

    // 6. 获取划课记录（课消数据）
    let lessonLogsQuery = memfire
      .from('lesson_logs')
      .select('id, studentId, type, lessons, createdAt');
    
    // 如果有时间范围，筛选划课日期
    if (params?.startDate) {
      lessonLogsQuery = lessonLogsQuery.gte('createdAt', params.startDate);
    }
    if (params?.endDate) {
      lessonLogsQuery = lessonLogsQuery.lte('createdAt', params.endDate);
    }

    const { data: lessonLogs, error: lessonLogsError } = await lessonLogsQuery;

    if (lessonLogsError) {
      console.error('获取划课记录失败:', lessonLogsError);
      console.warn('划课数据获取失败，将使用空数据');
    }
    console.log('划课记录:', lessonLogs);

    // 获取筛选时间段内的所有排课（用于计算出勤率）
    let schedulesQuery = memfire
      .from('schedules')
      .select('id, classId, startTime, status')
      .neq('status', 'cancelled');
    
    // 应用时间筛选
    if (params?.startDate) {
      schedulesQuery = schedulesQuery.gte('startTime', params.startDate);
    }
    if (params?.endDate) {
      schedulesQuery = schedulesQuery.lte('startTime', params.endDate);
    }
    
    const { data: timeFilteredSchedules, error: schedulesError } = await schedulesQuery;
    if (schedulesError) {
      console.error('获取排课信息失败:', schedulesError);
    }
    console.log('筛选时间段内的排课:', timeFilteredSchedules);

    // 获取筛选时间段内的所有考勤记录
    let timeFilteredAttendances: any[] = [];
    if (timeFilteredSchedules && timeFilteredSchedules.length > 0) {
      const scheduleIds = timeFilteredSchedules.map((s: any) => s.id);
      const { data: attendanceData, error: attendancesError2 } = await memfire
        .from('attendances')
        .select('id, status, scheduleId')
        .in('scheduleId', scheduleIds);
      
      if (attendancesError2) {
        console.error('获取考勤记录失败:', attendancesError2);
      } else {
        timeFilteredAttendances = attendanceData || [];
      }
    }
    console.log('筛选时间段内的考勤记录:', timeFilteredAttendances);

    // 统计每个教练的数据
    const statistics = coaches.map(coach => {
      // 负责的班级（去重）
      const coachClasses = new Set(
        enrollments
          ?.filter(e => e.class?.teacherId === coach.id)
          .map(e => e.classId) || []
      );
      const classCount = coachClasses.size;

      // 负责的学员（去重）
      const coachStudents = new Set(
        enrollments
          ?.filter(e => e.class?.teacherId === coach.id)
          .map(e => e.studentId) || []
      );
      const studentCount = coachStudents.size;
      const coachStudentIds = Array.from(coachStudents);

      // 学员出勤率计算
      // 正确逻辑：(筛选时间段内)负责班级出勤人数 / 负责班级应出勤人数
      
      // 1. 获取该教练负责的所有班级ID
      const coachClassIds = Array.from(coachClasses);
      
      // 2. 获取筛选时间段内该教练班级的排课
      const coachSchedules = timeFilteredSchedules?.filter(
        (s: any) => coachClassIds.includes(s.classId)
      ) || [];
      
      // 3. 计算应出勤人数：每次排课 × 该班级的活跃学员数
      let totalExpectedAttendances = 0;
      for (const schedule of coachSchedules) {
        const classStudentCount = enrollments?.filter(
          e => e.classId === schedule.classId && e.class?.teacherId === coach.id
        ).length || 0;
        totalExpectedAttendances += classStudentCount;
      }
      
      // 4. 获取实际出勤记录
      const coachScheduleIds = coachSchedules.map((s: any) => s.id);
      const coachAttendancesData = timeFilteredAttendances.filter(
        (a: any) => coachScheduleIds.includes(a.scheduleId)
      );
      
      const actualPresentCount = coachAttendancesData.filter(
        (a: any) => a.status === 'present'
      ).length;
      
      // 5. 计算出勤率
      const attendanceRate = totalExpectedAttendances > 0 
        ? Math.round((actualPresentCount / totalExpectedAttendances) * 100) 
        : 0;

      // 基本盘人数 = 活跃学员数
      const activeStudents = coachStudentIds.filter(studentId => {
        const student = students?.find(s => s.id === studentId);
        return student && student.status === 'active';
      });
      const baseCount = activeStudents.length;

      // 个人新招数（作为销售人员的成单，排除续费）
      const newRecruits = conversions?.filter(c => 
        c.salesId === coach.id && c.courseType !== '续费'
      ).length || 0;

      // 续费率计算
      const renewals = conversions?.filter(c => 
        c.salesId === coach.id && c.courseType === '续费'
      ) || [];
      const renewalStudents = new Set(renewals.map(r => r.studentId));
      const renewalRate = baseCount > 0 
        ? Math.round((renewalStudents.size / baseCount) * 100) 
        : 0;

      // 成单金额（作为销售的成单金额）
      const totalOrderAmount = conversions
        ?.filter(c => c.salesId === coach.id)
        .reduce((sum, c) => sum + (c.price || 0), 0) || 0;

      // 课消金额计算（基于实际划课记录）
      // 1. 计算该教练学员的总课消节数
      const totalLessonsConsumed = lessonLogs
        ?.filter(log => log.type === 'deduct' && coachStudentIds.includes(log.studentId))
        .reduce((sum, log) => sum + (log.lessons || 0), 0) || 0;

      // 2. 计算该教练学员的总购买课时和总支付金额
      const coachStudentConversions = conversions?.filter(c => coachStudentIds.includes(c.studentId)) || [];
      const totalLessonsPurchased = coachStudentConversions.reduce((sum, c) => sum + (c.totalLessons || 0), 0) || 0;
      const totalAmountPaid = coachStudentConversions.reduce((sum, c) => sum + (c.price || 0), 0) || 0;

      // 3. 计算平均课时单价
      const averagePricePerLesson = totalLessonsPurchased > 0 ? totalAmountPaid / totalLessonsPurchased : 0;

      // 4. 课消金额 = 实际消耗课时 × 平均课时单价
      const consumptionAmount = totalLessonsConsumed * averagePricePerLesson;

      console.log(`教练 ${coach.name}:`, {
        studentCount,
        totalLessonsConsumed,
        totalLessonsPurchased,
        totalAmountPaid,
        averagePricePerLesson,
        consumptionAmount,
      });

      return {
        teacherId: coach.id,
        teacherName: coach.name,
        classCount,
        studentCount,
        attendanceRate,
        baseCount,
        baseCountChange: 0, // 需要历史数据对比，暂时为0
        newRecruits,
        renewalRate,
        totalOrderAmount,
        consumptionAmount,
      };
    });

    return statistics;
  },
};

// 课消收入统计
export const consumptionDB = {
  /**
   * 获取课消收入统计数据
   * @param params.startDate 开始日期
   * @param params.endDate 结束日期
   */
  async getStatistics(params?: { startDate?: string; endDate?: string }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 默认时间范围：本月
    const now = new Date();
    const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const startDate = params?.startDate || defaultStartDate.toISOString();
    const endDate = params?.endDate || defaultEndDate.toISOString();

    console.log('📊 开始统计数据，时间范围:', { 
      startDate: startDate.substring(0, 10), 
      endDate: endDate.substring(0, 10) 
    });

    // 1. 获取所有班级信息（包含班级类型）
    const { data: classes, error: classesError } = await memfire
      .from('classes')
      .select(`
        id,
        name,
        code,
        courseType,
        level,
        capacity,
        status,
        teacherId,
        enrollments:enrollments(id, studentId, status)
      `)
      .eq('status', 'active');

    if (classesError) throw classesError;

    // 2. 获取指定时间范围内的排课（排除已取消的）
    const { data: schedules, error: schedulesError } = await memfire
      .from('schedules')
      .select('id, classId, startTime, status')
      .gte('startTime', startDate)
      .lte('startTime', endDate)
      .neq('status', 'cancelled');

    if (schedulesError) throw schedulesError;

    // 3. 获取考勤记录
    let attendances: any[] = [];
    if (schedules && schedules.length > 0) {
      const scheduleIds = schedules.map((s: any) => s.id);
      const { data: attendanceData, error: attendancesError } = await memfire
        .from('attendances')
        .select('id, scheduleId, studentId, status, classId')
        .in('scheduleId', scheduleIds);

      if (attendancesError) throw attendancesError;
      attendances = attendanceData || [];
      
      console.log('📋 出勤记录查询:', {
        排课数: schedules.length,
        总考勤记录: attendances.length,
        出勤人次: attendances.filter((a: any) => a.status === 'present').length,
        缺勤人次: attendances.filter((a: any) => a.status === 'absent').length,
      });
      
      // 为每条考勤记录找到对应的排课时间
      const attendancesWithSchedule = attendances.map((a: any) => {
        const schedule = schedules.find((s: any) => s.id === a.scheduleId);
        return {
          学员ID: a.studentId.substring(0, 8) + '...',
          排课ID: a.scheduleId.substring(0, 8) + '...',
          状态: a.status === 'present' ? '✅出勤' : '❌缺勤',
          排课时间: schedule ? new Date(schedule.startTime).toLocaleString('zh-CN').substring(0, 16) : '未找到',
          班级ID: a.classId?.substring(0, 8) + '...' || '无'
        };
      });
      
      console.log('📝 考勤详情（带排课时间）:');
      console.table(attendancesWithSchedule);
    } else {
      console.warn('⚠️ 时间范围内没有排课记录，无法统计出勤');
    }

    // 4. 获取学员数据统计
    // 花名册人数：所有非删除状态的学员
    const { data: allStudents, error: allStudentsError } = await memfire
      .from('students')
      .select('id, status, createdAt, updatedAt')
      .neq('status', 'deleted');

    if (allStudentsError) throw allStudentsError;

    // 活跃学员
    const { data: activeStudents, error: studentsError } = await memfire
      .from('students')
      .select('id')
      .eq('status', 'active');

    if (studentsError) throw studentsError;

    // 新增人数：在时间范围内成单信息表中确定新报名的学员（不包括续费）
    let newRecruits = 0;
    try {
      console.log('🔍 查询新增学员（从成单信息表），时间范围:', { startDate, endDate });
      
      // 从 conversions 表获取（成单信息表）
      const { data: conversions, error: conversionsError } = await memfire
        .from('conversions')
        .select('id, studentId, courseType, conversionDate, createdAt')
        .gte('conversionDate', startDate)
        .lte('conversionDate', endDate);

      if (!conversionsError && conversions) {
        // 筛选出新报名的学员（排除续费）
        // courseType 为 '续费' 的记录是续费，其他都是新报名
        const newStudents = conversions.filter((c: any) => {
          const courseType = c.courseType || '';
          return courseType !== '续费' && courseType !== 'renewal' && courseType !== '续报';
        });
        
        // 去重获取新报名学员数（同一学员可能有多次报名，只计一次）
        const uniqueNewStudents = new Set(newStudents.map((c: any) => c.studentId));
        newRecruits = uniqueNewStudents.size;
        
        console.log('✅ 新增学员统计:', { 
          总成单数: conversions.length, 
          新报名数: newStudents.length,
          去重后新学员数: newRecruits,
          续费数: conversions.length - newStudents.length
        });
      } else if (conversionsError) {
        console.error('❌ 查询成单信息表出错:', conversionsError);
        if (conversionsError.code === '42P01' || conversionsError.message?.includes('does not exist')) {
          console.warn('⚠️ conversions 表不存在，新增学员数设为 0');
        }
      }
    } catch (e) {
      console.error('❌ 获取新增学员异常:', e);
    }

    // 召回学员：从 inactive 状态重新激活的学员
    // 在时间范围内从流失状态（inactive）被召回（变为active）的学员数量
    // 
    // ⚠️ 重要说明：关于重复计算问题
    // - baseCount（基本盘）= 当前时刻所有 status='active' 的学员数（实际统计值）
    // - recalled（召回）= 在时间范围内被召回的学员数（变化量）
    // - 这两个指标不会导致重复计算，因为：
    //   1. baseCount 是"期末快照"，直接统计当前活跃学员
    //   2. recalled 是"过程变化量"，记录召回动作的发生
    //   3. 展示时使用：本期净变化 = 新增 + 召回 - 不续费 - 流失
    //   4. 不使用误导性公式：基本盘 = 花名册 + 新增 + 召回 - 不续费 - 流失
    let recalled = 0;
    try {
      console.log('🔍 查询召回学员，时间范围:', { startDate, endDate });
      
      // 查询在指定时间范围内更新状态为 active，且 notes 中包含"删除原因"的学员
      // 这表示学员之前被标记为流失（会在 notes 中记录删除原因），现在被召回
      const { data: recalledStudents, error: recalledError } = await memfire
        .from('students')
        .select('id, name, status, notes, updatedAt')
        .eq('status', 'active')
        .gte('updatedAt', startDate)
        .lte('updatedAt', endDate)
        .like('notes', '%删除原因:%');  // notes 中包含"删除原因"说明之前是流失学员

      if (recalledError) {
        console.error('❌ 查询召回学员出错:', recalledError);
      } else {
        recalled = recalledStudents?.length || 0;
        console.log('✅ 召回学员:', {
          count: recalled,
          students: recalledStudents?.map((s: any) => ({
            name: s.name,
            status: s.status,
            updatedAt: s.updatedAt,
            notes: s.notes
          }))
        });
      }
    } catch (e) {
      console.error('❌ 查询召回学员异常:', e);
    }

    // 不续费学员：在时间范围内标记为不续费或已毕业的学员
    let nonRenewals = 0;
    try {
      console.log('🔍 查询不续费学员（包括已毕业），时间范围:', { startDate, endDate });
      
      // 查询两种情况：
      // 1. renewalStatus = 'no_renewal' （明确标记不续费）
      // 2. status = 'graduated' （已毕业）
      const { data: noRenewalRecords, error: noRenewalError } = await memfire
        .from('students')
        .select('id, name, renewalStatus, updatedAt, status')
        .or(`renewalStatus.eq.no_renewal,status.eq.graduated`)
        .gte('updatedAt', startDate)
        .lte('updatedAt', endDate);

      if (noRenewalError) {
        console.error('❌ 查询不续费学员出错:', noRenewalError);
      } else {
        nonRenewals = noRenewalRecords?.length || 0;
        console.log('✅ 不续费学员（含已毕业）:', {
          count: nonRenewals,
          students: noRenewalRecords?.map((s: any) => ({
            name: s.name,
            status: s.status,
            renewalStatus: s.renewalStatus,
            updatedAt: s.updatedAt,
            type: s.status === 'graduated' ? '已毕业' : '不续费'
          }))
        });
      }
    } catch (e) {
      console.error('❌ 查询不续费学员异常:', e);
    }

    // 流失学员（停卡/删除花名册）：在时间范围内状态变为 inactive 或 deleted 的学员数量
    let deletedRoster = 0;
    try {
      console.log('🔍 查询流失学员，时间范围:', { startDate, endDate });
      
      // 查询在指定时间范围内更新状态为 inactive 或 deleted 的学员
      const { data: lostStudents, error: lostError } = await memfire
        .from('students')
        .select('id, name, status, updatedAt')
        .in('status', ['inactive', 'deleted'])
        .gte('updatedAt', startDate)
        .lte('updatedAt', endDate);

      if (lostError) {
        console.error('❌ 查询流失学员出错:', lostError);
      } else {
        deletedRoster = lostStudents?.length || 0;
        console.log('✅ 流失学员（停卡/删除）:', {
          count: deletedRoster,
          students: lostStudents?.map((s: any) => ({
            name: s.name,
            status: s.status,
            updatedAt: s.updatedAt
          }))
        });
      }
    } catch (e) {
      console.error('❌ 查询流失学员异常:', e);
    }

    // 5. 计算统计数据
    
    // 输出学员状态统计，帮助调试
    const statusDistribution: any = {};
    allStudents?.forEach((s: any) => {
      statusDistribution[s.status] = (statusDistribution[s.status] || 0) + 1;
    });
    console.log('📊 学员状态分布:', statusDistribution);
    
    const renewalStatusDistribution: any = {};
    allStudents?.forEach((s: any) => {
      if (s.renewalStatus) {
        renewalStatusDistribution[s.renewalStatus] = (renewalStatusDistribution[s.renewalStatus] || 0) + 1;
      }
    });
    console.log('📊 续费状态分布:', renewalStatusDistribution);
    
    // 花名册人数：所有非删除状态的学员总数
    const rosterCount = allStudents?.length || 0;

    // 基本盘人数：活跃学员总数
    const baseCount = activeStudents?.length || 0;

    // 根据真实数据统计（已在上面计算）
    // recalled: 召回学员数
    // nonRenewals: 不续费学员数
    // deletedRoster: 流失（停卡）学员数
    // newRecruits: 新报名学员数

    // 班级统计（先定义，后面会用到）
    const activeClasses = classes || [];

    // 统计出勤数据
    const presentAttendances = attendances.filter((a: any) => a.status === 'present');
    const uniqueAttendedStudents = new Set(presentAttendances.map((a: any) => a.studentId));
    
    // 出勤人数（用户定义）= 实际划课数 = 出勤人次
    const totalAttendance = presentAttendances.length;

    // 出勤人次（用户定义）= 应划课数 = 理想出勤人次
    // 理想出勤人次 = 排课数量 × 每个班级的学员数总和
    let totalAttendanceCount = 0; // 应划课数
    if (schedules && schedules.length > 0) {
      schedules.forEach((schedule: any) => {
        const classData = activeClasses.find((cls: any) => cls.id === schedule.classId);
        if (classData) {
          const activeEnrollments = (classData.enrollments || []).filter((e: any) => e.status === 'active');
          totalAttendanceCount += activeEnrollments.length;
        }
      });
    }

    // 出勤率 = 实际划课数 / 应划课数
    const attendanceRate = totalAttendanceCount > 0 
      ? Math.round((totalAttendance / totalAttendanceCount) * 100) 
      : 0;

    console.log('📊 出勤统计:', {
      实际划课数: totalAttendance,
      应划课数: totalAttendanceCount,
      出勤率: attendanceRate + '%',
      出勤学员数_去重: uniqueAttendedStudents.size,
    });
    const classCount = activeClasses.length;

    // 幼儿班数（courseType 或 level 包含"幼儿"）
    const preschoolClassCount = activeClasses.filter((cls: any) => 
      cls.courseType?.includes('幼儿') || cls.level?.includes('幼儿')
    ).length;

    // 精英班数（courseType 或 level 包含"精英"）
    const eliteClassCount = activeClasses.filter((cls: any) => 
      cls.courseType?.includes('精英') || cls.level?.includes('精英')
    ).length;

    // 计算满班率
    let totalCapacity = 0;
    let totalEnrolled = 0;
    activeClasses.forEach((cls: any) => {
      const capacity = cls.capacity || 20;
      const activeEnrollments = (cls.enrollments || []).filter((e: any) => e.status === 'active');
      totalCapacity += capacity;
      totalEnrolled += activeEnrollments.length;
    });
    const fullClassRate = totalCapacity > 0 
      ? Math.round((totalEnrolled / totalCapacity) * 100) 
      : 0;

    // 整体确认收入计算
    // 正确逻辑：确认收入 = Σ(每个学员的课单价 × 该学员在本月的出勤次数)
    // 课单价 = 报名价格 / 报名次数（从成单信息表获取，不限时间范围）
    let totalRevenue = 0;
    let avgLessonPrice = 0;
    
    try {
      // 获取当前用户的机构ID
      const { useAuthStore } = await import('../store/authStore');
      const currentUser = useAuthStore.getState().user;
      const userOrgId = currentUser?.organizationId;

      if (!userOrgId) {
        console.warn('⚠️ 无法获取机构ID，跳过收入统计');
      } else {
        // 1. 统计本月每个学员的出勤次数
        const studentAttendanceCount = new Map<string, number>();
        presentAttendances.forEach((att: any) => {
          const count = studentAttendanceCount.get(att.studentId) || 0;
          studentAttendanceCount.set(att.studentId, count + 1);
        });

        console.log('📊 本月出勤统计:', {
          出勤学员数: studentAttendanceCount.size,
          实际出勤人次: totalAttendance,
          应划课数: totalAttendanceCount,
        });

        // 2. 获取这些学员的成单记录（不限时间范围）
        const studentIds = Array.from(studentAttendanceCount.keys());
        
        if (studentIds.length > 0) {
          const { data: conversions, error: conversionsError } = await memfire
            .from('conversions')
            .select('studentId, price, totalLessons, conversionDate')
            .eq('organizationId', userOrgId)
            .in('studentId', studentIds);

          if (conversionsError) {
            console.error('❌ 查询成单记录出错:', conversionsError);
          } else if (conversions && conversions.length > 0) {
            console.log('✅ 获取到成单记录:', conversions.length, '条');
            
            // 3. 为每个学员计算课单价（如果一个学员有多个成单记录，取最新的）
            const studentPriceMap = new Map<string, number>();
            conversions.forEach((conv: any) => {
              const price = conv.price || 0;
              const lessons = conv.totalLessons || 0;
              if (lessons > 0) {
                const lessonPrice = price / lessons;
                // 如果该学员已有记录，保留最新的（假设数据库返回的是按时间排序的）
                if (!studentPriceMap.has(conv.studentId)) {
                  studentPriceMap.set(conv.studentId, lessonPrice);
                }
              }
            });

            // 4. 计算确认收入
            let totalPaidAmount = 0;
            let totalPaidLessons = 0;
            let studentRevenueDetails: any[] = [];

            studentAttendanceCount.forEach((attendCount, studentId) => {
              const lessonPrice = studentPriceMap.get(studentId);
              if (lessonPrice && lessonPrice > 0) {
                const revenue = lessonPrice * attendCount;
                totalRevenue += revenue;
                totalPaidAmount += lessonPrice * attendCount;
                totalPaidLessons += attendCount;
                studentRevenueDetails.push({
                  studentId,
                  课单价: lessonPrice.toFixed(2),
                  出勤次数: attendCount,
                  确认收入: revenue.toFixed(2)
                });
              }
            });

            // 计算平均课单价
            avgLessonPrice = totalPaidLessons > 0 ? totalPaidAmount / totalPaidLessons : 0;

            console.log('💰 收入计算明细:', {
              有成单记录的学员数: studentPriceMap.size,
              平均课单价: avgLessonPrice.toFixed(2),
              实际划课数: totalAttendance,
              应划课数: totalAttendanceCount,
              计费出勤人次: totalPaidLessons,
              确认收入: totalRevenue.toFixed(2),
              明细: studentRevenueDetails
            });
          } else {
            console.warn('⚠️ 未找到出勤学员的成单记录');
          }
        } else {
          console.warn('⚠️ 本月没有出勤记录');
        }
      }
    } catch (e) {
      console.error('❌ 获取收入数据失败:', e);
    }

    // 课单价（已在上面计算）
    const lessonPrice = Math.round(avgLessonPrice * 100) / 100;

    // 场地使用率 = 已开班数 / 最大开班数
    // 从 settings 表获取最大开班数配置
    let venueUtilizationRate = 0;
    try {
      const { data: maxClassesSetting, error: settingsError } = await memfire
        .from('settings')
        .select('value')
        .eq('key', 'maxClasses')
        .single();
      
      if (settingsError) {
        console.warn('⚠️ 未找到最大开班数配置，场地使用率将为 0');
      } else if (maxClassesSetting && maxClassesSetting.value) {
        const maxClasses = Number(maxClassesSetting.value);
        if (maxClasses > 0) {
          venueUtilizationRate = Math.round((classCount / maxClasses) * 100);
          console.log('✅ 场地使用率计算:', {
            已开班数: classCount,
            最大开班数: maxClasses,
            使用率: venueUtilizationRate + '%'
          });
        }
      }
    } catch (e) {
      console.error('❌ 获取最大开班数配置失败:', e);
    }

    const completedSchedules = schedules?.length || 0;

    return {
      totalAttendance,        // 整体出勤人数（去重）
      totalAttendanceCount,   // 出勤人次（不去重）
      baseCount,              // 基本盘人数
      rosterCount,            // 花名册人数
      newRecruits,            // 新增人数
      recalled,               // 召回人数
      nonRenewals,            // 不续费人数
      deletedRoster,          // 删除花名册人数
      attendanceRate,         // 出勤率
      lessonPrice,            // 课单价
      classCount,             // 班级总数
      preschoolClassCount,    // 幼儿班数
      eliteClassCount,        // 精英班数
      totalRevenue,           // 整体确认收入
      fullClassRate,          // 满班率
      venueUtilizationRate,   // 场地使用率（已开班数 / 最大开班数）
      completedSchedules,     // 已完成排课数
    };
  },

  /**
   * 获取班级学员人数变化统计（基于基本盘逻辑）
   * 只统计 status='active' 的学员，考虑学员状态变化
   */
  async getClassStudentChanges(params: { startDate?: string; endDate?: string }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { startDate, endDate } = params;

    console.log('🔍 查询班级学员变化，时间范围:', { startDate, endDate });

    // 获取所有活跃班级
    const { data: classes, error: classesError } = await memfire
      .from('classes')
      .select(`
        id,
        name,
        code,
        capacity,
        level,
        courseType,
        teacherId,
        teacher:users(id, name)
      `)
      .eq('status', 'active')
      .order('name');

    if (classesError) throw classesError;

    // 获取每个班级的当前活跃学员数（只统计 status='active' 的学员）
    const { data: currentEnrollmentsData, error: currentError } = await memfire
      .from('enrollments')
      .select('classId, studentId, student:students(id, status)')
      .eq('status', 'active');

    if (currentError) throw currentError;

    // 统计当前每个班级的活跃学员数（基本盘逻辑）
    const currentCounts: Record<string, number> = {};
    const currentStudents: Record<string, Set<string>> = {};
    
    (currentEnrollmentsData || []).forEach((e: any) => {
      if (e.classId && e.student && e.student.status === 'active') {
        currentCounts[e.classId] = (currentCounts[e.classId] || 0) + 1;
        if (!currentStudents[e.classId]) {
          currentStudents[e.classId] = new Set();
        }
        currentStudents[e.classId].add(e.studentId);
      }
    });

    console.log('📊 当前班级学员数（基本盘）:', currentCounts);

    // 获取时间范围内的变化
    let lostFromClass: Record<string, number> = {};
    let newToClass: Record<string, number> = {};

    if (startDate && endDate) {
      // 1. 获取在时间范围内状态变为非活跃的学员
      const { data: inactiveStudents, error: inactiveError } = await memfire
        .from('students')
        .select('id, status, updatedAt, enrollments:enrollments(classId, status)')
        .in('status', ['inactive', 'graduated', 'deleted'])
        .gte('updatedAt', startDate)
        .lte('updatedAt', endDate);

      if (!inactiveError && inactiveStudents) {
        // 统计每个班级流失的学员数
        inactiveStudents.forEach((student: any) => {
          const activeEnrollments = (student.enrollments || []).filter((e: any) => e.status === 'active');
          activeEnrollments.forEach((e: any) => {
            if (e.classId) {
              lostFromClass[e.classId] = (lostFromClass[e.classId] || 0) + 1;
            }
          });
        });
      }

      // 2. 获取在时间范围内取消报名的学员（从班级中移除）
      const { data: cancelledEnrollments, error: cancelledError } = await memfire
        .from('enrollments')
        .select('classId, studentId, updatedAt')
        .eq('status', 'cancelled')
        .gte('updatedAt', startDate)
        .lte('updatedAt', endDate);

      if (!cancelledError && cancelledEnrollments) {
        cancelledEnrollments.forEach((e: any) => {
          if (e.classId) {
            lostFromClass[e.classId] = (lostFromClass[e.classId] || 0) + 1;
          }
        });
      }

      console.log('📉 流失学员统计:', lostFromClass);

      // 3. 获取在时间范围内新增的报名（且学员状态为 active）
      const { data: newEnrollmentsData, error: newError } = await memfire
        .from('enrollments')
        .select('classId, studentId, createdAt, student:students(id, status)')
        .eq('status', 'active')
        .gte('createdAt', startDate)
        .lte('createdAt', endDate);

      if (!newError && newEnrollmentsData) {
        newEnrollmentsData.forEach((e: any) => {
          if (e.classId && e.student && e.student.status === 'active') {
            newToClass[e.classId] = (newToClass[e.classId] || 0) + 1;
          }
        });
      }

      console.log('📈 新增学员统计:', newToClass);
    }

    // 构建班级人数变化数据
    const classChanges = (classes || []).map((cls: any) => {
      const currentStudents = currentCounts[cls.id] || 0;
      const lost = lostFromClass[cls.id] || 0;
      const newAdded = newToClass[cls.id] || 0;
      const change = newAdded - lost;
      const previousStudents = currentStudents - change; // 推算上期人数

      const capacity = cls.capacity || 20;
      return {
        id: cls.id,
        name: cls.name,
        code: cls.code,
        maxStudents: capacity,
        level: cls.level,
        courseType: cls.courseType,
        teacherName: cls.teacher?.name || '未分配',
        currentStudents,
        previousStudents: Math.max(0, previousStudents),
        newAdded,
        lost,
        change,
        changeRate: previousStudents > 0 ? Math.round((change / previousStudents) * 100) : (change > 0 ? 100 : 0),
        fullnessRate: capacity > 0 ? Math.round((currentStudents / capacity) * 100) : 0,
      };
    });

    // 统计汇总
    const totalClasses = classChanges.length;
    const decreasedClasses = classChanges.filter((c: any) => c.change < 0).length;
    const increasedClasses = classChanges.filter((c: any) => c.change > 0).length;
    const unchangedClasses = classChanges.filter((c: any) => c.change === 0).length;
    const totalLost = classChanges.reduce((sum: number, c: any) => sum + c.lost, 0);
    const totalNewAdded = classChanges.reduce((sum: number, c: any) => sum + c.newAdded, 0);

    return {
      classes: classChanges,
      stats: {
        totalClasses,
        decreasedClasses,
        increasedClasses,
        unchangedClasses,
        totalLost,
        totalNewAdded,
        netChange: totalNewAdded - totalLost,
      },
    };
  },
};

// 蜜月期客户（新报名学员）管理
export const honeymoonDB = {
  /**
   * 获取蜜月期客户列表（报名30天内的学员）
   * 自动筛选报名时间在30天内的学员，超过30天自动不再显示
   */
  async getHoneymoonStudents() {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 计算30天前的日期
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    // 获取30天内首次报名的学员（查找学员的第一个 enrollment）
    const { data: allEnrollments, error: enrollmentsError } = await memfire
      .from('enrollments')
      .select(`
        id,
        studentId,
        classId,
        status,
        createdAt,
        student:students(id, name, phone, parentPhone, status),
        class:classes(id, name, code, teacherId, teacher:users(id, name))
      `)
      .gte('createdAt', thirtyDaysAgoStr)
      .order('createdAt', { ascending: true });

    if (enrollmentsError) throw enrollmentsError;

    if (!allEnrollments || allEnrollments.length === 0) {
      return { students: [], stats: { total: 0, avgAttendanceRate: 0, highAttendance: 0, lowAttendance: 0 } };
    }

    // 找出每个学员的首次报名记录（蜜月期从首次报名开始计算）
    const studentFirstEnrollmentMap = new Map<string, any>();
    for (const enrollment of allEnrollments) {
      const studentId = enrollment.studentId;
      if (!studentFirstEnrollmentMap.has(studentId)) {
        studentFirstEnrollmentMap.set(studentId, enrollment);
      }
    }

    // 只保留首次报名在30天内的学员
    const honeymoonEnrollments = Array.from(studentFirstEnrollmentMap.values());

    // 获取这些学员的所有班级记录（包括调班后的）
    const studentIds = honeymoonEnrollments.map((e: any) => e.studentId);
    
    const { data: allStudentEnrollments, error: allEnrollmentsError } = await memfire
      .from('enrollments')
      .select('id, studentId, classId, status, createdAt')
      .in('studentId', studentIds)
      .in('status', ['active', 'transferred']);

    if (allEnrollmentsError) throw allEnrollmentsError;

    // 获取所有相关班级的ID
    const allClassIds = [...new Set((allStudentEnrollments || []).map((e: any) => e.classId))];

    // 获取排课记录
    const { data: schedules, error: schedulesError } = await memfire
      .from('schedules')
      .select('id, classId, startTime, status')
      .in('classId', allClassIds)
      .eq('status', 'completed')
      .order('startTime', { ascending: true });

    if (schedulesError) throw schedulesError;

    // 获取考勤记录
    let attendances: any[] = [];
    if (schedules && schedules.length > 0) {
      const scheduleIds = schedules.map((s: any) => s.id);
      const { data: attendanceData, error: attendancesError } = await memfire
        .from('attendances')
        .select('id, scheduleId, studentId, status, classId')
        .in('scheduleId', scheduleIds)
        .in('studentId', studentIds);

      if (attendancesError) throw attendancesError;
      attendances = attendanceData || [];
    }

    // 计算每个蜜月期学员的出勤情况
    const now = new Date();
    const result: any[] = [];

    for (const firstEnrollment of honeymoonEnrollments) {
      const student = firstEnrollment.student as any;
      const classInfo = firstEnrollment.class as any;

      if (!student || !classInfo) continue;

      const firstEnrollmentDate = new Date(firstEnrollment.createdAt);
      
      // 计算剩余天数（30天 - 已过天数）
      const daysPassed = Math.floor((now.getTime() - firstEnrollmentDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, 30 - daysPassed);

      // 获取该学员的所有班级记录
      const studentEnrollments = (allStudentEnrollments || []).filter(
        (e: any) => e.studentId === firstEnrollment.studentId
      );

      // 累计所有班级的排课和出勤
      let totalExpectedAttendance = 0;
      const allStudentAttendances: any[] = [];

      for (const enrollment of studentEnrollments) {
        const enrollmentDate = new Date(enrollment.createdAt);
        
        // 获取该班级在学员加入后的排课
        const classSchedules = (schedules || []).filter((s: any) => {
          return s.classId === enrollment.classId && new Date(s.startTime) >= enrollmentDate;
        });

        totalExpectedAttendance += classSchedules.length;

        // 获取该学员在该班级的出勤记录
        const classAttendances = attendances.filter((a: any) => {
          return a.studentId === enrollment.studentId && 
                 a.classId === enrollment.classId &&
                 classSchedules.some((s: any) => s.id === a.scheduleId);
        });

        allStudentAttendances.push(...classAttendances);
      }

      const expectedAttendance = totalExpectedAttendance;
      const actualAttendance = allStudentAttendances.filter((a: any) => a.status === 'present').length;
      const absentCount = allStudentAttendances.filter((a: any) => a.status === 'absent').length;
      const attendanceRate = expectedAttendance > 0 
        ? Math.round((actualAttendance / expectedAttendance) * 100) 
        : 0;

      result.push({
        id: firstEnrollment.id,
        studentId: firstEnrollment.studentId,
        studentName: student.name,
        phone: student.phone || student.parentPhone,
        className: classInfo.name,
        classCode: classInfo.code,
        teacher: classInfo.teacher,
        enrollmentDate: firstEnrollment.createdAt,
        daysPassed,
        daysRemaining,
        expectedAttendance,
        actualAttendance,
        absentCount,
        attendanceRate,
      });
    }

    // 计算统计数据
    const total = result.length;
    const avgAttendanceRate = total > 0 
      ? Math.round(result.reduce((sum, s) => sum + s.attendanceRate, 0) / total)
      : 0;
    const highAttendance = result.filter(s => s.attendanceRate >= 80).length;
    const lowAttendance = result.filter(s => s.attendanceRate < 60).length;

    return {
      students: result,
      stats: {
        total,
        avgAttendanceRate,
        highAttendance,
        lowAttendance,
      },
    };
  },
};

// 流失学员管理
export const lostStudentsDB = {
  /**
   * 获取流失学员列表（status = inactive）
   */
  async list(params?: { page?: number; pageSize?: number; keyword?: string; teacherId?: string }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { page = 1, pageSize = 10, keyword = '' } = params || {};
    const teacherId = params?.teacherId;

    let query = memfire
      .from('students')
      .select(`
        *,
        enrollments:enrollments(
          id,
          status,
          class:classes(
            id,
            name,
            code,
            teacher:users(id, name)
          )
        )
      `, { count: 'exact' })
      .eq('status', 'inactive')
      .order('updatedAt', { ascending: false });

    // 搜索过滤
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    // 处理数据，提取班级和教练信息
    const processedData = (data || []).map((student: any) => {
      const activeEnrollment = student.enrollments?.find((e: any) => e.status === 'active');
      const classInfo = activeEnrollment?.class as any;
      
      return {
        ...student,
        className: classInfo?.name || '-',
        teacherName: classInfo?.teacher?.name || '-',
        teacherId: classInfo?.teacher?.id || null,
      };
    });

    let filteredData = processedData;
    if (teacherId) {
      filteredData = filteredData.filter(student => student.teacherId === teacherId);
    }

    return {
      data: filteredData,
      pagination: {
        total: teacherId ? filteredData.length : (count || 0),
        current: page,
        pageSize,
      },
    };
  },

  /**
   * 快速添加流失学员
   */
  async quickAdd(data: {
    name: string;
    deleteReason: string;
    expectedRecallDate?: string;
    organizationId?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 构建备注信息
    let notes = `删除原因:${data.deleteReason}`;
    if (data.expectedRecallDate) {
      notes += `,预计召回时间:${data.expectedRecallDate}`;
    }

    const studentData = {
      name: data.name,
      status: 'inactive',
      notes,
      organizationId: data.organizationId || 'default-org',
    };

    const { data: newStudent, error } = await memfire
      .from('students')
      .insert(studentData)
      .select()
      .single();

    if (error) throw error;
    return newStudent;
  },

  /**
   * 更新流失学员信息
   */
  async updateLostInfo(studentId: string, data: {
    deleteReason?: string;
    expectedRecallDate?: string | null;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 获取当前学员信息
    const { data: student, error: fetchError } = await memfire
      .from('students')
      .select('notes')
      .eq('id', studentId)
      .single();

    if (fetchError) throw fetchError;

    // 解析并更新备注
    let notes = student?.notes || '';
    
    if (data.deleteReason !== undefined) {
      // 更新删除原因
      if (notes.includes('删除原因:')) {
        notes = notes.replace(/删除原因:[^,]*/, `删除原因:${data.deleteReason}`);
      } else {
        notes = `删除原因:${data.deleteReason}${notes ? ',' + notes : ''}`;
      }
    }

    if (data.expectedRecallDate !== undefined) {
      if (data.expectedRecallDate === null) {
        // 清除召回时间
        notes = notes.replace(/,?预计召回时间:[^,]*/g, '');
      } else {
        // 更新召回时间
        if (notes.includes('预计召回时间:')) {
          notes = notes.replace(/预计召回时间:[^,]*/, `预计召回时间:${data.expectedRecallDate}`);
        } else {
          notes += `,预计召回时间:${data.expectedRecallDate}`;
        }
      }
    }

    const { data: updatedStudent, error } = await memfire
      .from('students')
      .update({ notes })
      .eq('id', studentId)
      .select()
      .single();

    if (error) throw error;
    return updatedStudent;
  },

  /**
   * 召回学员（将状态改为active）
   */
  async recall(studentId: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('students')
      .update({ status: 'active' })
      .eq('id', studentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 将活跃学员标记为流失（从现有学员中选择）
   * - 更新学员状态为inactive
   * - 取消所有活跃的班级报名
   * - 记录流失原因和预计召回时间
   */
  async markAsLost(data: {
    studentId: string;
    deleteReason: string;
    expectedRecallDate?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 1. 构建备注信息
    let notes = `删除原因:${data.deleteReason}`;
    if (data.expectedRecallDate) {
      notes += `,预计召回时间:${data.expectedRecallDate}`;
    }

    // 2. 更新学员状态为inactive（使用 studentsDB.update 以自动更新 updatedAt）
    await studentsDB.update(data.studentId, { 
      status: 'inactive',
      notes,
    });

    // 3. 取消该学员所有活跃的班级报名
    const { error: enrollmentError } = await memfire
      .from('enrollments')
      .update({ status: 'cancelled' })
      .eq('studentId', data.studentId)
      .eq('status', 'active');

    if (enrollmentError) throw enrollmentError;

    return { success: true };
  },
};

// 线索管理（营销鱼池）- 简化版
export const leadsDB = {
  /**
   * 获取当前用户的机构ID
   * 如果用户没有关联机构，则使用默认机构或创建一个
   */
  async getOrganizationId(): Promise<string> {
    const { useAuthStore } = await import('../store/authStore');
    const currentUser = useAuthStore.getState().user;
    
    // 1. 先检查 store 中是否有 organizationId
    if (currentUser?.organizationId) {
      return currentUser.organizationId;
    }

    // 2. 尝试从 users 表获取
    if (currentUser?.id && memfire) {
      try {
        const { data: userData } = await memfire
          .from('users')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle();
        
        if (userData) {
          const orgId = userData.organizationId;
          if (orgId) {
            // 更新 store
            useAuthStore.setState({
              user: { ...currentUser, organizationId: orgId },
            });
            return orgId;
          }
        }
      } catch (e) {
        console.warn('获取用户机构信息失败:', e);
      }
    }

    // 3. 查找或创建默认机构
    if (memfire) {
      try {
        // 先查找是否有默认机构
        const { data: existingOrg } = await memfire
          .from('organizations')
          .select('id')
          .eq('code', 'DEFAULT')
          .maybeSingle();

        if (existingOrg?.id) {
          // 更新用户的机构关联
          if (currentUser?.id) {
            await memfire
              .from('users')
              .update({ organizationId: existingOrg.id })
              .eq('id', currentUser.id);
            
            useAuthStore.setState({
              user: { ...currentUser, organizationId: existingOrg.id },
            });
          }
          return existingOrg.id;
        }

        // 创建默认机构
        const { data: newOrg, error: createError } = await memfire
          .from('organizations')
          .insert({
            name: '默认机构',
            code: 'DEFAULT',
            isActive: true,
          })
          .select()
          .single();

        if (createError) {
          console.error('创建默认机构失败:', createError);
          throw new Error('无法创建默认机构');
        }

        // 更新用户的机构关联
        if (currentUser?.id && newOrg?.id) {
          await memfire
            .from('users')
            .update({ organizationId: newOrg.id })
            .eq('id', currentUser.id);
          
          useAuthStore.setState({
            user: { ...currentUser, organizationId: newOrg.id },
          });
          }

        return newOrg.id;
      } catch (e) {
        console.error('处理机构信息失败:', e);
      }
    }

      throw new Error('未获取到机构信息，请确保用户已关联机构。请重新登录或联系管理员。');
  },

  /**
   * 获取线索列表
   * 权限控制：
   * - admin/manager 角色可以看到所有线索
   * - teacher/staff 等角色只能看到自己负责的线索
   */
  async list(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    assigneeId?: string; // 可选：按负责人筛选
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    
    // 获取当前用户信息，用于权限控制
    const { useAuthStore } = await import('../store/authStore');
    const currentUser = useAuthStore.getState().user;
    const userRole = currentUser?.role || '';
    const userId = currentUser?.id;

    const { 
      page = 1, 
      pageSize = 10, 
      search = '',
      assigneeId,
    } = params || {};

    let query = memfire
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('organizationId', organizationId)
      .order('createdAt', { ascending: false });

    // 权限控制：非管理员只能看到自己负责的线索
    const isAdmin = ['admin', 'super_admin'].includes(userRole);
    if (!isAdmin && userId) {
      // 普通员工只能看到分配给自己的线索，或者未分配的线索
      query = query.or(`assigneeId.eq.${userId},assigneeId.is.null`);
    }

    // 按负责人筛选（管理员可用）
    if (assigneeId) {
      query = query.eq('assigneeId', assigneeId);
    }

    // 搜索
    if (search) {
      query = query.or(`customerName.ilike.%${search}%,contact.ilike.%${search}%`);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('获取线索列表失败:', error);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('leads 表不存在，请先在 MemFire Cloud 中创建该表');
        return {
          data: [],
          pagination: { total: 0, current: page, pageSize },
        };
      }
      throw error;
    }

    return {
      data: data || [],
      pagination: {
        total: count || 0,
        current: page,
        pageSize,
      },
    };
  },

  /**
   * 创建线索
   */
  async create(data: {
    customerName: string;
    age?: number;
    contact: string;
    notes?: string;
    assigneeId?: string;
    assigneeName?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();

    const { data: newLead, error } = await memfire
      .from('leads')
      .insert({
        organizationId,
        customerName: data.customerName,
        age: data.age || null,
        contact: data.contact,
        notes: data.notes || null,
        assigneeId: data.assigneeId || null,
        assigneeName: data.assigneeName || null,
      })
      .select()
      .single();

    if (error) {
      console.error('创建线索失败:', error);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        throw new Error('leads 表不存在，请先在 MemFire Cloud SQL Editor 中执行 create_leads_table.sql');
      }
      throw error;
    }

    return newLead;
  },

  /**
   * 更新线索
   */
  async update(id: string, data: {
    customerName?: string;
    age?: number;
    contact?: string;
    notes?: string;
    lastContactAt?: string;
    assigneeId?: string;
    assigneeName?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const updateData: any = {};
    if (data.customerName !== undefined) updateData.customerName = data.customerName;
    if (data.age !== undefined) updateData.age = data.age;
    if (data.contact !== undefined) updateData.contact = data.contact;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.lastContactAt !== undefined) updateData.lastContactAt = data.lastContactAt;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.assigneeName !== undefined) updateData.assigneeName = data.assigneeName;

    const { data: updatedLead, error } = await memfire
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updatedLead;
  },

  /**
   * 更新最近联系时间
   */
  async updateLastContactTime(id: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data: updatedLead, error } = await memfire
      .from('leads')
      .update({
        lastContactAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updatedLead;
  },

  /**
   * 删除线索
   */
  async delete(id: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { error } = await memfire
      .from('leads')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  },
};

// 增课日志
export const lessonLogsDB = {
  async getOrganizationId(): Promise<string> {
    return leadsDB.getOrganizationId();
  },

  async create(data: {
    studentId: string;
    studentName: string;
    type: 'add' | 'deduct';
    lessons: number;
    notes?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    const { useAuthStore } = await import('../store/authStore');
    const currentUser = useAuthStore.getState().user;

    const payload = {
      organizationId,
      studentId: data.studentId,
      studentName: data.studentName,
      type: data.type,
      lessons: data.lessons,
      notes: data.notes || null,
      operatorId: currentUser?.id || null,
      operatorName: currentUser?.name || null,
    };

    const { data: newLog, error } = await memfire
      .from('lesson_logs')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return newLog;
  },

  async list(params?: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    type?: 'add' | 'deduct';
    studentId?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    const {
      page = 1,
      pageSize = 10,
      startDate,
      endDate,
      type,
      studentId,
    } = params || {};

    let query = memfire
      .from('lesson_logs')
      .select('*', { count: 'exact' })
      .eq('organizationId', organizationId)
      .order('createdAt', { ascending: false });

    if (startDate) {
      query = query.gte('createdAt', startDate);
    }
    if (endDate) {
      query = query.lte('createdAt', endDate);
    }
    if (type) {
      query = query.eq('type', type);
    }
    if (studentId) {
      query = query.eq('studentId', studentId);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      data: data || [],
      pagination: {
        total: count || 0,
        current: page,
        pageSize,
      },
    };
  },
};

// 体验课管理
export const experienceLessonsDB = {
  /**
   * 获取当前用户的机构ID（复用 leadsDB 的逻辑）
   */
  async getOrganizationId(): Promise<string> {
    return leadsDB.getOrganizationId();
  },

  /**
   * 获取体验课列表
   */
    async list(params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      startDate?: string;
      endDate?: string;
      assigneeId?: string;
      teachingTeacherId?: string;
      excludeConverted?: boolean;
    }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    
    // 获取当前用户信息，用于权限控制
    const { useAuthStore } = await import('../store/authStore');
    const currentUser = useAuthStore.getState().user;
    const userRole = currentUser?.role || '';
    const userId = currentUser?.id;

    const { 
      page = 1, 
      pageSize = 10, 
      status,
      startDate,
      endDate,
      assigneeId,
    } = params || {};

    let query = memfire
      .from('experience_lessons')
      .select('*', { count: 'exact' })
      .eq('organizationId', organizationId)
      .order('scheduleDate', { ascending: false })
      .order('createdAt', { ascending: false });

    // 权限控制：非管理员只能看到自己负责的体验课
    const isAdmin = ['admin', 'super_admin'].includes(userRole);
    if (!isAdmin && userId) {
      query = query.or(`assigneeId.eq.${userId},assigneeId.is.null`);
    }

    // 按状态筛选
    if (status) {
      query = query.eq('status', status);
    }

    if (params?.excludeConverted) {
      query = query.neq('status', 'converted');
    }

    if (params?.teachingTeacherId) {
      query = query.eq('teachingTeacherId', params.teachingTeacherId);
    }

    // 按日期范围筛选
    if (startDate) {
      query = query.gte('scheduleDate', startDate);
    }
    if (endDate) {
      query = query.lte('scheduleDate', endDate);
    }

    // 按负责人筛选
    if (assigneeId) {
      query = query.eq('assigneeId', assigneeId);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('获取体验课列表失败:', error);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('experience_lessons 表不存在，请先创建');
        return {
          data: [],
          pagination: { total: 0, current: page, pageSize },
        };
      }
      throw error;
    }

    return {
      data: data || [],
      pagination: {
        total: count || 0,
        current: page,
        pageSize,
      },
    };
  },

  /**
   * 创建体验课
   */
  async create(data: {
    studentName: string;
    age?: number;
    contact: string;
    source?: string;
    leadId?: string;
    classId?: string;
    className?: string;
    scheduleDate: string;
    startTime?: string;
    endTime?: string;
    teachingTeacherId?: string;
    teachingTeacherName?: string;
    assigneeId?: string;
    assigneeName?: string;
    status?: string;
    notes?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();

    const { data: newLesson, error } = await memfire
      .from('experience_lessons')
      .insert({
        organizationId,
        studentName: data.studentName,
        age: data.age || null,
        contact: data.contact,
        source: data.source || null,
        leadId: data.leadId || null,
        classId: data.classId || null,
        className: data.className || null,
        scheduleDate: data.scheduleDate,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        teachingTeacherId: data.teachingTeacherId || null,
        teachingTeacherName: data.teachingTeacherName || null,
        assigneeId: data.assigneeId || null,
        assigneeName: data.assigneeName || null,
        status: data.status || 'pending',
        notes: data.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('创建体验课失败:', error);
      throw error;
    }

    return newLesson;
  },

  /**
   * 从鱼池线索创建体验课
   */
  async createFromLead(leadId: string, scheduleData: {
    classId?: string;
    className?: string;
    scheduleDate: string;
    startTime?: string;
    endTime?: string;
    teachingTeacherId?: string;
    teachingTeacherName?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 先获取线索信息
    const { data: lead, error: leadError } = await memfire
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError) throw leadError;
    if (!lead) throw new Error('线索不存在');

    // 创建体验课
    return this.create({
      studentName: lead.customerName,
      age: lead.age,
      contact: lead.contact,
      leadId: lead.id,
      assigneeId: lead.assigneeId,
      assigneeName: lead.assigneeName,
      ...scheduleData,
    });
  },

  /**
   * 更新体验课
   */
  async update(id: string, data: {
    studentName?: string;
    age?: number;
    contact?: string;
    source?: string;
    classId?: string;
    className?: string;
    scheduleDate?: string;
    startTime?: string;
    endTime?: string;
    teachingTeacherId?: string;
    teachingTeacherName?: string;
    assigneeId?: string;
    assigneeName?: string;
    status?: string;
    notes?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const updateData: any = { ...data, updatedAt: new Date().toISOString() };

    const { data: updatedLesson, error } = await memfire
      .from('experience_lessons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updatedLesson;
  },

  /**
   * 更新体验课状态
   */
  async updateStatus(id: string, status: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const updateData: any = { 
      status, 
      updatedAt: new Date().toISOString(),
    };

    // 如果是成单状态，记录成单时间
    if (status === 'converted') {
      updateData.convertedAt = new Date().toISOString();
    }

    const { data: updatedLesson, error } = await memfire
      .from('experience_lessons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updatedLesson;
  },

  /**
   * 删除体验课
   */
  async delete(id: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { error } = await memfire
      .from('experience_lessons')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  },

  /**
   * 获取未成单的体验课（用于回访）
   */
  async listUnconverted(params?: { page?: number; pageSize?: number }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    const { page = 1, pageSize = 10 } = params || {};

    let query = memfire
      .from('experience_lessons')
      .select('*', { count: 'exact' })
      .eq('organizationId', organizationId)
      .eq('status', 'unconverted')
      .order('scheduleDate', { ascending: false });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      data: data || [],
      pagination: {
        total: count || 0,
        current: page,
        pageSize,
      },
    };
  },

  /**
   * 统计教练转化率
   */
  async teacherConversionStats(params?: {
    teachingTeacherId?: string;
    assigneeId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    const { teachingTeacherId, assigneeId, startDate, endDate } = params || {};

    let query = memfire
      .from('experience_lessons')
      .select('teachingTeacherId, teachingTeacherName, assigneeId, assigneeName, status, scheduleDate')
      .eq('organizationId', organizationId);

    if (teachingTeacherId) {
      query = query.eq('teachingTeacherId', teachingTeacherId);
    }
    if (assigneeId) {
      query = query.eq('assigneeId', assigneeId);
    }
    if (startDate) {
      query = query.gte('scheduleDate', startDate);
    }
    if (endDate) {
      query = query.lte('scheduleDate', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;

    const map: Record<string, { teacherId: string; teacherName: string; responsible?: string; total: number; converted: number }> = {};
    (data || []).forEach((item: any) => {
      const teacherId = item.teachingTeacherId || 'unknown';
      if (!map[teacherId]) {
        map[teacherId] = {
          teacherId,
          teacherName: item.teachingTeacherName || '未分配教练',
          responsible: item.assigneeName || '未分配',
          total: 0,
          converted: 0,
        };
      }
      map[teacherId].total += 1;
      if (item.status === 'converted') {
        map[teacherId].converted += 1;
      }
    });

    return Object.values(map).map((row) => ({
      ...row,
      conversionRate: row.total > 0 ? Math.round((row.converted / row.total) * 100) : 0,
    }));
  },
};

// 成单信息管理
export const conversionsDB = {
  /**
   * 获取当前用户的机构ID
   */
  async getOrganizationId(): Promise<string> {
    return leadsDB.getOrganizationId();
  },

  /**
   * 获取成单列表
   */
  async list(params?: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    salesId?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    
    // 获取当前用户信息，用于权限控制
    const { useAuthStore } = await import('../store/authStore');
    const currentUser = useAuthStore.getState().user;
    const userRole = currentUser?.role || '';
    const userId = currentUser?.id;

    const { 
      page = 1, 
      pageSize = 10, 
      startDate,
      endDate,
      salesId,
      studentId,
    } = params || {};

    let query = memfire
      .from('conversions')
      .select('*', { count: 'exact' })
      .eq('organizationId', organizationId)
      .order('conversionDate', { ascending: false })
      .order('createdAt', { ascending: false });

    // 权限控制：非管理员只能看到自己负责的成单
    const isAdmin = ['admin', 'super_admin'].includes(userRole);
    if (!isAdmin && userId) {
      query = query.or(`salesId.eq.${userId},salesId.is.null`);
    }

    // 按日期范围筛选
    if (startDate) {
      query = query.gte('conversionDate', startDate);
    }
    if (endDate) {
      query = query.lte('conversionDate', endDate);
    }

    // 按销售筛选
    if (salesId) {
      query = query.eq('salesId', salesId);
    }

    if (studentId) {
      query = query.eq('studentId', studentId);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('获取成单列表失败:', error);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('conversions 表不存在，请先创建');
        return {
          data: [],
          pagination: { total: 0, current: page, pageSize },
        };
      }
      throw error;
    }

    return {
      data: data || [],
      pagination: {
        total: count || 0,
        current: page,
        pageSize,
      },
    };
  },


  /**
   * 创建成单记录（同时创建学员）
   */
  async createWithStudent(data: {
    studentName: string;
    age?: number;
    gender?: string;
    contact: string;
    parentName?: string;
    address?: string;
    classId?: string;
    className?: string;
    courseType?: string;
    totalLessons?: number;
    price?: number;
    paymentMethod?: string;
    paymentStatus?: string;
    salesId?: string;
    salesName?: string;
    conversionDate?: string;
    notes?: string;
    experienceLessonId?: string;
    leadId?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    
    let finalLeadId = data.leadId;
    let finalExperienceLessonId = data.experienceLessonId;

    // 【新增】如果是直接成单（没有体验课记录），自动补充鱼池和体验课记录
    // 这样可以保证数据统计的完整性：添加数、到场数、成单数都会正确统计
    if (!data.experienceLessonId && data.courseType !== '续费') {
      try {
        // 1. 创建鱼池记录（如果没有leadId）
        if (!finalLeadId) {
          const { data: newLead, error: leadError } = await memfire
            .from('leads')
            .insert({
              organizationId,
              customerName: data.studentName,
              age: data.age || null,
              contact: data.contact,
              notes: data.notes ? `直接成单：${data.notes}` : '直接成单',
              assigneeId: data.salesId || null,
              assigneeName: data.salesName || null,
            })
            .select()
            .single();

          if (leadError) {
            console.warn('自动创建鱼池记录失败:', leadError);
          } else {
            finalLeadId = newLead?.id;
          }
        }

        // 2. 创建体验课记录（状态直接为 converted）
        const conversionDate = data.conversionDate || new Date().toISOString().split('T')[0];
        const { data: newExperienceLesson, error: experienceError } = await memfire
          .from('experience_lessons')
          .insert({
            organizationId,
            studentName: data.studentName,
            age: data.age || null,
            contact: data.contact,
            source: '直接成单',
            leadId: finalLeadId || null,
            classId: data.classId || null,
            className: data.className || null,
            scheduleDate: conversionDate, // 使用成单日期作为体验课日期
            assigneeId: data.salesId || null,
            assigneeName: data.salesName || null,
            status: 'converted', // 直接标记为已成单
            notes: '直接成单（自动补充记录）',
            convertedAt: new Date().toISOString(),
          })
          .select()
          .single();

        if (experienceError) {
          console.warn('自动创建体验课记录失败:', experienceError);
        } else {
          finalExperienceLessonId = newExperienceLesson?.id;
        }
      } catch (e) {
        console.warn('自动补充鱼池和体验课记录失败:', e);
      }
    }

    // 3. 创建学员记录
    const studentData = {
      organizationId,
      name: data.studentName,
      age: data.age || null,
      gender: data.gender || null,
      phone: data.contact,
      parentName: data.parentName || null,
      parentPhone: data.contact, // 默认与联系方式相同
      address: data.address || null,
      status: 'active',
      remainingLessons: data.totalLessons || 0,
      source: data.experienceLessonId ? 'experience' : 'direct', // 来源标记
    };

    const { data: newStudent, error: studentError } = await memfire
      .from('students')
      .insert(studentData)
      .select()
      .single();

    if (studentError) {
      console.error('创建学员失败:', studentError);
      throw new Error('创建学员失败: ' + studentError.message);
    }

    // 4. 创建成单记录
    const conversionData = {
      organizationId,
      studentName: data.studentName,
      age: data.age || null,
      gender: data.gender || null,
      contact: data.contact,
      parentName: data.parentName || null,
      address: data.address || null,
      classId: data.classId || null,
      className: data.className || null,
      courseType: data.courseType || null,
      totalLessons: data.totalLessons || null,
      price: data.price || null,
      paymentMethod: data.paymentMethod || null,
      paymentStatus: data.paymentStatus || 'paid',
      salesId: data.salesId || null,
      salesName: data.salesName || null,
      conversionDate: data.conversionDate || new Date().toISOString().split('T')[0],
      notes: data.notes || null,
      experienceLessonId: finalExperienceLessonId || null, // 使用自动创建的体验课ID
      leadId: finalLeadId || null, // 使用自动创建的鱼池ID
      studentId: newStudent.id, // 关联学员ID
    };

    const { data: newConversion, error: conversionError } = await memfire
      .from('conversions')
      .insert(conversionData)
      .select()
      .single();

    if (conversionError) {
      console.error('创建成单记录失败:', conversionError);
      // 如果成单记录创建失败，可能需要回滚学员（这里简化处理）
      throw new Error('创建成单记录失败: ' + conversionError.message);
    }

    // 5. 如果选择了班级，创建报名记录
    if (data.classId && newStudent.id) {
      try {
        await memfire
          .from('enrollments')
          .insert({
            organizationId,
            studentId: newStudent.id,
            classId: data.classId,
            status: 'active',
            enrolledAt: new Date().toISOString(),
          });
      } catch (e) {
        console.warn('创建报名记录失败:', e);
      }
    }

    return {
      conversion: newConversion,
      student: newStudent,
      lead: finalLeadId ? { id: finalLeadId } : null,
      experienceLesson: finalExperienceLessonId ? { id: finalExperienceLessonId } : null,
    };
  },

  async teacherConversionStats(params?: {
    teachingTeacherId?: string;
    assigneeId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    const { teachingTeacherId, assigneeId, startDate, endDate } = params || {};

    let query = memfire
      .from('experience_lessons')
      .select('teachingTeacherId, teachingTeacherName, assigneeId, assigneeName, status, scheduleDate')
      .eq('organizationId', organizationId);

    if (teachingTeacherId) {
      query = query.eq('teachingTeacherId', teachingTeacherId);
    }
    if (assigneeId) {
      query = query.eq('assigneeId', assigneeId);
    }
    if (startDate) {
      query = query.gte('scheduleDate', startDate);
    }
    if (endDate) {
      query = query.lte('scheduleDate', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;

    const map: Record<string, { teacherId: string; teacherName: string; responsible?: string; total: number; converted: number }> = {};
    (data || []).forEach((item: any) => {
      const teacherId = item.teachingTeacherId || 'unknown';
      if (!map[teacherId]) {
        map[teacherId] = {
          teacherId,
          teacherName: item.teachingTeacherName || '未分配教练',
          responsible: item.assigneeName || '未分配',
          total: 0,
          converted: 0,
        };
      }
      map[teacherId].total += 1;
      if (item.status === 'converted') {
        map[teacherId].converted += 1;
      }
    });

    return Object.values(map).map((row) => ({
      ...row,
      conversionRate: row.total > 0 ? Math.round((row.converted / row.total) * 100) : 0,
    }));
  },

  /**
   * 更新成单记录
   */
  async update(id: string, data: {
    studentName?: string;
    age?: number;
    gender?: string;
    contact?: string;
    parentName?: string;
    address?: string;
    classId?: string;
    className?: string;
    courseType?: string;
    totalLessons?: number;
    price?: number;
    paymentMethod?: string;
    paymentStatus?: string;
    salesId?: string;
    salesName?: string;
    conversionDate?: string;
    notes?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data: updatedConversion, error } = await memfire
      .from('conversions')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updatedConversion;
  },

  /**
   * 删除成单记录
   */
  async delete(id: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { error } = await memfire
      .from('conversions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * 创建续费记录（不创建新学员，只更新课时）
   */
  async createRenewal(data: {
    studentName: string;
    age?: number;
    gender?: string;
    contact: string;
    parentName?: string;
    classId?: string;
    className?: string;
    totalLessons?: number;
    price?: number;
    paymentMethod?: string;
    paymentStatus?: string;
    salesId?: string;
    salesName?: string;
    conversionDate?: string;
    notes?: string;
    existingStudentId?: string;
  }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();

    const conversionData = {
      organizationId,
      studentName: data.studentName,
      age: data.age || null,
      gender: data.gender || null,
      contact: data.contact,
      parentName: data.parentName || null,
      classId: data.classId || null,
      className: data.className || null,
      courseType: '续费',
      totalLessons: data.totalLessons || null,
      price: data.price || null,
      paymentMethod: data.paymentMethod || null,
      paymentStatus: data.paymentStatus || 'paid',
      salesId: data.salesId || null,
      salesName: data.salesName || null,
      conversionDate: data.conversionDate || new Date().toISOString().split('T')[0],
      notes: data.notes || null,
      studentId: data.existingStudentId || null, // 关联已有学员
    };

    const { data: newConversion, error } = await memfire
      .from('conversions')
      .insert(conversionData)
      .select()
      .single();

    if (error) {
      console.error('创建续费记录失败:', error);
      throw new Error('创建续费记录失败: ' + error.message);
    }

    return newConversion;
  },

  /**
   * 获取成单统计
   */
  async getStats(params?: { startDate?: string; endDate?: string }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    const { startDate, endDate } = params || {};

    let query = memfire
      .from('conversions')
      .select('price, paymentStatus')
      .eq('organizationId', organizationId);

    if (startDate) {
      query = query.gte('conversionDate', startDate);
    }
    if (endDate) {
      query = query.lte('conversionDate', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats = {
      totalCount: data?.length || 0,
      totalAmount: data?.reduce((sum, item) => sum + (item.price || 0), 0) || 0,
      paidCount: data?.filter(item => item.paymentStatus === 'paid').length || 0,
      pendingCount: data?.filter(item => item.paymentStatus === 'pending').length || 0,
    };

    return stats;
  },
};

// 现金流收入总结
export const cashflowSummaryDB = {
  async getOrganizationId(): Promise<string> {
    return leadsDB.getOrganizationId();
  },

  /**
   * 获取现金流收入总结数据
   */
  async getSummary(params?: { startDate?: string; endDate?: string; staffId?: string }) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const organizationId = await this.getOrganizationId();
    const { startDate, endDate, staffId } = params || {};

    // 1. 新签板块数据
    // 添加数（线索数）- 时间段内鱼池表新增数量
    let leadsQuery = memfire
      .from('leads')
      .select('id', { count: 'exact' })
      .eq('organizationId', organizationId);
    
    if (startDate) leadsQuery = leadsQuery.gte('createdAt', startDate);
    if (endDate) leadsQuery = leadsQuery.lte('createdAt', endDate);
    if (staffId) leadsQuery = leadsQuery.eq('assigneeId', staffId);
    
    const { count: totalLeads } = await leadsQuery;

    // 到场数 - 体验课表中已上课的学员（排除待上课、已取消、没有状态的）
    // 只统计：completed（已完成）、converted（已成单）、unconverted（未成单）
    let experienceQuery = memfire
      .from('experience_lessons')
      .select('id', { count: 'exact' })
      .eq('organizationId', organizationId)
      .in('status', ['completed', 'converted', 'unconverted']);
    
    if (startDate) experienceQuery = experienceQuery.gte('scheduleDate', startDate);
    if (endDate) experienceQuery = experienceQuery.lte('scheduleDate', endDate);
    if (staffId) experienceQuery = experienceQuery.eq('assigneeId', staffId);
    
    const { count: attendedExperience } = await experienceQuery;

    // 成单数 - 成单信息表中除续费外的新增
    // 即：查询 conversions 表中 courseType 不为 '续费' 的记录
    let conversionsQuery = memfire
      .from('conversions')
      .select('id', { count: 'exact' })
      .eq('organizationId', organizationId)
      .or('courseType.neq.续费,courseType.is.null');
    
    if (startDate) conversionsQuery = conversionsQuery.gte('conversionDate', startDate);
    if (endDate) conversionsQuery = conversionsQuery.lte('conversionDate', endDate);
    if (staffId) conversionsQuery = conversionsQuery.eq('salesId', staffId);
    
    const { count: conversions } = await conversionsQuery;

    // 成单率 = 成单数 / 到场数
    const conversionRate = attendedExperience && attendedExperience > 0
      ? Math.round((conversions || 0) / attendedExperience * 100)
      : 0;

    // 2. 续费板块数据
    // 续费数和续费金额
    let renewalQuery = memfire
      .from('conversions')
      .select('id, price, totalLessons, studentId, salesId', { count: 'exact' })
      .eq('organizationId', organizationId)
      .eq('courseType', '续费');
    
    if (startDate) renewalQuery = renewalQuery.gte('conversionDate', startDate);
    if (endDate) renewalQuery = renewalQuery.lte('conversionDate', endDate);
    if (staffId) renewalQuery = renewalQuery.eq('salesId', staffId);
    
    const { data: renewals, count: renewalCount } = await renewalQuery;

    const renewalAmount = (renewals || []).reduce((sum, r) => sum + (r.price || 0), 0);

    // 获取时间范围内续费的学员ID（去重）
    const renewedStudentIds = new Set((renewals || []).map(r => r.studentId).filter(Boolean));

    // 【修复1】查询当前待续费学员（课时<10），但排除已续费的学员，避免重复计算
    // 包括所有课时<10的学员，无论是待续费还是明确不续费的
    let lowLessonQuery = memfire
      .from('students')
      .select('id', { count: 'exact' })
      .eq('organizationId', organizationId)
      .lt('remainingLessons', 10);
    
    // 如果已续费的学员ID不为空，排除这些学员
    if (renewedStudentIds.size > 0) {
      const renewedIds = Array.from(renewedStudentIds);
      lowLessonQuery = lowLessonQuery.not('id', 'in', `(${renewedIds.join(',')})`);
    }

    const { data: lowLessonStudentsData } = await lowLessonQuery;
    
    // 【修复2】如果按教练筛选，需要进一步过滤学员
    let filteredLowLessonCount = lowLessonStudentsData?.length || 0;
    if (staffId && lowLessonStudentsData && lowLessonStudentsData.length > 0) {
      // 获取该教练负责的所有学员ID（通过成单记录）
      const { data: staffStudents } = await memfire
        .from('conversions')
        .select('studentId')
        .eq('organizationId', organizationId)
        .eq('salesId', staffId);
      
      const staffStudentIds = new Set(
        (staffStudents || []).map(s => s.studentId).filter(Boolean)
      );
      
      // 只统计该教练负责的待续费学员
      filteredLowLessonCount = lowLessonStudentsData.filter(
        student => staffStudentIds.has(student.id)
      ).length;
    }

    // 应续费总人数 = 已续费学员数 + 仍待续费学员数（避免重复计算）
    const totalEligible = renewedStudentIds.size + filteredLowLessonCount;

    // 续费率 = 已续费学员数 / 应续费总人数
    const renewalRate = totalEligible > 0
      ? Math.round((renewedStudentIds.size / totalEligible) * 100)
      : 0;

    return {
      newSignup: {
        totalLeads: totalLeads || 0,
        attendedExperience: attendedExperience || 0,
        conversions: conversions || 0,
        conversionRate,
      },
      renewal: {
        count: renewedStudentIds.size,  // 已续费学员数（去重）
        amount: renewalAmount,
        totalEligible,  // 应续费总人数
        renewalRate,
      },
    };
  },
};

// 系统设置管理
export const settingsDB = {
  /**
   * 获取配置项
   */
  async get(key: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire
      .from('settings')
      .select('*')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error('获取配置失败:', error);
      throw error;
    }
    return data;
  },

  /**
   * 设置配置项
   */
  async set(key: string, value: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    // 先检查是否存在
    const { data: existing, error: selectError } = await memfire
      .from('settings')
      .select('id')
      .eq('key', key)
      .maybeSingle();

    if (selectError) {
      console.error('检查配置是否存在失败:', selectError);
      throw selectError;
    }

    if (existing) {
      // 更新现有配置 - 使用 snake_case 列名
      const { data, error } = await memfire
        .from('settings')
        .update({ 
          value, 
          updated_at: new Date().toISOString() 
        })
        .eq('key', key)
        .select()
        .single();

      if (error) {
        console.error('更新配置失败:', error);
        throw error;
      }
      return data;
    } else {
      // 创建新配置
      const { data, error } = await memfire
        .from('settings')
        .insert({ key, value })
        .select()
        .single();

      if (error) {
        console.error('创建配置失败:', error);
        throw error;
      }
      return data;
    }
  },

  /**
   * 删除配置项
   */
  async delete(key: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { error } = await memfire
      .from('settings')
      .delete()
      .eq('key', key);

    if (error) {
      console.error('删除配置失败:', error);
      throw error;
    }
  },
};

// 导出所有数据服务
export const memfireDB = {
  students: studentsDB,
  classes: classesDB,
  enrollments: enrollmentsDB,
  schedules: schedulesDB,
  attendances: attendancesDB,
  users: usersDB,
  honeymoon: honeymoonDB,
  consumption: consumptionDB,
  lostStudents: lostStudentsDB,
  leads: leadsDB,
  lessonLogs: lessonLogsDB,
  experienceLessons: experienceLessonsDB,
  conversions: conversionsDB,
  cashflowSummary: cashflowSummaryDB,
  settings: settingsDB,
};

export default memfireDB;

