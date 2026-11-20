type Actor = {
    id: string;
    role: string;
    organizationId?: string;
    campusId?: string;
};
export declare function deductActivityLessons(actor: Actor, body: unknown, headerKey?: string): Promise<import("@prisma/client/runtime/library").JsonValue>;
export {};
//# sourceMappingURL=activityDeductService.d.ts.map