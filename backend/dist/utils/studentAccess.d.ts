import type { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
export declare const studentAccess: (req: AuthRequest, options?: {
    includeRecall?: boolean;
}) => {
    actor: {
        id: string;
        email: string | null;
        role: string;
        organizationId?: string;
        campusId?: string;
        phone?: string;
        isPlatformAdmin?: boolean;
        managementLevel?: string;
        jobRole?: string | null;
    };
    campus: {
        organizationId: string;
        campusId: string;
    };
    management: boolean;
    teacher: boolean;
    where: Prisma.StudentWhereInput;
};
//# sourceMappingURL=studentAccess.d.ts.map