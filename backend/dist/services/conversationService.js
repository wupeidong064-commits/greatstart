"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = exports.CTX_BUDGET = void 0;
exports.createConversation = createConversation;
exports.listConversations = listConversations;
exports.getOwnedConversation = getOwnedConversation;
exports.renameConversation = renameConversation;
exports.deleteConversation = deleteConversation;
exports.appendUserMessageIdempotent = appendUserMessageIdempotent;
exports.hasActiveRun = hasActiveRun;
exports.buildContextWindow = buildContextWindow;
exports.updateSummary = updateSummary;
exports.summarySuppressed = summarySuppressed;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
// ==================== 预算配置（环境变量可覆盖，产品预算而非模型上限） ====================
exports.CTX_BUDGET = {
    total: parseInt(process.env.AI_CTX_TOTAL_TOKENS || '12000', 10), // 总输入预算
    historyMax: parseInt(process.env.AI_CTX_HISTORY_TOKENS || '6000', 10), // 历史+摘要合计上限
    evidenceMax: parseInt(process.env.AI_CTX_EVIDENCE_TOKENS || '4000', 10), // 数据证据上限（G2 使用）
    recentTurns: parseInt(process.env.AI_CTX_RECENT_TURNS || '6', 10), // 近期优先轮数
    summaryMax: parseInt(process.env.AI_CTX_SUMMARY_TOKENS || '800', 10), // 摘要上限
    maxMessageChars: 4000, // 单条消息入库上限（字符）
};
const estimateTokens = (text) => Math.ceil((text || '').length);
exports.estimateTokens = estimateTokens;
function clampBudgets() {
    // 历史预算不得超过总预算的一半（保证系统提示词与当前问题有空间）
    const historyMax = Math.min(exports.CTX_BUDGET.historyMax, Math.floor(exports.CTX_BUDGET.total / 2));
    return { ...exports.CTX_BUDGET, historyMax };
}
// ==================== 会话 CRUD（仅本人） ====================
async function createConversation(owner, title) {
    const conv = await database_1.default.aiConversation.create({
        data: {
            ownerUserId: owner.userId,
            organizationId: owner.organizationId,
            campusId: owner.campusId,
            title: title?.slice(0, 60) || null,
        },
        select: { id: true, title: true },
    });
    return conv;
}
async function listConversations(owner) {
    return database_1.default.aiConversation.findMany({
        where: { ownerUserId: owner.userId, organizationId: owner.organizationId, campusId: owner.campusId, status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, title: true, updatedAt: true },
    });
}
async function getOwnedConversation(owner, conversationId) {
    const conv = await database_1.default.aiConversation.findFirst({
        where: {
            id: conversationId,
            ownerUserId: owner.userId,
            organizationId: owner.organizationId,
            campusId: owner.campusId,
            status: 'active',
        },
    });
    if (!conv)
        throw new errorHandler_1.ApiError('会话不存在或无权访问', 404, 'CONVERSATION_NOT_FOUND');
    return conv;
}
async function renameConversation(owner, conversationId, title) {
    await getOwnedConversation(owner, conversationId);
    const clean = (title || '').trim().slice(0, 60);
    if (!clean)
        throw new errorHandler_1.ApiError('标题不能为空', 400, 'VALIDATION_ERROR');
    await database_1.default.aiConversation.update({ where: { id: conversationId }, data: { title: clean } });
}
/** 软删除：消息随之不再可见；审计与消费记录不受影响 */
async function deleteConversation(owner, conversationId) {
    await getOwnedConversation(owner, conversationId);
    await database_1.default.aiConversation.update({ where: { id: conversationId }, data: { status: 'deleted' } });
}
// ==================== 消息持久化（幂等） ====================
async function nextSequence(conversationId) {
    const last = await database_1.default.aiMessage.findFirst({
        where: { conversationId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
    });
    return (last?.sequence ?? 0) + 1;
}
/** 幂等追加用户消息：同 requestId 直接返回已有消息（不新建、不双扣） */
async function appendUserMessageIdempotent(owner, conversationId, content, requestId) {
    await getOwnedConversation(owner, conversationId);
    const clean = (content || '').trim();
    if (!clean)
        throw new errorHandler_1.ApiError('消息内容不能为空', 400, 'VALIDATION_ERROR');
    if (clean.length > exports.CTX_BUDGET.maxMessageChars) {
        throw new errorHandler_1.ApiError(`单条消息过长（上限 ${exports.CTX_BUDGET.maxMessageChars} 字符）`, 400, 'VALIDATION_ERROR');
    }
    const existing = await findMessageByRequestId(requestId);
    if (existing) {
        // 确认该消息确属本人会话（防止伪造 requestId 读取他人消息）
        const conv = await database_1.default.aiConversation.findFirst({
            where: { id: existing.conversationId, ownerUserId: owner.userId, organizationId: owner.organizationId, campusId: owner.campusId },
        });
        if (!conv)
            throw new errorHandler_1.ApiError('会话不存在或无权访问', 404, 'CONVERSATION_NOT_FOUND');
        return {
            message: existing,
            idempotentHit: true,
        };
    }
    const created = await database_1.default.aiMessage.create({
        data: {
            conversationId,
            sequence: await nextSequence(conversationId),
            role: 'user',
            content: clean,
            status: 'complete',
            requestId,
        },
    });
    return {
        message: { id: created.id, sequence: created.sequence, role: created.role, content: created.content, status: created.status, requestId: created.requestId },
        idempotentHit: false,
    };
}
async function findMessageByRequestId(requestId) {
    const m = await database_1.default.aiMessage.findUnique({ where: { requestId } });
    if (!m)
        return null;
    return {
        id: m.id, sequence: m.sequence, role: m.role, content: m.content,
        status: m.status, requestId: m.requestId, conversationId: m.conversationId, billId: m.billId,
    };
}
/** 会话内是否已有进行中的流式任务（并发锁：同会话一次只允许一个进行中任务） */
async function hasActiveRun(conversationId) {
    const streaming = await database_1.default.aiMessage.findFirst({
        where: { conversationId, status: 'streaming' },
    });
    return Boolean(streaming);
}
function buildContextWindow(rows, summary) {
    const budgets = clampBudgets();
    const historyBudget = budgets.historyMax;
    // 只取 complete/stopped 的消息（streaming/failed 不入上下文；failed 由重试产出新 run）
    const usable = rows.filter((r) => r.status === 'complete' || r.status === 'stopped');
    const summaryText = summary?.text || null;
    // R1-5：按完整轮次（user + 其后所有 assistant 消息）从尾向前收集。
    // - 轮是原子单位：放不下整轮就整轮丢弃（绝不跳过轮中间的长回答——那会导致
    //   user,user 相邻且 truncated=false 的静默丢失，Codex 已实测复现）
    // - 当前问题（最后一轮 user）必须保留；其前一轮放不下则截断并标记
    // - 丢弃内容必须 truncated=true 且触发 needsSummary（由摘要保留要点）
    const picked = [];
    let used = summaryText ? (0, exports.estimateTokens)(summaryText) : 0;
    let firstKeptSeq = Number.MAX_SAFE_INTEGER;
    // 分轮：usable 按 sequence 升序，遇到 role=user 开新轮
    const turns = [];
    for (const m of usable) {
        if (m.role === 'user' || turns.length === 0)
            turns.push([m]);
        else
            turns[turns.length - 1].push(m);
    }
    // 从最后一轮向前纳入；最后一轮（含当前问题）无条件纳入（它是本轮输入，
    // 其 assistant 若超长放不下则丢弃该 assistant 但保留 user 问题本身）
    for (let t = turns.length - 1; t >= 0; t--) {
        const turn = turns[t];
        const turnTokens = turn.reduce((sum, m) => sum + (0, exports.estimateTokens)(m.content), 0);
        const isLastTurn = t === turns.length - 1;
        const takeTurn = (msgs) => {
            // 从尾向首 unshift：保证轮内与轮间都保持 sequence 升序
            for (let k = msgs.length - 1; k >= 0; k--) {
                picked.unshift(msgs[k]);
                used += (0, exports.estimateTokens)(msgs[k].content);
                firstKeptSeq = Math.min(firstKeptSeq, msgs[k].sequence);
            }
        };
        if (isLastTurn) {
            // 最后一轮：优先整轮纳入；放不下则只保 user（当前问题），长 assistant 丢弃
            if (used + turnTokens <= historyBudget) {
                takeTurn(turn);
            }
            else {
                takeTurn(turn.filter((m) => m.role === 'user'));
                // 长 assistant 被丢弃 → 属于截断，必须可见
            }
            continue;
        }
        if (used + turnTokens > historyBudget)
            break; // 整轮放不下：该轮及更早全部丢弃
        takeTurn(turn);
    }
    // dropped = 全部未纳入的 usable 消息（含最后一轮被丢弃的超长 assistant）
    const pickedIds = new Set(picked.map((m) => m.id));
    const droppedCount = usable.filter((m) => !pickedIds.has(m.id)).length;
    // 需要摘要：存在丢弃 且 （无摘要 或 摘要未覆盖到第一条保留消息之前的全部内容）
    const needsSummary = droppedCount > 0 && (!summary || !summary.coveredThroughMessageId ||
        (() => {
            const covered = usable.find((m) => m.id === summary.coveredThroughMessageId);
            // covered 之前（含 covered 自身按 inclusive 语义）的内容都应已被摘要压缩；
            // 若覆盖点在第一条保留消息之后，说明丢弃段未全部被摘要覆盖
            return !covered || covered.sequence >= firstKeptSeq;
        })());
    // cutoff（exclusive）：第一条保留消息的 id —— updateSummary 压缩它之前的全部消息
    const summaryUpToId = droppedCount > 0 ? (picked[0]?.id ?? null) : null;
    return {
        history: picked.map((m) => ({ role: m.role, content: m.content })),
        summaryText,
        droppedCount,
        needsSummary,
        summaryUpToId,
        tokens: { history: used, summary: summaryText ? (0, exports.estimateTokens)(summaryText) : 0 },
        truncated: droppedCount > 0,
    };
}
// ==================== 摘要生成与持久化 ====================
const SUMMARY_SYSTEM_PROMPT = [
    '你是会话摘要器。把「旧摘要 + 新增对话」压缩成一份不超过 800 token 的中文摘要，',
    '记录：已确认意图、涉及对象（班级/学员/日期范围）、已做出的决定、未解决问题。',
    '规则：',
    '1. 历史业务数字只是过去查询的结果；用户问「现在/最新」必须重新查询。',
    '2. 用户更正覆盖旧条件，摘要不增加新事实。',
    '3. 逐条列出来源消息序号（如 [seq 12-15]）。',
    '4. 只输出摘要正文，不要任何解释。',
].join('\n');
/** 增量更新摘要：旧摘要 + covered..cutoff 之间的消息 → 新摘要 */
async function updateSummary(owner, conversationId, cutoffMessageId, callModel) {
    const conv = await getOwnedConversation(owner, conversationId);
    const usable = await database_1.default.aiMessage.findMany({
        where: { conversationId, status: { in: ['complete', 'stopped'] } },
        orderBy: { sequence: 'asc' },
        select: { id: true, sequence: true, role: true, content: true },
    });
    // 新增消息 = 排在旧 coveredThrough 之后的、被裁剪掉的部分
    let newRows = usable;
    if (conv.summaryCoveredThroughMessageId) {
        const covered = usable.find((m) => m.id === conv.summaryCoveredThroughMessageId);
        if (covered) {
            newRows = usable.filter((m) => m.sequence > covered.sequence);
        }
    }
    const cutoffIdx = newRows.findIndex((m) => m.id === cutoffMessageId);
    if (cutoffIdx === -1 || cutoffIdx < 0) {
        return { ok: false, used: false };
    }
    // cutoff 为 exclusive 边界：压缩 (covered, cutoff) 区间，cutoff 自身留给下一轮或窗口
    const toCompress = newRows.slice(0, cutoffIdx);
    if (toCompress.length === 0) {
        // R1-6：无新增内容不推进 covered（原实现把未压缩的 cutoff 也标记为已覆盖，
        // 导致该消息永久漏出增量摘要——Codex §6）
        return { ok: true, used: false };
    }
    const oldSummary = conv.contextSummary || '（无）';
    const transcript = toCompress
        .map((m) => `[seq ${m.sequence}] ${m.role}: ${m.content.slice(0, 2000)}`)
        .join('\n');
    // Never start an unbudgeted summary request. Preserve coverage when oversized;
    // the caller keeps the bounded recent history and can report truncation.
    if (SUMMARY_SYSTEM_PROMPT.length + oldSummary.length + transcript.length + 100 > exports.CTX_BUDGET.total)
        return { ok: false, used: false };
    try {
        const r = await callModel([
            { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
            { role: 'user', content: `【旧摘要】\n${oldSummary}\n\n【新增对话】\n${transcript}\n\n请输出压缩后的新摘要。` },
        ]);
        // R1-9：estimateTokens 口径=1字符1token，截断上限即 summaryMax（原 *4 是 4 倍超预算）
        const clipped = r.text.length > exports.CTX_BUDGET.summaryMax ? r.text.slice(0, exports.CTX_BUDGET.summaryMax) : r.text;
        await database_1.default.aiConversation.update({
            where: { id: conversationId },
            data: {
                contextSummary: clipped,
                // R1-6：covered 存“真实最后已压缩消息”（toCompress 末条），
                // 下一轮从它之后取增量——cutoff 消息不会被跳过
                summaryCoveredThroughMessageId: toCompress[toCompress.length - 1].id,
                summaryVersion: { increment: 1 },
                summaryFailedAttempts: 0,
            },
        });
        return { ok: true, used: true, usage: r.usage };
    }
    catch (err) {
        await database_1.default.aiConversation.update({
            where: { id: conversationId },
            data: { summaryFailedAttempts: { increment: 1 } },
        });
        return { ok: false, used: false };
    }
}
/** 防死循环：摘要连续失败 ≥2 次后暂停压缩尝试（退回有界近期历史并提示历史范围缩短） */
async function summarySuppressed(conversationId) {
    const conv = await database_1.default.aiConversation.findUnique({ where: { id: conversationId }, select: { summaryFailedAttempts: true } });
    return (conv?.summaryFailedAttempts ?? 0) >= 2;
}
//# sourceMappingURL=conversationService.js.map