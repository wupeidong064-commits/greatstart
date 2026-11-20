import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';

// Leads have no campus column: ownership is derived from their scoped assignee,
// with the creator used only for unassigned legacy records.
export async function leadCampusWhere(organizationId?: string, campusId?: string) {
  if (!organizationId || !campusId) throw new ApiError('未分配机构或校区',403,'FORBIDDEN');
  const users = await prisma.user.findMany({where:{organizationId,campusId},select:{id:true}});
  const ids = users.map(u=>u.id);
  return {organizationId,OR:[{assigneeId:{in:ids}},{assigneeId:null,createdById:{in:ids}}]};
}
