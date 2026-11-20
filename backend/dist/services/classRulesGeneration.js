"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertScheduleAvailable = exports.CLASS_RULES_GROUP_PREFIX = void 0;
exports.validateClassRulesRequest = validateClassRulesRequest;
exports.filterSelectedRules = filterSelectedRules;
exports.selectUpcomingOccurrences = selectUpcomingOccurrences;
exports.annotateConflicts = annotateConflicts;
exports.classRulesGroupId = classRulesGroupId;
exports.buildClassRuleSlots = buildClassRuleSlots;
const crypto_1 = require("crypto");
const errorHandler_1 = require("../middleware/errorHandler");
const scheduleConflicts_1 = require("./scheduleConflicts");
Object.defineProperty(exports, "assertScheduleAvailable", { enumerable: true, get: function () { return scheduleConflicts_1.assertScheduleAvailable; } });
const weeklyRules_1 = require("./weeklyRules");
const classWeeklyRuleStore_1 = require("./classWeeklyRuleStore");
exports.CLASS_RULES_GROUP_PREFIX = 'classrules-v1';
/** 预览与生成共用的日期/参数校验。 */
function validateClassRulesRequest(body) {
    const { classId, startDate, endDate } = body;
    if (typeof classId !== 'string' || !classId)
        throw new errorHandler_1.ApiError('请指定班级', 400, 'INVALID_PARAMS');
    const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+new Date(`${value}T00:00:00+08:00`));
    if (!validDate(startDate))
        throw new errorHandler_1.ApiError('开始日期无效，应为 YYYY-MM-DD', 400, 'INVALID_TIME');
    if (!validDate(endDate))
        throw new errorHandler_1.ApiError('结束日期无效，应为 YYYY-MM-DD', 400, 'INVALID_TIME');
    if (endDate < startDate)
        throw new errorHandler_1.ApiError('结束日期不得早于开始日期', 400, 'INVALID_TIME');
    if (body.selectedRules === undefined)
        return { classId, startDate, endDate };
    // 2026-11-07 用户拍板：多时段班级可只选部分班级时间生成/操作；所选必须与该班规则完全一致。
    if (!Array.isArray(body.selectedRules) || !body.selectedRules.length)
        throw new errorHandler_1.ApiError('请至少选择一个班级时间', 400, 'INVALID_TIME');
    const clock = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    const selectedRules = body.selectedRules.map((item) => {
        if (!item || !Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6 || !clock(item.startTime) || !clock(item.endTime)) {
            throw new errorHandler_1.ApiError('所选班级时间无效', 400, 'INVALID_TIME');
        }
        return { weekday: item.weekday, startTime: item.startTime, endTime: item.endTime };
    });
    return { classId, startDate, endDate, selectedRules };
}
/** 将所选时段对齐到班级规则子集；任何一项对不上即拒绝。 */
function filterSelectedRules(rules, selected) {
    if (!selected)
        return rules;
    const key = (rule) => `${rule.weekday}|${rule.startTime}|${rule.endTime}`;
    const classKeys = new Set(rules.map(key));
    for (const item of selected) {
        if (!classKeys.has(key(item)))
            throw new errorHandler_1.ApiError('所选时段与该班的班级时间不一致，请刷新后重选', 400, 'INVALID_TIME');
    }
    return rules.filter(rule => selected.some(item => key(item) === key(rule)));
}
/** 与生成同一套口径：按规则展开日期范围，并只保留未来场次。 */
function selectUpcomingOccurrences(rules, startDate, endDate) {
    let occurrences;
    try {
        occurrences = (0, weeklyRules_1.previewWeeklyOccurrences)(rules, startDate, endDate);
    }
    catch (error) {
        // 规则展开的失败都是用户输入问题（无效日期/跨度/无匹配），统一按 400 返回明确提示。
        throw new errorHandler_1.ApiError(error instanceof Error ? error.message : '日期范围无效', 400, 'INVALID_TIME');
    }
    const now = new Date();
    const upcoming = occurrences.filter(row => row.startTime > now);
    return { occurrences: upcoming, skippedPast: occurrences.length - upcoming.length };
}
/** 只读冲突标注：供确认前提示；生成事务内仍由 assertScheduleAvailable 逐一复核。 */
async function annotateConflicts(tx, organizationId, classData, occurrences) {
    const conflicts = [];
    if (!occurrences.length)
        return conflicts;
    const rangeStart = occurrences.reduce((min, row) => (row.startTime < min ? row.startTime : min), occurrences[0].startTime);
    const rangeEnd = occurrences.reduce((max, row) => (row.endTime > max ? row.endTime : max), occurrences[0].endTime);
    const overlapping = await tx.schedule.findMany({
        where: {
            organizationId,
            status: { notIn: ['cancelled', 'rescheduled'] },
            NOT: (0, scheduleConflicts_1.hiddenTimetableOccurrence)(),
            startTime: { lt: rangeEnd },
            endTime: { gt: rangeStart },
        },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        select: {
            id: true, classId: true, teacherId: true, campusId: true, classroom: true,
            startTime: true, endTime: true, status: true,
            class: { select: { name: true } }, teacher: { select: { name: true } },
        },
    });
    const roomOf = (classroom) => (0, scheduleConflicts_1.normalizeClassroom)(classroom);
    for (const row of occurrences) {
        for (const other of overlapping) {
            if (!(other.startTime < row.endTime && other.endTime > row.startTime))
                continue;
            const sameClass = other.classId === classData.id;
            const sameTeacher = !!classData.teacherId && other.teacherId === classData.teacherId;
            const sameRoom = !!row.classroom && other.campusId === classData.campusId
                && !!other.classroom && roomOf(other.classroom) === roomOf(row.classroom);
            if (!sameClass && !sameTeacher && !sameRoom)
                continue;
            // 完全相同的已排场次会被复用（重复确认不重复生成），不算冲突。
            const isExactReuse = sameClass && other.status === 'scheduled'
                && other.campusId === classData.campusId
                && roomOf(other.classroom) === roomOf(row.classroom)
                && +other.startTime === +row.startTime && +other.endTime === +row.endTime;
            if (isExactReuse)
                continue;
            conflicts.push({
                businessDate: row.businessDate,
                startTime: row.startTime.toISOString(),
                kind: sameClass ? '班级' : sameTeacher ? '教师' : '教室',
                withName: sameClass ? `「${other.class.name}」` : sameTeacher ? `教师「${other.teacher?.name || '未知'}」` : `教室「${other.classroom || '未命名'}」`,
            });
            break; // 每个待排场次只标注一个冲突，避免列表过长
        }
    }
    return conflicts;
}
/** 幂等组标识：同一 requestId + 同一意图 = 同一批场次。 */
function classRulesGroupId(requestId, payload) {
    return `${exports.CLASS_RULES_GROUP_PREFIX}:${requestId.toLowerCase()}:${(0, crypto_1.createHash)('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}
/** 在生成事务内读取班级时间规则并产出待写场次；调用方持有机构课表锁。 */
async function buildClassRuleSlots(tx, classId, startDate, endDate, selectedRules) {
    const allRules = await (0, classWeeklyRuleStore_1.readClassWeeklyRules)(tx, classId);
    if (!allRules.length)
        throw new errorHandler_1.ApiError('该班级还没有班级时间，请先在班级管理补充每周上课时间', 400, 'NO_CLASS_WEEKLY_RULES');
    const rules = filterSelectedRules(allRules, selectedRules);
    if (!rules.length)
        throw new errorHandler_1.ApiError('请至少选择一个班级时间', 400, 'INVALID_TIME');
    const { occurrences, skippedPast } = selectUpcomingOccurrences(rules, startDate, endDate);
    if (!occurrences.length)
        throw new errorHandler_1.ApiError('所选日期范围内没有未来的可排课场次', 400, 'NO_FUTURE_SCHEDULES');
    if (occurrences.length > 500)
        throw new errorHandler_1.ApiError('所选范围将生成超过500个场次，请缩短日期范围', 400, 'TOO_MANY_OCCURRENCES');
    return { rules, slots: occurrences, skippedPast };
}
//# sourceMappingURL=classRulesGeneration.js.map