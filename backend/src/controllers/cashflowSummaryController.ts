import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const cashflowSummaryController = {
  // 获取现金流总结
  getSummary: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;
      const { startDate, endDate, staffId } = req.query;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const start = startDate as string;
      const end = endDate as string;

      // ==================== 新签板块 ====================

      // 1. 获取添加数（线索）
      let leadsQuery = memfireAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organizationId', targetOrgId);

      if (start && end) {
        leadsQuery = leadsQuery.gte('createdAt', start).lte('createdAt', end);
      }

      if (staffId) {
        leadsQuery = leadsQuery.eq('assigneeId', staffId);
      }

      const { count: totalLeads } = await leadsQuery;

      // 2. 获取到场数（体验课）- 状态为 completed 表示已到场
      let experienceQuery = memfireAdmin
        .from('experience_lessons')
        .select('id', { count: 'exact', head: true })
        .eq('organizationId', targetOrgId)
        .eq('status', 'completed');

      if (start && end) {
        experienceQuery = experienceQuery.gte('scheduleDate', start).lte('scheduleDate', end);
      }

      if (staffId) {
        experienceQuery = experienceQuery.eq('assigneeId', staffId);
      }

      const { count: attendedExperience } = await experienceQuery;

      // 3. 获取成单数（转化）- 新报名（排除续费）
      // courseType 可能是：'new', '新报名', 或其他非续费值
      let conversionsQuery = memfireAdmin
        .from('conversions')
        .select('id, price, courseType')
        .eq('organizationId', targetOrgId);

      if (start && end) {
        conversionsQuery = conversionsQuery.gte('conversionDate', start).lte('conversionDate', end);
      }

      if (staffId) {
        conversionsQuery = conversionsQuery.eq('salesId', staffId);
      }

      const { data: allConversions } = await conversionsQuery;

      // 在内存中过滤：排除续费类型
      const renewalTypes = ['续费', 'renewal', '续报'];
      const newSignupConversions = (allConversions || []).filter(
        (c: any) => !renewalTypes.includes(c.courseType)
      );
      const conversionCount = newSignupConversions.length;

      // 4. 计算成单率
      // 获取体验课登记总数（包含未到场的）
      let totalExperienceQuery = memfireAdmin
        .from('experience_lessons')
        .select('id', { count: 'exact', head: true })
        .eq('organizationId', targetOrgId);

      if (start && end) {
        totalExperienceQuery = totalExperienceQuery.gte('createdAt', start).lte('createdAt', end);
      }

      if (staffId) {
        totalExperienceQuery = totalExperienceQuery.eq('assigneeId', staffId);
      }

      const { count: totalExperienceCount } = await totalExperienceQuery;
      const conversionRate = totalExperienceCount && totalExperienceCount > 0
        ? Math.round((conversionCount / totalExperienceCount) * 100)
        : 0;

      // ==================== 续费板块 ====================

      // 1. 获取续费数和金额 - 支持 '续费', 'renewal', '续报'
      let renewalQuery = memfireAdmin
        .from('conversions')
        .select('price')
        .eq('organizationId', targetOrgId)
        .in('courseType', ['续费', 'renewal', '续报']);

      if (start && end) {
        renewalQuery = renewalQuery.gte('conversionDate', start).lte('conversionDate', end);
      }

      if (staffId) {
        renewalQuery = renewalQuery.eq('salesId', staffId);
      }

      const { data: renewals } = await renewalQuery;
      const renewalCount = (renewals || []).length;
      const renewalAmount = (renewals || []).reduce((sum: number, r: any) => sum + (r.price || 0), 0);

      // 2. 获取应续费总人数（当前待续费 + 已续费）
      // 待续费：剩余课时 <= 4 的活跃学员
      const { data: activeStudents } = await memfireAdmin
        .from('students')
        .select('id, remainingLessons')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active');

      // 获取已续费学员数（在时间范围内有续费记录的）
      let renewedStudentIds: string[] = [];
      if (start && end) {
        const { data: renewedConversions } = await memfireAdmin
          .from('conversions')
          .select('studentId')
          .eq('organizationId', targetOrgId)
          .in('courseType', ['续费', 'renewal', '续报'])
          .gte('conversionDate', start)
          .lte('conversionDate', end);

        renewedStudentIds = Array.from(new Set((renewedConversions || []).map((c: any) => c.studentId as string))) as string[];
      }

      // 待续费学员（剩余课时 <= 4）
      const pendingRenewalCount = (activeStudents || []).filter(
        (s: any) => s.remainingLessons !== null && s.remainingLessons <= 4
      ).length;

      const totalEligible = pendingRenewalCount + renewedStudentIds.length;

      // 3. 计算续费率
      const renewalRate = totalEligible > 0
        ? Math.round((renewedStudentIds.length / totalEligible) * 100)
        : 0;

      // ==================== 退费板块 ====================

      // 1. 获取退费学员数（students 表中 status = 'refunded' 且 refundDate 在时间范围内）
      let refundQuery = memfireAdmin
        .from('students')
        .select('id, name, refundReason, refundDate')
        .eq('organizationId', targetOrgId)
        .eq('status', 'refunded');

      if (start && end) {
        refundQuery = refundQuery.gte('refundDate', start).lte('refundDate', end);
      }

      const { data: refundedStudents } = await refundQuery;
      const refundCount = (refundedStudents || []).length;

      // 2. 获取退费学员的成单信息（计算退费金额）
      let refundAmount = 0;
      if (refundedStudents && refundedStudents.length > 0) {
        const refundedStudentIds = refundedStudents.map((s: any) => s.id);
        const { data: refundConversions } = await memfireAdmin
          .from('conversions')
          .select('price')
          .eq('organizationId', targetOrgId)
          .in('studentId', refundedStudentIds);

        refundAmount = (refundConversions || []).reduce((sum: number, c: any) => sum + (c.price || 0), 0);
      }

      // 3. 计算退费率（退费人数 / 总成单人数）
      const totalConversionsCount = conversionCount + renewalCount;
      const refundRate = totalConversionsCount > 0
        ? Math.round((refundCount / totalConversionsCount) * 100)
        : 0;

      const summary = {
        newSignup: {
          totalLeads: totalLeads || 0,
          attendedExperience: attendedExperience || 0,
          conversions: conversionCount,
          conversionRate,
        },
        renewal: {
          count: renewalCount,
          amount: renewalAmount,
          totalEligible,
          renewalRate,
        },
        refund: {
          count: refundCount,
          amount: refundAmount,
          refundRate,
          students: refundedStudents || [],
        },
      };

      sendSuccess(res, summary);
    } catch (error) {
      next(error);
    }
  },
};
