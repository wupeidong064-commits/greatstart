import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
/** Create the whole renewal atomically; replay a keyed request only after current authorization. */
export declare function renewStudentIdempotently(req: AuthRequest): Promise<string | number | boolean | Prisma.JsonArray | Prisma.InputJsonObject | null>;
//# sourceMappingURL=renewalService.d.ts.map