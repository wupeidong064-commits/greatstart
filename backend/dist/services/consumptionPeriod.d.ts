type Campus = {
    organizationId: string;
    campusId: string;
};
export declare function readConsumptionData(scope: Campus, start: Date, end: Date): Promise<{
    allClasses: {
        id: string;
        status: string;
        courseType: string;
        capacity: number;
    }[];
    catalog: {
        name: string;
    }[];
    students: {
        id: string;
        createdAt: Date;
        status: string;
        archivedAt: Date | null;
        renewalStatus: string | null;
        noRenewalDate: Date | null;
    }[];
    schedules: {
        id: string;
        attendances: {
            status: string;
            studentId: string;
            classId: string;
            scheduleId: string;
            isTemporary: boolean;
        }[];
        classId: string;
        startTime: Date;
        endTime: Date;
    }[];
    enrollments: {
        status: string;
        studentId: string;
        classId: string;
        endedAt: Date | null;
        enrolledAt: Date;
    }[];
    sessionNet: number;
    activityLessons: number;
    valuation: {
        bySchedule: Map<string, {
            cents: number;
            unpricedLessons: number;
        }>;
        actualConsumptionAmount: number;
        knownConsumptionAmount: number;
        unpricedConsumptionLessons: number;
        monetaryHistoryComplete: boolean;
    };
}>;
type EnrollmentWindow = {
    classId: string;
    enrolledAt: Date;
    endedAt: Date | null;
    status: string;
};
export declare function periodCourseTypes(classes: Array<{
    id: string;
    courseType: string;
}>, catalog: Array<{
    name: string;
}>, enrollments: EnrollmentWindow[], start: Date, end: Date): {
    rows: {
        name: string;
        count: number | null;
    }[];
    totalClasses: number | null;
    historyAvailable: boolean;
    note: string;
};
export {};
//# sourceMappingURL=consumptionPeriod.d.ts.map