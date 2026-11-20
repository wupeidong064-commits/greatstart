"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readClassWeeklyRules = readClassWeeklyRules;
exports.replaceClassWeeklyRules = replaceClassWeeklyRules;
exports.generateClassCode = generateClassCode;
const errorHandler_1 = require("../middleware/errorHandler");
const weeklyRules_1 = require("./weeklyRules");
/** 读取并规范化某班的班级时间规则；无规则返回空数组。 */
async function readClassWeeklyRules(tx, classId) {
    const rows = await tx.classWeeklyRule.findMany({
        where: { classId },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(row => ({ weekday: row.weekday, startTime: row.startTime, endTime: row.endTime, classroom: row.classroom }));
}
/**
 * 全量替换班级时间规则。input === undefined 表示本次不改；null 或 [] 表示清空。
 * 只写规则表，从不读写 schedules —— 修改规则不会静默改变任何已有场次。
 * 调用方需持有机构课表锁（lockScheduleWrites）以串行化同班并发保存。
 */
async function replaceClassWeeklyRules(tx, organizationId, classId, input) {
    if (input === undefined)
        return;
    const cleaned = input === null ? [] : input;
    if (!Array.isArray(cleaned))
        throw new errorHandler_1.ApiError('班级时间格式无效', 400, 'INVALID_WEEKLY_RULES');
    // 保存班级允许清空规则（规则可以之后补充）；「至少一条」只约束按规则生成排课。
    let rules = [];
    if (cleaned.length) {
        try {
            rules = (0, weeklyRules_1.normalizeWeeklyRules)(cleaned);
        }
        catch (error) {
            throw new errorHandler_1.ApiError(error instanceof Error ? error.message : '班级时间无效', 400, 'INVALID_WEEKLY_RULES');
        }
    }
    await tx.classWeeklyRule.deleteMany({ where: { classId, organizationId } });
    if (rules.length) {
        await tx.classWeeklyRule.createMany({
            data: rules.map(rule => ({ organizationId, classId, weekday: rule.weekday, startTime: rule.startTime, endTime: rule.endTime, classroom: rule.classroom ?? null })),
        });
    }
}
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** 机构内唯一班级代码，服务端生成；调用方持有机构课表锁，同机构建班互斥。 */
async function generateClassCode(tx, organizationId) {
    for (let attempt = 0; attempt < 8; attempt++) {
        let suffix = '';
        for (let i = 0; i < 6; i++)
            suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
        const code = `CL-${suffix}`;
        if (!await tx.class.findFirst({ where: { organizationId, code }, select: { id: true } }))
            return code;
    }
    throw new errorHandler_1.ApiError('班级代码生成失败，请重试', 500, 'CODE_GENERATION_FAILED');
}
//# sourceMappingURL=classWeeklyRuleStore.js.map