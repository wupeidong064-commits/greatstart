"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withUpcomingScheduleDays = withUpcomingScheduleDays;
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
/** Class names and old generation rules are not evidence of an upcoming lesson. */
async function withUpcomingScheduleDays(classes, organizationId) {
    if (!classes.length)
        return classes.map(row => ({ ...row, scheduleWeekDays: [] }));
    const days = await database_1.default.$queryRaw(client_1.Prisma.sql `
    SELECT DISTINCT s."classId",
      EXTRACT(DOW FROM ((s."startTime" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai'))::integer AS weekday
    FROM schedules s
    JOIN classes c ON c.id = s."classId"
      AND c."organizationId" = s."organizationId"
      AND c."campusId" IS NOT DISTINCT FROM s."campusId"
    WHERE s."organizationId" = ${organizationId}
      AND s."classId" IN (${client_1.Prisma.join(classes.map(row => row.id))})
      AND c.status NOT IN ('inactive', 'deleted')
      AND s.status = 'scheduled'
      AND s."endTime" >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  `);
    const byClass = new Map();
    for (const row of days)
        byClass.set(row.classId, [...(byClass.get(row.classId) || []), row.weekday]);
    return classes.map(row => ({
        ...row,
        scheduleWeekDays: (byClass.get(row.id) || []).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)),
    }));
}
//# sourceMappingURL=classScheduleDays.js.map