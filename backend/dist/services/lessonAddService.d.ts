import { Prisma } from '@prisma/client';
type LessonActor = {
    id: string;
    name?: string;
    role?: string;
    organizationId?: string;
    campusId?: string;
};
export declare function addLessonsIdempotently(actor: LessonActor, body: unknown): Promise<string | number | boolean | Prisma.JsonArray | Prisma.InputJsonObject | null>;
export {};
//# sourceMappingURL=lessonAddService.d.ts.map