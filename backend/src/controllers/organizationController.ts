import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const organizationController = {
  getOrganizations: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;

      const where: any = {};
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [organizations, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          include: {
            _count: {
              select: {
                campuses: true,
                users: true,
                students: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.organization.count({ where }),
      ]);

      sendPaginated(res, organizations, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  getOrganizationById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const organization = await prisma.organization.findUnique({
        where: { id },
        include: {
          campuses: {
            select: {
              id: true,
              name: true,
              code: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              users: true,
              students: true,
              classes: true,
            },
          },
        },
      });

      if (!organization) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      // 数据隔离：非admin只能查看自己机构
      if (req.user?.role !== 'admin' && organization.id !== req.user?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, organization);
    } catch (error) {
      next(error);
    }
  },

  createOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, code, address, phone, email } = req.body;

      // 检查代码是否已存在
      const existing = await prisma.organization.findUnique({
        where: { code },
      });

      if (existing) {
        return next(new ApiError('机构代码已存在', 400, 'CODE_EXISTS'));
      }

      const organization = await prisma.organization.create({
        data: {
          name,
          code,
          address,
          phone,
          email,
        },
      });

      sendSuccess(res, organization, '机构创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, address, phone, email, isActive } = req.body;

      const organization = await prisma.organization.findUnique({
        where: { id },
      });

      if (!organization) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (address !== undefined) updateData.address = address;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await prisma.organization.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '机构更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const organization = await prisma.organization.findUnique({
        where: { id },
      });

      if (!organization) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      await prisma.organization.delete({
        where: { id },
      });

      sendSuccess(res, null, '机构删除成功');
    } catch (error) {
      next(error);
    }
  },
};

