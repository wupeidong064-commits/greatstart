import type { Conversion, Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
type Profile = Pick<Conversion, 'studentName' | 'age' | 'gender' | 'contact' | 'parentName' | 'address' | 'notes'>;
export declare function orderProfileChanges(order: Conversion, body: Record<string, unknown>): Partial<Profile>;
export declare function applyLinkedStudentChanges(tx: Prisma.TransactionClient, req: AuthRequest, order: Conversion, changes: Partial<Profile>): Promise<void>;
export {};
//# sourceMappingURL=studentOrderProfile.d.ts.map