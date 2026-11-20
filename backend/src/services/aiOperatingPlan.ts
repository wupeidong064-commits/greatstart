import type { AiIntent } from './aiIntent';
import type { BusinessCalendar } from './aiBusinessCalendar';
import { AI_TOOLS, PlannedToolCall, TOOL_LOOP_LIMIT } from './aiTools';
import { BUSINESS_DOMAINS, BusinessDomain } from './aiDataDictionary';

export function businessToday() {
  const day = process.env.AI_ACCEPTANCE_BUSINESS_DAY;
  if (
    day &&
    process.env.NODE_ENV === 'test' &&
    process.env.DATABASE_URL &&
    new URL(process.env.DATABASE_URL).pathname === '/buzzer_ai_history_v1' &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day))
  )
    return day;
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function supportsHistoricalPeriod(tool: PlannedToolCall) {
  const schema = AI_TOOLS.find((def) => def.name === tool.name)?.paramsSchema;
  const domain = BUSINESS_DOMAINS[tool.params.domain as BusinessDomain];
  return Boolean(
    schema?.startDate &&
    (tool.name !== 'business_records' || (domain?.date && tool.params.view !== 'current'))
  );
}

/** Bind business dates before validating required tool arguments, including after a repair.
 * Model-supplied date strings have no authority over the actual database predicate. */
export function calendarTools(intent: AiIntent, cal: BusinessCalendar): PlannedToolCall[] {
  const bound: PlannedToolCall[] = [];
  for (const tool of intent.tools || []) {
    const schema = AI_TOOLS.find((def) => def.name === tool.name)?.paramsSchema;
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
    if (schema?.asOfDate) params.asOfDate = cal.asOfDate;
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
export function exceedsCalendarToolLimit(tools: PlannedToolCall[]) {
  return new Set(tools.map((t) => JSON.stringify(t))).size > TOOL_LOOP_LIMIT;
}
