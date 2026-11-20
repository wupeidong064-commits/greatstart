"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_FILE_DIR = void 0;
exports.parsePeriodFromText = parsePeriodFromText;
exports.createOrGetReportFileTask = createOrGetReportFileTask;
exports.generateReportFile = generateReportFile;
exports.getReportFileForActor = getReportFileForActor;
exports.retryReportFile = retryReportFile;
exports.buildFileCard = buildFileCard;
exports.verifiedReportFileBuffer = verifiedReportFileBuffer;
const aiOperatingFacts_1 = require("./aiOperatingFacts");
const aiDocumentRenderer_1 = require("./aiDocumentRenderer");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const exceljs_1 = __importDefault(require("exceljs"));
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/** 报告文件目录：可经 AI_REPORTS_DIR 指向本轮隔离目录（默认共享 backend/storage/ai-reports） */
exports.REPORT_FILE_DIR = process.env.AI_REPORTS_DIR
    ? path_1.default.resolve(process.env.AI_REPORTS_DIR)
    : path_1.default.resolve(__dirname, '../../storage/ai-reports');
/** 公式注入防护：以 = + @ 开头（或以 - 开头且后随非数字）的文本单元格前置单引号 */
function safeCellText(v) {
    const s = String(v ?? '');
    if (/^[\s]*[=+@]/.test(s) || /^[\s]*-\D/.test(s))
        return "'" + s;
    return s;
}
// ==================== 期间解析（服务端确定，模型不参与数字） ====================
/** 从自然语言解析周/月期间（上海时区；周=周一至周日）。显式日期由意图参数优先。 */
function parsePeriodFromText(text, today) {
    // 日历运算以 YYYY-MM-DD 的 UTC 表示进行，避免上海午夜落到 UTC 前一天。
    const t = new Date(today + 'T00:00:00Z');
    const fmt = (d) => d.toISOString().slice(0, 10);
    const dates = text.match(/\d{4}-\d{2}-\d{2}/g);
    if (dates?.length) {
        if (dates.length > 2)
            throw new errorHandler_1.ApiError('请只指定一个起止日期范围', 400, 'REPORT_PERIOD_INVALID');
        for (const date of dates) {
            const parsed = new Date(date + 'T00:00:00Z');
            if (!Number.isFinite(parsed.getTime()) || fmt(parsed) !== date) {
                throw new errorHandler_1.ApiError('报告日期无效，请使用真实的 YYYY-MM-DD 日期', 400, 'REPORT_PERIOD_INVALID');
            }
        }
        const start = dates[0];
        const end = dates[1] || start;
        if (start > end)
            throw new errorHandler_1.ApiError('开始日期不能晚于结束日期', 400, 'REPORT_PERIOD_INVALID');
        return { start, end };
    }
    const dow = (t.getUTCDay() + 6) % 7; // 周一=0
    if (/本周/.test(text)) {
        const mon = new Date(t.getTime() - dow * 86400000);
        const sun = new Date(mon.getTime() + 6 * 86400000);
        return { start: fmt(mon), end: fmt(sun) };
    }
    if (/上周/.test(text.replace(/上上周/g, ''))) {
        const thisMon = new Date(t.getTime() - dow * 86400000);
        const lastMon = new Date(thisMon.getTime() - 7 * 86400000);
        const lastSun = new Date(lastMon.getTime() + 6 * 86400000);
        return { start: fmt(lastMon), end: fmt(lastSun) };
    }
    if (/上上周/.test(text)) {
        const mon = new Date(t.getTime() - (dow + 14) * 86400000);
        return { start: fmt(mon), end: fmt(new Date(mon.getTime() + 6 * 86400000)) };
    }
    if (/本月|这个月/.test(text)) {
        const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
        const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
        return { start: fmt(first), end: fmt(last) };
    }
    if (/上月|上个月/.test(text)) {
        const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
        const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
        return { start: fmt(first), end: fmt(last) };
    }
    // 默认本月
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
    return { start: fmt(first), end: fmt(last) };
}
/** 同 requestId 返回原任务（不双建）；新键建 processing 任务 */
async function createOrGetReportFileTask(owner, input) {
    try {
        const row = await database_1.default.aiReportFile.create({
            data: {
                organizationId: owner.organizationId,
                campusId: owner.campusId,
                createdById: owner.userId,
                conversationId: input.conversationId,
                messageId: input.messageId,
                requestId: input.requestId,
                billId: input.billId,
                title: input.title,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                paramsJson: input.paramsJson,
                evidenceJson: input.evidenceJson,
                status: 'processing',
            },
            select: { id: true, status: true },
        });
        return { id: row.id, duplicate: false, status: row.status };
    }
    catch (err) {
        if (err?.code === 'P2002') {
            const row = await database_1.default.aiReportFile.findUnique({ where: { requestId: input.requestId } });
            if (!row)
                throw new errorHandler_1.ApiError('报告任务查询失败', 500, 'REPORT_TASK_ERROR');
            // 归属校验：同 owner 才回放原任务
            if (row.organizationId !== owner.organizationId ||
                row.createdById !== owner.userId ||
                row.campusId !== owner.campusId) {
                throw new errorHandler_1.ApiError('该请求键已被其他账号占用', 409, 'REPORT_KEY_CONFLICT');
            }
            return { id: row.id, duplicate: true, status: row.status };
        }
        throw err;
    }
}
/** 读回任务并生成 xlsx：成功→ready 落盘；失败→failed+error */
async function generateReportFile(taskId) {
    const task = await database_1.default.aiReportFile.findUnique({ where: { id: taskId } });
    if (!task)
        throw new errorHandler_1.ApiError('报告任务不存在', 404, 'NOT_FOUND');
    try {
        const cards = (task.evidenceJson || []);
        const selected = cards.filter((c) => c.tool !== 'report_file' && !c.error && Array.isArray(c.rows));
        const params = (task.paramsJson || {});
        const advice = typeof params.adviceText === 'string' ? params.adviceText : undefined;
        if ((!selected.length && !advice) || cards.some((c) => c.error))
            throw new Error('数据快照缺失或查询失败，请重新查询');
        const format = params.format === 'docx' ? 'docx' : 'xlsx';
        const snapshotVersion = (0, aiOperatingFacts_1.operatingSnapshotVersion)(selected);
        let buffer;
        if (format === 'docx')
            buffer = (0, aiDocumentRenderer_1.renderDocx)(task.title, String(params.institutionName || '本机构'), selected, snapshotVersion, advice);
        else {
            const wb = new exceljs_1.default.Workbook();
            wb.creator = '蜂鸣课务 AI 工作台';
            wb.description = '经营数据快照 ' + snapshotVersion;
            wb.created = task.createdAt;
            const summary = wb.addWorksheet('分析汇总');
            summary.columns = [{ width: 30 }, { width: 28 }, { width: 28 }];
            summary.addRow([safeCellText(task.title)]);
            summary.mergeCells('A1:C1');
            summary.getRow(1).font = { bold: true, size: 14 };
            summary.getRow(1).height = 36;
            summary.addRow(['机构', safeCellText(params.institutionName || '本机构')]);
            summary.addRow(['业务范围', '指标', '结果']);
            summary.getRow(3).font = { bold: true };
            const usedNames = new Set(['分析汇总', '口径与来源', '管理建议']);
            if (advice) {
                const sheet = wb.addWorksheet('管理建议');
                sheet.columns = [{ width: 90 }];
                for (const paragraph of advice.split(/\n+/).filter(Boolean)) {
                    sheet.addRow([safeCellText(paragraph)]).alignment = { wrapText: true, vertical: 'middle' };
                }
            }
            const typed = (v, key) => {
                if (v === null || v === undefined)
                    return null;
                if (typeof v === 'number' || typeof v === 'boolean')
                    return v;
                if (typeof v === 'string' &&
                    /出勤率|百分比|满班率|成单率/.test(key) &&
                    /^-?\d+(?:\.\d+)?%$/.test(v))
                    return Number(v.slice(0, -1));
                if (typeof v === 'string' &&
                    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) &&
                    /日期|时间|Date|Time|At|day/i.test(key)) {
                    const d = new Date(v);
                    if (Number.isFinite(d.getTime()))
                        return d;
                }
                const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
                if (text.length > 32767)
                    throw new Error('单元格超过Excel的32767字上限，请拆分字段后重试');
                return safeCellText(text);
            };
            for (const [index, card] of selected.entries()) {
                for (const [k, v] of Object.entries(card.totals || {})) {
                    const row = summary.addRow([
                        safeCellText(String(card.title || '业务数据').split('（')[0]),
                        safeCellText((0, aiOperatingFacts_1.evidenceUnit)(k) ? k + '（' + (0, aiOperatingFacts_1.evidenceUnit)(k) + '）' : k),
                        typed(v, k),
                    ]);
                    row.getCell(3).numFmt = /金额|额$/.test(k)
                        ? '#,##0.00'
                        : Number.isInteger(v)
                            ? '#,##0'
                            : '#,##0.####';
                    row.alignment = { vertical: 'top', wrapText: true };
                    row.height = 30;
                }
                let name = String(card.title || '业务明细')
                    .replace(/[\\/:*?\[\]]/g, '_')
                    .slice(0, 27) || '明细';
                if (usedNames.has(name))
                    name = name.slice(0, 24) + '_' + (index + 1);
                usedNames.add(name);
                const ws = wb.addWorksheet(name);
                const columns = card.columns || [];
                ws.views = [{ state: 'frozen', ySplit: 1 }];
                if (!columns.length) {
                    ws.addRow(['当前范围无匹配数据']);
                    continue;
                }
                ws.addRow(columns.map((c) => safeCellText(c.label)));
                ws.getRow(1).font = { bold: true };
                columns.forEach((c, i) => {
                    ws.getColumn(i + 1).width = /原始内容|口径|说明/.test(c.label)
                        ? 58
                        : /id$|Id$/.test(c.key)
                            ? 38
                            : 22;
                });
                for (const row of card.rows || []) {
                    const r = ws.addRow(columns.map((c) => typed(row[c.key], c.key)));
                    columns.forEach((c, i) => {
                        const cell = r.getCell(i + 1);
                        if (cell.value instanceof Date)
                            cell.numFmt = 'yyyy-mm-dd';
                        else if (typeof cell.value === 'number') {
                            if (/出勤率|百分比|满班率|成单率|目标完成率/.test(c.key)) {
                                cell.value = Number(cell.value) / 100;
                                cell.numFmt = '0.0%';
                            }
                            else
                                cell.numFmt = /金额|amount|price|Amount/i.test(c.key)
                                    ? '#,##0.00'
                                    : Number.isInteger(cell.value)
                                        ? '#,##0'
                                        : '#,##0.####';
                        }
                    });
                }
                ws.autoFilter = {
                    from: { row: 1, column: 1 },
                    to: { row: Math.max(1, ws.rowCount), column: columns.length },
                };
                ws.eachRow((row) => {
                    row.alignment = { vertical: 'top', wrapText: true };
                    row.font = { ...row.font, name: 'Arial', size: 11 };
                    row.height = Math.min(409, Math.max(30, ...columns.map((c, i) => Math.ceil(String(row.getCell(i + 1).value ?? '').replace(/[^\x00-\xff]/g, 'aa').length /
                        (Number(ws.getColumn(i + 1).width) || 22)) *
                        16 +
                        8)));
                });
                ws.getRow(1).font = { bold: true, size: 11 };
                ws.pageSetup = {
                    orientation: columns.length > 6 ? 'landscape' : 'portrait',
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: 0,
                    printTitlesRow: '1:1',
                };
            }
            const notes = wb.addWorksheet('口径与来源');
            notes.columns = [{ width: 28 }, { width: 100 }];
            notes.addRow(['来源', '说明']);
            notes.getRow(1).font = { bold: true };
            for (const card of selected) {
                notes.addRow([
                    safeCellText(card.title),
                    card.timeRange ? card.timeRange.start + ' 至 ' + card.timeRange.end : '当前快照/用户文件',
                ]);
                notes.addRow(['数据更新时间', card.generatedAt || '未记录']);
                notes.addRow(['口径', safeCellText(card.caliber)]);
                for (const n of card.missing || [])
                    notes.addRow(['数据说明', safeCellText(n)]);
            }
            notes.eachRow((row) => {
                row.alignment = { vertical: 'top', wrapText: true };
                row.height = Math.min(409, Math.max(30, Math.ceil(String(row.getCell(2).value ?? '').replace(/[^\x00-\xff]/g, 'aa').length / 100) *
                    16 +
                    8));
            });
            buffer = Buffer.from(await wb.xlsx.writeBuffer());
        }
        fs_1.default.mkdirSync(exports.REPORT_FILE_DIR, { recursive: true });
        const filePath = path_1.default.join(exports.REPORT_FILE_DIR, `${task.id}.${format}`), temp = filePath + '.tmp';
        fs_1.default.writeFileSync(temp, buffer, { mode: 0o600 });
        fs_1.default.renameSync(temp, filePath);
        const fileName = task.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) + '.' + format;
        const hash = (0, crypto_1.createHash)('sha256').update(buffer).digest('hex');
        await database_1.default.aiReportFile.update({
            where: { id: task.id },
            data: { status: 'ready', error: null, fileName, filePath, fileHash: hash },
        });
        return { status: 'ready' };
    }
    catch (err) {
        await database_1.default.aiReportFile.update({
            where: { id: taskId },
            data: { status: 'failed', error: String(err?.message || '生成失败').slice(0, 300) },
        });
        return { status: 'failed', error: String(err?.message || '生成失败') };
    }
}
// ==================== 查询/重试/归属 ====================
async function getReportFileForActor(actor, id) {
    const row = await database_1.default.aiReportFile.findUnique({ where: { id } });
    if (!row)
        throw new errorHandler_1.ApiError('报告文件不存在', 404, 'NOT_FOUND');
    if (!actor.userId ||
        !actor.organizationId ||
        row.organizationId !== actor.organizationId ||
        row.createdById !== actor.userId) {
        throw new errorHandler_1.ApiError('无权访问该报告文件', 403, 'FORBIDDEN');
    }
    if (row.campusId !== actor.campusId) {
        throw new errorHandler_1.ApiError('无权访问该报告文件（跨校区）', 403, 'CAMPUS_FORBIDDEN');
    }
    return row;
}
/** 失败/文件丢失重试：复用分析快照重新排版，不调用模型、不新增账单 */
async function retryReportFile(actor, id) {
    const row = await getReportFileForActor(actor, id);
    const diskExists = row.filePath ? fs_1.default.existsSync(row.filePath) : false;
    const retryable = row.status === 'failed' || (row.status === 'ready' && !diskExists);
    if (!retryable) {
        throw new errorHandler_1.ApiError('仅失败或文件丢失的任务可重试', 409, 'NOT_RETRYABLE');
    }
    const claimed = await database_1.default.aiReportFile.updateMany({
        where: { id: row.id, status: row.status },
        data: { status: 'processing', error: null },
    });
    if (!claimed.count)
        throw new errorHandler_1.ApiError('文件正在由另一请求重新生成，请刷新状态', 409, 'REPORT_PROCESSING');
    const r = await generateReportFile(row.id);
    return r;
}
/** 文件卡（SSE/消息/前端共用的形状） */
function buildFileCard(row) {
    return {
        type: 'file',
        tool: 'report_file',
        title: row.title,
        status: row.status,
        fileId: row.id,
        fileName: row.fileName || null,
        periodStart: row.periodStart || null,
        periodEnd: row.periodEnd || null,
        downloadUrl: row.status === 'ready' ? `/api/ai/report-files/${row.id}/download` : null,
        error: row.error || null,
    };
}
/** Read and verify the exact bytes of this immutable task before sending any response. */
function verifiedReportFileBuffer(row) {
    const resolved = row.filePath && path_1.default.resolve(row.filePath);
    if (!resolved || path_1.default.dirname(resolved) !== exports.REPORT_FILE_DIR ||
        ![row.id + '.xlsx', row.id + '.docx'].includes(path_1.default.basename(resolved)))
        throw new errorHandler_1.ApiError('报告文件路径不符，请重新生成', 409, 'REPORT_FILE_INTEGRITY');
    const buffer = fs_1.default.readFileSync(resolved);
    if (!row.fileHash || (0, crypto_1.createHash)('sha256').update(buffer).digest('hex') !== row.fileHash)
        throw new errorHandler_1.ApiError('报告文件校验失败，请重新生成', 409, 'REPORT_FILE_INTEGRITY');
    return buffer;
}
//# sourceMappingURL=reportFileService.js.map