"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateReportRequest = void 0;
exports.runPilotReportPipeline = runPilotReportPipeline;
exports.readPilotReportFile = readPilotReportFile;
// 试点运营报告管线（CJS 服务模块的 TS 包装）：仅转发调用，不含业务逻辑
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_crypto_1 = require("node:crypto");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl = require('./pilotReportPipelineV2.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const facts = require('./reportFacts.cjs');
exports.validateReportRequest = facts.validateRequest;
async function runPilotReportPipeline(taskId, options) {
    return impl.runPilotReportPipeline(taskId, options);
}
const PILOT_REPORT_DIR = path_1.default.resolve(process.env.AI_REPORT_OUTPUT_DIR || path_1.default.join(process.cwd(), 'storage/operating-reports'));
const PILOT_TASK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** 安全校验后读取报告文件（basename 白名单 + 目录包含断言），失败返回 null */
function readPilotReportFile(taskId, format, files) {
    if (!PILOT_TASK_ID_RE.test(taskId))
        return null;
    if (!['html', 'docx', 'xlsx'].includes(format))
        return null;
    const metadata = files?.[format];
    const selected = metadata?.path;
    const name = selected ? path_1.default.basename(selected) : taskId + '.' + format;
    if (!new RegExp('^' + taskId + '(?:\\.presentation-\\d+)?\\.' + format + '$').test(name))
        return null;
    const relocated = selected && path_1.default.dirname(path_1.default.resolve(selected)) !== PILOT_REPORT_DIR;
    if (relocated && !metadata?.sha256)
        return null;
    if (path_1.default.basename(name) !== name)
        return null;
    const resolved = path_1.default.resolve(PILOT_REPORT_DIR, name);
    if (!resolved.startsWith(PILOT_REPORT_DIR + path_1.default.sep))
        return null;
    try {
        const buffer = fs_1.default.readFileSync(resolved);
        if (metadata?.sha256 && (0, node_crypto_1.createHash)('sha256').update(buffer).digest('hex') !== metadata.sha256)
            return null;
        return buffer;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=pilotReportPipeline.js.map