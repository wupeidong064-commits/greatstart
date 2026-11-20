"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usageSummary = usageSummary;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
/** Institution billing metadata only: conversation text, upload IDs and private file names are excluded. */
async function usageSummary(scope, start, end) {
    for (const value of [start, end]) {
        const d = new Date(value + 'T00:00:00Z');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(+d) ||
            d.toISOString().slice(0, 10) !== value)
            throw new errorHandler_1.ApiError('请输入真实起止日期', 400, 'INVALID_DATE');
    }
    if (start > end || Date.parse(end) - Date.parse(start) > 366 * 86400000)
        throw new errorHandler_1.ApiError('用量汇总最多查询366天', 400, 'INVALID_DATE');
    const bills = await database_1.default.aiTaskBill.findMany({
        where: {
            organizationId: scope.organizationId,
            campusId: scope.campusId,
            createdAt: {
                gte: new Date(start + 'T00:00:00+08:00'),
                lt: new Date(Date.parse(end + 'T00:00:00+08:00') + 86400000),
            },
        },
        select: {
            id: true,
            createdAt: true,
            status: true,
            reservedMicros: true,
            settledMicros: true,
            releasedMicros: true,
            usageJson: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 5001,
    });
    if (bills.length > 5000)
        throw new errorHandler_1.ApiError('任务超过5000个，请缩小日期范围', 413, 'USAGE_LIMIT');
    const days = new Map();
    const models = new Map();
    for (const bill of bills) {
        const day = new Date(+bill.createdAt + 8 * 3600000).toISOString().slice(0, 10);
        const meta = (bill.usageJson || {});
        const calls = Array.isArray(meta.calls) ? meta.calls : [];
        const known = meta.knownUsage || null;
        const synthetic = meta.synthetic === true || meta.model === 'mock-recorded-v1';
        const incomplete = meta.usageComplete !== true;
        const row = days.get(day) || {
            day,
            tasks: 0,
            modelCalls: 0,
            knownInputTokens: 0,
            knownOutputTokens: 0,
            incompleteTasks: 0,
            syntheticTasks: 0,
            reservedMicros: 0,
            settledMicros: 0,
            releasedMicros: 0,
        };
        row.tasks++;
        row.modelCalls += calls.filter((c) => c.status !== 'skipped').length;
        row.knownInputTokens += known?.promptTokens || 0;
        row.knownOutputTokens += known?.completionTokens || 0;
        row.incompleteTasks += Number(incomplete);
        row.syntheticTasks += Number(synthetic);
        row.reservedMicros += bill.reservedMicros;
        row.settledMicros += bill.settledMicros;
        row.releasedMicros += bill.releasedMicros;
        days.set(day, row);
        const name = String(meta.model || '未记录模型'), model = models.get(name) || {
            model: name,
            tasks: 0,
            calls: 0,
            knownInputTokens: 0,
            knownOutputTokens: 0,
            incompleteTasks: 0,
            synthetic,
        };
        model.tasks++;
        model.calls += calls.filter((c) => c.status !== 'skipped').length;
        model.knownInputTokens += known?.promptTokens || 0;
        model.knownOutputTokens += known?.completionTokens || 0;
        model.incompleteTasks += Number(incomplete);
        models.set(name, model);
    }
    const daily = [...days.values()];
    const totals = daily.reduce((a, row) => ({
        tasks: a.tasks + row.tasks,
        modelCalls: a.modelCalls + row.modelCalls,
        knownInputTokens: a.knownInputTokens + row.knownInputTokens,
        knownOutputTokens: a.knownOutputTokens + row.knownOutputTokens,
        incompleteTasks: a.incompleteTasks + row.incompleteTasks,
        settledMicros: a.settledMicros + row.settledMicros,
    }), {
        tasks: 0,
        modelCalls: 0,
        knownInputTokens: 0,
        knownOutputTokens: 0,
        incompleteTasks: 0,
        settledMicros: 0,
    });
    return {
        period: { start, end },
        totals: {
            ...totals,
            inputTokens: totals.incompleteTasks ? null : totals.knownInputTokens,
            outputTokens: totals.incompleteTasks ? null : totals.knownOutputTokens,
        },
        daily,
        models: [...models.values()],
        billIds: bills.map((b) => b.id),
        supplierCost: null,
        caliber: '按上海任务创建日及当前机构/校区汇总；积分按各账单价格版本；已知token单列，存在缺失时完整总量为未知；模拟与真实模型分列；预留不是消费；解析/排版/历史查看/重复下载不新增模型调用；供应商费用尚未对账',
    };
}
//# sourceMappingURL=aiUsageAudit.js.map