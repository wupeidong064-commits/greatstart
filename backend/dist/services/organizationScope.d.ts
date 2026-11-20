import { Campus, Prisma, PrismaClient } from '@prisma/client';
type ScopeDatabase = PrismaClient | Prisma.TransactionClient;
export declare function resolveDefaultCampus(db: ScopeDatabase, organizationId: string): Promise<Campus>;
export declare function createDefaultCampus(db: ScopeDatabase, organizationId: string): Promise<Campus>;
export {};
//# sourceMappingURL=organizationScope.d.ts.map