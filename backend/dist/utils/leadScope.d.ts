export declare function leadCampusWhere(organizationId?: string, campusId?: string): Promise<{
    organizationId: string;
    OR: ({
        assigneeId: {
            in: string[];
        };
        createdById?: undefined;
    } | {
        assigneeId: null;
        createdById: {
            in: string[];
        };
    })[];
}>;
//# sourceMappingURL=leadScope.d.ts.map