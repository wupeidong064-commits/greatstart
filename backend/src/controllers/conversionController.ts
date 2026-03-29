import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const conversionController = {
  // 获取成单信息列表
  getConversions: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const studentId = req.query.studentId as string;
      const salesId = req.query.salesId as string;
      const unlinkedOnly = req.query.unlinkedOnly === 'true';

      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      let query = memfireAdmin
        .from('conversions')
        .select('*')
        .eq('organizationId', targetOrgId)
        .order('conversionDate', { ascending: false });

      // 按学员过滤
      if (studentId) {
        query = query.eq('studentId', studentId);
      }

      // 按销售过滤
      if (salesId) {
        query = query.eq('salesId', salesId);
      }

      // 只显示未关联学员的记录
      if (unlinkedOnly) {
        query = query.is('studentId', null);
      }

      // 分页
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: conversions, error } = await query;

      if (error) {
        return next(new ApiError('获取成单信息失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数
      let countQuery = memfireAdmin
        .from('conversions')
        .select('*', { count: 'exact', head: true })
        .eq('organizationId', targetOrgId);

      if (studentId) countQuery = countQuery.eq('studentId', studentId);
      if (salesId) countQuery = countQuery.eq('salesId', salesId);
      if (unlinkedOnly) countQuery = countQuery.is('studentId', null);

      const { count } = await countQuery;

      sendPaginated(res, conversions || [], page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  // 获取单条成单信息
  getConversionById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: conversion, error } = await memfireAdmin
        .from('conversions')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !conversion) {
        return next(new ApiError('成单信息不存在', 404, 'CONVERSION_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && conversion.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, conversion);
    } catch (error) {
      next(error);
    }
  },

  // 更新成单信息（主要是关联学员）
  updateConversion: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updateFields = req.body;
      const currentUser = getCurrentUser(req);

      // 获取原成单记录
      const { data: existing, error: fetchError } = await memfireAdmin
        .from('conversions')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchError || !existing) {
        return next(new ApiError('成单信息不存在', 404, 'CONVERSION_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改', 403, 'FORBIDDEN'));
      }

      // 构建更新数据
      const updateData: any = {};
      const allowedFields = ['studentId', 'studentName', 'age', 'gender', 'contact', 'parentName',
        'address', 'classId', 'className', 'courseType', 'totalLessons', 'price',
        'paymentMethod', 'paymentStatus', 'salesId', 'salesName', 'conversionDate', 'notes'];

      for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
          updateData[field] = updateFields[field];
        }
      }

      const { data: updated, error: updateError } = await memfireAdmin
        .from('conversions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return next(new ApiError('更新成单信息失败', 500, 'UPDATE_ERROR'));
      }

      // 同步更新关联的鱼池和体验课记录（姓名、联系方式变更时）
      const shouldSyncData = updateFields.studentName !== undefined || updateFields.contact !== undefined;
      if (shouldSyncData) {
        const syncData: any = {};
        if (updateFields.studentName !== undefined) {
          syncData.customerName = updateFields.studentName;
          syncData.studentName = updateFields.studentName;
        }
        if (updateFields.contact !== undefined) {
          syncData.contact = updateFields.contact;
        }

        // 同步更新关联的鱼池记录
        if (existing.leadId && Object.keys(syncData).length > 0) {
          const leadUpdateData: any = {};
          if (syncData.customerName) leadUpdateData.customerName = syncData.customerName;
          if (syncData.contact) leadUpdateData.contact = syncData.contact;

          await memfireAdmin
            .from('leads')
            .update(leadUpdateData)
            .eq('id', existing.leadId);
          console.log(`[Conversion] 同步更新鱼池记录: ${existing.leadId}`);
        }

        // 同步更新关联的体验课记录
        if (existing.experienceLessonId && Object.keys(syncData).length > 0) {
          const expUpdateData: any = {};
          if (syncData.studentName) expUpdateData.studentName = syncData.studentName;
          if (syncData.contact) expUpdateData.contact = syncData.contact;

          await memfireAdmin
            .from('experience_lessons')
            .update(expUpdateData)
            .eq('id', existing.experienceLessonId);
          console.log(`[Conversion] 同步更新体验课记录: ${existing.experienceLessonId}`);
        }
      }

      sendSuccess(res, updated, '成单信息更新成功');
    } catch (error) {
      next(error);
    }
  },

  // 创建成单记录
  createConversion: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 辅助函数：检查是否为管理员
      const isAdminOrManager = (user: any) => {
        const role = user?.role;
        return role === 'admin' || role === 'manager';
      };

      const {
        studentName, age, gender, contact, parentName, address,
        classId, className, courseType, totalLessons, price,
        paymentMethod, paymentStatus, salesId, salesName,
        conversionDate, notes, existingStudentId
      } = req.body;

      // 非管理人员只能为自己创建成单（防止翘单）
      let finalSalesId = salesId;
      let finalSalesName = salesName;

      if (!isAdminOrManager(currentUser)) {
        if (salesId && salesId !== currentUser?.id) {
          return next(new ApiError('您只能为自己创建成单记录', 403, 'FORBIDDEN'));
        }
        finalSalesId = currentUser?.id;
        // 获取用户名
        const { data: userData } = await memfireAdmin
          .from('users')
          .select('name')
          .eq('id', currentUser.id)
          .maybeSingle();
        finalSalesName = userData?.name || null;
      }

      let finalStudentId = existingStudentId;

      // 如果没有关联已有学员，需要创建新学员
      if (!finalStudentId) {
        const studentData: any = {
          organizationId: targetOrgId,
          name: studentName,
          age,
          gender,
          phone: contact,
          parentPhone: contact,
          parentName,
          address,
          campusId: currentUser?.campusId || null, // 使用当前用户的校区ID
          status: 'active',
          remainingLessons: totalLessons || 0,
        };

        const { data: newStudent, error: studentError } = await memfireAdmin
          .from('students')
          .insert(studentData)
          .select()
          .single();

        if (studentError) {
          console.error('创建学员失败:', studentError);
          console.error('学员数据:', JSON.stringify(studentData, null, 2));
          console.error('错误详情:', JSON.stringify(studentError, null, 2));
          return next(new ApiError(`创建学员失败: ${studentError.message}`, 500, 'CREATE_STUDENT_ERROR'));
        }

        finalStudentId = newStudent.id;
      }

      const conversionData: any = {
        organizationId: targetOrgId,
        studentId: finalStudentId,
        studentName,
        age,
        gender,
        contact,
        parentName,
        address,
        classId,
        className,
        courseType,
        totalLessons,
        price,
        paymentMethod,
        paymentStatus: paymentStatus || 'paid',
        salesId: finalSalesId,
        salesName: finalSalesName,
        conversionDate: conversionDate || new Date().toISOString().split('T')[0],
        notes,
        // 关联体验课和鱼池线索ID，用于后续同步更新
        experienceLessonId: req.body.experienceLessonId || null,
        leadId: req.body.leadId || null,
      };

      const { data: conversion, error } = await memfireAdmin
        .from('conversions')
        .insert(conversionData)
        .select()
        .single();

      if (error) {
        console.error('创建成单失败:', error);
        return next(new ApiError('创建成单失败', 500, 'CREATE_ERROR'));
      }

      // 如果是从体验课转化的，更新体验课状态为"已成单"
      if (req.body.experienceLessonId) {
        await memfireAdmin
          .from('experience_lessons')
          .update({ status: 'converted' })
          .eq('id', req.body.experienceLessonId);
        console.log(`体验课状态已更新为已成单: ${req.body.experienceLessonId}`);
      }

      // 如果选择了班级，自动创建报名记录（enrollment）
      if (classId && finalStudentId) {
        // 检查是否已存在该班级的报名记录
        const { data: existingEnrollment } = await memfireAdmin
          .from('enrollments')
          .select('*')
          .eq('studentId', finalStudentId)
          .eq('classId', classId)
          .maybeSingle();

        if (!existingEnrollment) {
          // 如果是续费且更换了班级，需要停用旧的报名记录
          // 支持中文和英文的 courseType 值
          if (courseType === '续费' || courseType === '续报' || courseType === 'renewal') {
            const { data: oldEnrollments } = await memfireAdmin
              .from('enrollments')
              .select('*')
              .eq('studentId', finalStudentId)
              .eq('status', 'active');

            if (oldEnrollments && oldEnrollments.length > 0) {
              // 停用所有旧的报名记录
              for (const oldEnrollment of oldEnrollments) {
                if (oldEnrollment.classId !== classId) {
                  await memfireAdmin
                    .from('enrollments')
                    .update({ status: 'completed' })
                    .eq('id', oldEnrollment.id);
                }
              }
            }
          }

          // 创建新的报名记录
          const { error: enrollmentError } = await memfireAdmin
            .from('enrollments')
            .insert({
              studentId: finalStudentId,
              classId,
              status: 'active',
              organizationId: targetOrgId,
            });

          if (enrollmentError) {
            console.error('创建报名记录失败:', enrollmentError);
            // 不中断流程，只记录错误
          } else {
            console.log(`自动创建报名记录成功: 学员=${studentName}, 班级=${className}`);
          }
        }
      }

      sendSuccess(res, conversion, '成单创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  // 删除成单记录
  deleteConversion: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      // 获取原成单记录
      const { data: existing } = await memfireAdmin
        .from('conversions')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('成单信息不存在', 404, 'CONVERSION_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('conversions')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除成单失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '成单删除成功');
    } catch (error) {
      next(error);
    }
  },

  // 关联学员到成单信息
  linkStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { conversionId, studentId } = req.body;
      const currentUser = getCurrentUser(req);

      if (!conversionId || !studentId) {
        return next(new ApiError('缺少参数', 400, 'MISSING_PARAMS'));
      }

      // 验证成单记录
      const { data: conversion } = await memfireAdmin
        .from('conversions')
        .select('*')
        .eq('id', conversionId)
        .maybeSingle();

      if (!conversion) {
        return next(new ApiError('成单信息不存在', 404, 'CONVERSION_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && conversion.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权操作', 403, 'FORBIDDEN'));
      }

      // 验证学员
      const { data: student } = await memfireAdmin
        .from('students')
        .select('id, name')
        .eq('id', studentId)
        .maybeSingle();

      if (!student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 更新成单记录
      const { data: updated, error } = await memfireAdmin
        .from('conversions')
        .update({
          studentId,
          studentName: student.name,
        })
        .eq('id', conversionId)
        .select()
        .single();

      if (error) {
        return next(new ApiError('关联学员失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '学员关联成功');
    } catch (error) {
      next(error);
    }
  },
};
