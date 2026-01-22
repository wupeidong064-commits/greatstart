import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const campusController = {
  getCampuses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = (req.query.organizationId as string) || req.user?.organizationId;

      if (!organizationId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 数据隔离检查
      if (req.user?.role !== 'admin' && organizationId !== req.user?.organizationId) {
        return next(new ApiError('无权访问该机构数据', 403, 'FORBIDDEN'));
      }

      const campuses = await prisma.campus.findMany({
        where: {
          organizationId,
          isActive: true,
        },
        include: {
          _count: {
            select: {
              users: true,
              students: true,
              classes: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      sendSuccess(res, campuses);
    } catch (error) {
      next(error);
    }
  },

  getCampusById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const campus = await prisma.campus.findUnique({
        where: { id },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      if (!campus) {
        return next(new ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (req.user?.role !== 'admin' && campus.organizationId !== req.user?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, campus);
    } catch (error) {
      next(error);
    }
  },

  createCampus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, code, address, phone, organizationId } = req.body;

      const targetOrgId = organizationId || req.user?.organizationId;
      if (!targetOrgId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 数据隔离检查
      if (req.user?.role !== 'admin' && targetOrgId !== req.user?.organizationId) {
        return next(new ApiError('无权在该机构创建校区', 403, 'FORBIDDEN'));
      }

      // 检查代码是否已存在（在同一机构内）
      const existing = await prisma.campus.findFirst({
        where: {
          organizationId: targetOrgId,
          code,
        },
      });

      if (existing) {
        return next(new ApiError('校区代码在该机构内已存在', 400, 'CODE_EXISTS'));
      }

      const campus = await prisma.campus.create({
        data: {
          name,
          code,
          address,
          phone,
          organizationId: targetOrgId,
        },
      });

      sendSuccess(res, campus, '校区创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateCampus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, address, phone, isActive } = req.body;

      const campus = await prisma.campus.findUnique({
        where: { id },
      });

      if (!campus) {
        return next(new ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (req.user?.role !== 'admin' && campus.organizationId !== req.user?.organizationId) {
        return next(new ApiError('无权修改该校区', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (address !== undefined) updateData.address = address;
      if (phone !== undefined) updateData.phone = phone;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await prisma.campus.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '校区更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteCampus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const campus = await prisma.campus.findUnique({
        where: { id },
      });

      if (!campus) {
        return next(new ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (req.user?.role !== 'admin' && campus.organizationId !== req.user?.organizationId) {
        return next(new ApiError('无权删除该校区', 403, 'FORBIDDEN'));
      }

      await prisma.campus.delete({
        where: { id },
      });

      sendSuccess(res, null, '校区删除成功');
    } catch (error) {
      next(error);
    }
  },
};

