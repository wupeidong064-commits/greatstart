"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLessonsIdempotently = addLessonsIdempotently;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function addLessonsIdempotently(actor, body) {
    if (!actor.organizationId || !actor.campusId || !['admin', 'manager'].includes(actor.role || '')) {
        throw new errorHandler_1.ApiError('无权增课或未分配校区', 403, 'FORBIDDEN');
    }
    const input = (body && typeof body === 'object' ? body : {});
    if (typeof input.requestId !== 'string' || !UUID.test(input.requestId)) {
        throw new errorHandler_1.ApiError('每笔增课必须携带有效的 UUID requestId；重试请沿用原 requestId', 400, 'INVALID_REQUEST_ID');
    }
    const { studentId, lessons } = input;
    if (typeof studentId !== 'string' || !studentId.trim() || typeof lessons !== 'number' || !Number.isSafeInteger(lessons) || lessons <= 0 || lessons > 2147483647 || (input.notes != null && typeof input.notes !== 'string')) {
        throw new errorHandler_1.ApiError('学员、正整数课时或备注无效', 400, 'INVALID_PARAMS');
    }
    const requestId = input.requestId.toLowerCase();
    // 2026-11-08 用户拍板：无偿赠课易生管理问题——增课备注必填（记录赠课原因），不再默认「后台增课」。
    const notes = (typeof input.notes === 'string' ? input.notes.trim() : '');
    if (!notes)
        throw new errorHandler_1.ApiError('请填写增课备注（如赠课原因、赠送说明）', 400, 'NOTES_REQUIRED');
    const organizationId = actor.organizationId;
    const payloadHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({ version: 1, studentId, lessons, notes })).digest('hex');
    return database_1.default.$transaction(async (tx) => {
        // Two-int locks occupy a separate namespace from attendance's single-int student locks.
        // Serializing by organization + request also handles conflicting requests for different students.
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${requestId}))`;
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;
        const student = await tx.student.findFirst({ where: { id: studentId, organizationId, campusId: actor.campusId } });
        // Always authorize against current scope before returning a stored result.
        if (!student)
            throw new errorHandler_1.ApiError('学员不属于当前校区', 403, 'FORBIDDEN');
        const prior = await tx.lessonAddRequest.findUnique({ where: { organizationId_requestId: { organizationId, requestId } } });
        if (prior) {
            if (prior.payloadHash !== payloadHash)
                throw new errorHandler_1.ApiError('该 requestId 已用于另一笔增课参数，请核对原操作', 409, 'IDEMPOTENCY_CONFLICT');
            return prior.response;
        }
        if (student.status === 'archived')
            throw new errorHandler_1.ApiError('学员已归档，请先恢复后再增课', 409, 'STUDENT_ARCHIVED');
        if (student.remainingLessons + lessons > 2147483647 || student.purchasedLessons + lessons > 2147483647) {
            throw new errorHandler_1.ApiError('增课后课时超出允许范围', 400, 'INVALID_PARAMS');
        }
        const updated = await tx.student.update({ where: { id: studentId }, data: { remainingLessons: { increment: lessons }, purchasedLessons: { increment: lessons } } });
        const log = await tx.lessonLog.create({ data: { organizationId, studentId, studentName: student.name, type: 'add', lessonSource: 'gift', creditAmountCents: 0, lessons, notes, operatorId: actor.id, operatorName: actor.name } });
        // Freeze the actual JSON wire representation, including dates and the original message.
        const response = JSON.parse(JSON.stringify({
            success: true,
            data: { studentId, previousRemaining: student.remainingLessons, added: lessons, currentRemaining: updated.remainingLessons, log },
            message: `增课成功，当前剩余 ${updated.remainingLessons} 节`,
        }));
        await tx.lessonAddRequest.create({ data: { organizationId, requestId, studentId, actorId: actor.id, payloadHash, response } });
        return response;
    }, { timeout: 20000 });
}
//# sourceMappingURL=lessonAddService.js.map