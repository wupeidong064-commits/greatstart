import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { createDefaultCampus } from '../services/organizationScope';
import { textField, validEmail } from '../services/managedUsers';

const getCurrentUser = (req: AuthRequest) => {
  return req.user;
};

export const organizationController = {
  getOrganizations: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const currentUser = getCurrentUser(req);

      if (!currentUser?.isPlatformAdmin && !currentUser?.organizationId) return sendPaginated(res, [], page, pageSize, 0);
      const where: Prisma.OrganizationWhereInput = {
        ...(!currentUser?.isPlatformAdmin ? { id: currentUser!.organizationId } : {}),
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : {}),
      };
      const [organizations, count] = await prisma.$transaction([
        prisma.organization.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.organization.count({ where }),
      ]);
      sendPaginated(res, organizations, page, pageSize, count);
    } catch (error) {
      next(error);
    }
  },

  getOrganizationById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const organization = await prisma.organization.findUnique({ where: { id } });

      if (!organization) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      // 数据隔离：非admin只能查看自己机构
      if (!currentUser?.isPlatformAdmin && organization.id !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      // 获取校区的数量
      const campuses = await prisma.campus.findMany({ where: { organizationId: id }, select: { id: true } });

      // 获取关联数据统计（简化版本）
      const result = {
        ...organization,
        campuses: campuses || [],
        _count: {
          campuses: campuses?.length || 0,
        },
      };

      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  createOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { address, phone } = req.body;
      const name = textField(req.body.name, '机构名称');
      const code = textField(req.body.code, '机构代码');
      const email = req.body.email ? validEmail(req.body.email) : null;
      const currentUser = getCurrentUser(req);

      // 只有 admin 可以创建机构
      if (!currentUser?.isPlatformAdmin) {
        return next(new ApiError('无权创建机构', 403, 'FORBIDDEN'));
      }

      // 检查代码是否已存在
      const existing = await prisma.organization.findUnique({ where: { code } });

      if (existing) {
        return next(new ApiError('机构代码已存在', 400, 'CODE_EXISTS'));
      }

      const organization = await prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({ data: { name, code, address, phone, email } });
        await createDefaultCampus(tx, created.id);
        return created;
      });

      sendSuccess(res, organization, '机构创建成功', 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return next(new ApiError('机构代码已存在', 409, 'CODE_EXISTS'));
      next(error);
    }
  },

  updateOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, address, phone, email, isActive } = req.body;
      const currentUser = getCurrentUser(req);

      // 检查机构是否存在
      const existing = await prisma.organization.findUnique({ where: { id } });

      if (!existing) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      // 数据隔离检查
      if (!currentUser?.isPlatformAdmin && existing.id !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该机构', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (address !== undefined) updateData.address = address;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await prisma.organization.update({ where: { id }, data: updateData });

      sendSuccess(res, updated, '机构更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      // 只有 admin 可以删除机构
      if (!currentUser?.isPlatformAdmin) {
        return next(new ApiError('无权删除机构', 403, 'FORBIDDEN'));
      }

      // 检查机构是否存在
      const existing = await prisma.organization.findUnique({ where: { id } });

      if (!existing) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      await prisma.organization.update({ where: { id }, data: { isActive: false } });

      sendSuccess(res, null, '机构已停用');
    } catch (error) {
      next(error);
    }
  },
};
