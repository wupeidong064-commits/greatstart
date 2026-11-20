import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { type TodayExperience } from '../services/experienceWork';
export declare const staffWorkRoutes: import("express-serve-static-core").Router;
export declare const isEmployeeWorkRole: (role?: string) => boolean;
export declare const workDay: () => string;
export interface WorkActor {
    userId: string;
    organizationId: string;
    campusId: string;
    role: string;
}
export declare function employeeActor(req: AuthRequest): WorkActor;
export interface WorkTask {
    key: string;
    category: 'lowClasses' | 'lowStudents' | 'renewal' | 'lead' | 'experience';
    name: string;
    detail: string;
    revision: string;
    path: string;
    done: boolean;
    completedAt: string | null;
    experience?: TodayExperience;
}
/** Each query is constrained by server identity. Query-string teacher/assignee/campus never grants scope. */
export declare function buildStaffWork(actor: WorkActor, db: Prisma.TransactionClient, day?: string, unassignedTeacherIds?: string[]): Promise<{
    day: string;
    role: string;
    tasks: WorkTask[];
    todaySchedules: {
        class: {
            name: string;
        };
        id: string;
        status: string;
        classId: string;
        startTime: Date;
        endTime: Date;
        classroom: string | null;
    }[];
    progress: {
        total: number;
        completed: number;
    };
    caliber: {
        attendance: string;
        windows: string;
        renewal: string;
        completion: string;
    };
    capabilityNote: string | null;
}>;
//# sourceMappingURL=staffWork.d.ts.map