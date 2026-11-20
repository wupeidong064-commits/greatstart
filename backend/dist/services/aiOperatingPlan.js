"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.businessToday = businessToday;
exports.supportsHistoricalPeriod = supportsHistoricalPeriod;
exports.calendarTools = calendarTools;
exports.exceedsCalendarToolLimit = exceedsCalendarToolLimit;
const aiTools_1 = require("./aiTools");
const aiDataDictionary_1 = require("./aiDataDictionary");
function businessToday() {
    const day = process.env.AI_ACCEPTANCE_BUSINESS_DAY;
    if (day &&
        process.env.NODE_ENV === 'test' &&
        process.env.DATABASE_URL &&
        new URL(process.env.DATABASE_URL).pathname === '/buzzer_ai_history_v1' &&
        /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        Number.isFinite(Date.parse(day)))
        return day;
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function supportsHistoricalPeriod(tool) {
    const schema = aiTools_1.AI_TOOLS.find((def) => def.name === tool.name)?.paramsSchema;
    const domain = aiDataDictionary_1.BUSINESS_DOMAINS[tool.params.domain];
    return Boolean(schema?.startDate &&
        (tool.name !== 'business_records' || (domain?.date && tool.params.view !== 'current')));
}
/** Bind business dates before validating required tool arguments, including after a repair.
 * Model-supplied date strings have no authority over the actual database predicate. */
function calendarTools(intent, cal) {
    const bound = [];
    for (const tool of intent.tools || []) {
        const schema = aiTools_1.AI_TOOLS.find((def) => def.name === tool.name)?.paramsSchema;
        const params = { ...tool.params };
        for (const key of [
            'startDate',
            'endDate',
            'asOfDate',
            'comparisonStartDate',
            'comparisonEndDate',
        ])
            delete params[key];
        const historical = supportsHistoricalPeriod(tool);
        if (historical)
            Object.assign(params, { startDate: cal.observation.start, endDate: cal.observation.end });
        if (schema?.asOfDate)
            params.asOfDate = cal.asOfDate;
        if (schema?.comparisonStartDate && cal.comparison)
            Object.assign(params, {
                comparisonStartDate: cal.comparison.start,
                comparisonEndDate: cal.comparison.end,
            });
        bound.push({ name: tool.name, params });
        if (historical && cal.comparison && !schema?.comparisonStartDate) {
            bound.push({
                name: tool.name,
                params: { ...params, startDate: cal.comparison.start, endDate: cal.comparison.end },
            });
        }
    }
    return bound;
}
function exceedsCalendarToolLimit(tools) {
    return new Set(tools.map((t) => JSON.stringify(t))).size > aiTools_1.TOOL_LOOP_LIMIT;
}
//# sourceMappingURL=aiOperatingPlan.js.map