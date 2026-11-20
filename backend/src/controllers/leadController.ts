import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import { leadCampusWhere } from '../utils/leadScope';

import { validateRecordedAge } from '../utils/studentProfileFields';
import { accessibleLead, managesRegistrations, registrationActor, requestKey, runRegistration, scopedStaff, textValue } from '../services/registrationRequestService';

// 辅助函数：检查是否为管理员
const isAdminOrManager = (user: any) => {
  const role = user?.role;
  return role === 'admin' || role === 'manager';
};

export const leadController = {
  // 获取线索列表
  getLeads: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const assigneeId = req.query.assigneeId as string;
      const status = req.query.status as string;
      const followupState = req.query.followupState || 'all';
      if (!['all', 'pending', 'converted', 'lost'].includes(String(followupState)))
        throw new ApiError('线索查看范围无效', 400, 'INVALID_FOLLOWUP_STATE');
      const search = req.query.search as string;
      const lastContactAtStart = req.query.lastContactAtStart as string;
      const lastContactAtEnd = req.query.lastContactAtEnd as string;

      const currentUser = req.user;
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const where: any = await leadCampusWhere(targetOrgId,currentUser?.campusId);
      const conditions: any[] = [];
      if (followupState === 'pending') conditions.push({ status: { notIn: ['converted', 'lost'] } });
      else if (followupState === 'converted' || followupState === 'lost') conditions.push({ status: followupState });

      // 非管理人员只能看到自己负责的线索（防止翘单）
      if (!isAdminOrManager(currentUser) && currentUser?.id) {
        where.assigneeId = currentUser.id;
      } else if (assigneeId) {
        // 管理人员可以按负责人筛选
        where.assigneeId = assigneeId;
      }

      if (status) {
        where.status = status;
      }

      // 搜索关键词（姓名或联系方式）
      if (search) {
        conditions.push({OR: [
          { customerName: { contains: search, mode: 'insensitive' } },
          { contact: { contains: search, mode: 'insensitive' } },
        ]});
      }

      // 最近联系时间范围筛选
      if (lastContactAtStart || lastContactAtEnd) {
        where.lastContactAt = {};
        if (lastContactAtStart) where.lastContactAt.gte = new Date(lastContactAtStart);
        if (lastContactAtEnd) where.lastContactAt.lte = new Date(lastContactAtEnd);
      }

      if (conditions.length) where.AND = conditions;
      const [leads, count] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.lead.count({ where }),
      ]);

      sendPaginated(res, leads || [], page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  // 获取单条线索
  getLeadById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      const lead = await prisma.lead.findFirst({ where: { id, ...await leadCampusWhere(currentUser?.organizationId,currentUser?.campusId) } });

      if (!lead) {
        return next(new ApiError('线索不存在', 404, 'NOT_FOUND'));
      }

      if (lead.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      if (!isAdminOrManager(currentUser) && lead.assigneeId !== currentUser?.id) throw new ApiError('无权访问其他人线索',403,'FORBIDDEN');
      sendSuccess(res, lead);
    } catch (error) {
      next(error);
    }
  },

  // 创建线索
  createLead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = registrationActor(req);
      const body = req.body;
      const key = requestKey(req);
      const command = {
        customerName: textValue(body.customerName, '客户姓名', true)!, age: validateRecordedAge(body.age),
        contact: textValue(body.contact, '联系方式', true)!, source: textValue(body.source, '来源'),
        notes: textValue(body.notes, '备注'),
        assigneeId: managesRegistrations(actor) ? textValue(body.assigneeId, '负责人') || actor.id : actor.id,
      };
      const result = await runRegistration({ actor, key, operation: 'lead', command,
        authorizeReplay: (tx, id) => accessibleLead(tx, actor, id),
        create: async tx => {
          const assignee = await scopedStaff(tx, actor, command.assigneeId);
          return tx.lead.create({ data: { ...command, organizationId: actor.organizationId, createdById: actor.id,
            assigneeName: assignee.name, status: 'new' } });
        },
      });
      res.set('Idempotency-Status', result.status);
      sendSuccess(res, result.data, '创建成功', result.status === 'replayed' ? 200 : 201);
    } catch (error) {
      next(error);
    }
  },

  // 更新线索
  updateLead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      const existing = await prisma.lead.findFirst({ where: { id, ...await leadCampusWhere(currentUser?.organizationId,currentUser?.campusId) } });

      if (!existing) {
        return next(new ApiError('线索不存在', 404, 'NOT_FOUND'));
      }

      // 检查数据隔离权限
      if (existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改', 403, 'FORBIDDEN'));
      }

      // 非管理人员只能修改自己负责的线索（防止翘单）
      if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
        return next(new ApiError('您只能修改自己负责的线索', 403, 'FORBIDDEN'));
      }

      // 非管理人员不能修改负责人（防止翘单）
      const allowed = ['customerName','age','contact','source','assigneeId','status','starred','notes','lastContactAt'];
      let updateData: any = Object.fromEntries(allowed.filter(key=>req.body[key] !== undefined).map(key=>[key,req.body[key]]));
      if (!isAdminOrManager(currentUser)) { delete updateData.assigneeId; delete updateData.assigneeName; }
      const actor = registrationActor(req);
      const updated = await prisma.$transaction(async tx => {
        const nextAssignee = updateData.assigneeId !== undefined ? updateData.assigneeId : existing.assigneeId;
        const nextStatus = updateData.status !== undefined ? updateData.status : existing.status;
        if (nextAssignee && !['converted','lost'].includes(nextStatus)) {
          const staff = await scopedStaff(tx, actor, nextAssignee);
          if (updateData.assigneeId !== undefined) updateData.assigneeName = staff.name;
        }
        const changed = await tx.lead.updateMany({where:{id,organizationId:actor.organizationId,assigneeId:existing.assigneeId,updatedAt:existing.updatedAt},data:updateData});
        if (!changed.count) throw new ApiError('线索已变化，请刷新后重试',409,'RESOURCE_CHANGED');
        return tx.lead.findUniqueOrThrow({where:{id}});
      });
      sendSuccess(res, updated, '更新成功');
    } catch (error) {
      next(error);
    }
  },

  // 更新最近联系时间
  updateLastContactTime: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      const existing = await prisma.lead.findFirst({ where: { id, ...await leadCampusWhere(currentUser?.organizationId,currentUser?.campusId) } });

      if (!existing) {
        return next(new ApiError('线索不存在', 404, 'NOT_FOUND'));
      }

      // 检查数据隔离权限
      if (existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改', 403, 'FORBIDDEN'));
      }

      // 非管理人员只能更新自己负责的线索（防止翘单）
      if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
        return next(new ApiError('您只能更新自己负责的线索', 403, 'FORBIDDEN'));
      }

      const updated = await prisma.$transaction(async tx => {
        const changed = await tx.lead.updateMany({
          where: { id, organizationId: existing.organizationId, assigneeId: existing.assigneeId, updatedAt: existing.updatedAt },
          data: { lastContactAt: new Date() },
        });
        if (changed.count !== 1) throw new ApiError('线索已被修改或移交，请刷新后重试', 409, 'RESOURCE_CHANGED');
        return tx.lead.findUniqueOrThrow({ where: { id } });
      });

      sendSuccess(res, updated, '更新成功');
    } catch (error) {
      next(error);
    }
  },

  // 删除线索
  deleteLead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      const existing = await prisma.lead.findFirst({ where: { id, ...await leadCampusWhere(currentUser?.organizationId,currentUser?.campusId) } });

      if (!existing) {
        return next(new ApiError('线索不存在', 404, 'NOT_FOUND'));
      }

      // 检查数据隔离权限
      if (existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除', 403, 'FORBIDDEN'));
      }

      // 非管理人员只能删除自己负责的线索（防止翘单）
      if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
        return next(new ApiError('您只能删除自己负责的线索', 403, 'FORBIDDEN'));
      }

      const deleted = await prisma.lead.deleteMany({ where: { id, organizationId: existing.organizationId, assigneeId: existing.assigneeId, updatedAt: existing.updatedAt } });
      if (deleted.count !== 1) throw new ApiError('线索已被修改或移交，请刷新后重试', 409, 'RESOURCE_CHANGED');

      sendSuccess(res, null, '删除成功');
    } catch (error) {
      next(error);
    }
  },
};
