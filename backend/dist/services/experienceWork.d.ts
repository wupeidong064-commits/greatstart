import { Prisma } from '@prisma/client';
type Actor = {
    userId: string;
    organizationId: string;
    campusId: string;
    role: string;
};
export declare const experienceWorkSelect: {
    id: true;
    studentName: true;
    scheduleDate: true;
    status: true;
    updatedAt: true;
    startTime: true;
    endTime: true;
    classroom: true;
    classId: true;
    className: true;
    assigneeId: true;
    assigneeName: true;
    teachingTeacherId: true;
    teachingTeacherName: true;
    class: {
        select: {
            id: true;
            name: true;
            teacherId: true;
            organizationId: true;
            campusId: true;
            teacher: {
                select: {
                    name: true;
                };
            };
        };
    };
    scheduleId: true;
    schedule: {
        select: {
            id: true;
            classId: true;
            organizationId: true;
            campusId: true;
            teacherId: true;
            startTime: true;
            endTime: true;
            classroom: true;
            teacher: {
                select: {
                    name: true;
                };
            };
        };
    };
};
type Experience = Prisma.ExperienceLessonGetPayload<{
    select: typeof experienceWorkSelect;
}>;
export declare function experienceWorkWhere(actor: Actor, day: string): Prisma.ExperienceLessonWhereInput;
export declare function todayExperience(row: Experience, actor: Actor, day: string): {
    date: string;
    startTime: string | null;
    endTime: string | null;
    className: string;
    classroom: string | null;
    teachingTeacherName: string;
    assigneeName: string;
    teaching: boolean;
    sales: boolean;
} | undefined;
export type TodayExperience = NonNullable<ReturnType<typeof todayExperience>>;
export {};
//# sourceMappingURL=experienceWork.d.ts.map