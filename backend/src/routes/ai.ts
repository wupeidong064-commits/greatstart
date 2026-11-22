import { verifiedReportFileBuffer } from '../services/reportFileService';
import { reportRequest, previewReportImport, confirmReportImport, createOperatingReport, reportCards, reportAnswer } from '../services/operatingReportService';
import { usageSummary } from '../services/aiUsageAudit';
import multer from 'multer';
import { runtimeDictionary } from '../services/aiDataDictionary';
import {
  businessScope,
  SCOPE_REPLY,
  inheritPreviousIntent,
  isFileRequest,
  isPurePresentationRequest,
  requestedFormats,
  criticalMetricClarification,
  explanationIntent,
  isExplanationRequest,
  generalAttendanceAdvice,
  normalizeBusinessFilters,
  classClarificationPlan,
  newStudentAttendanceIntent,
  securityProbeIntent,
  entitySwapFollowupIntent,
  duoStudentAttendanceIntent,
  studentRankingIntent,
  lowAttendanceRenewalIntent,
  workbenchHelpIntent,
  naturalAttendanceIntent,
  orderMetricIntent,
} from '../services/aiWorkbenchPolicy';
import { blockedChatEntryIntent } from '../services/aiEntryService';
import {
  saveUpload,
  getUpload,
  mapUpload,
  removeUpload,
  uploadEvidence,
  ownedUpload,
} from '../services/aiUploadService';
import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth';
import { runPilotReportPipeline, readPilotReportFile, validateReportRequest } from '../services/pilotReportPipeline';
import path from 'path';
import { requireOrganizationAccess } from '../middleware/rbac';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import {
  buildOrgSnapshot,
  isAiConfigured,
  streamGlmChat,
  activeAiProviderLabel,
  activeAiModel,
  ChatMessage,
} from '../services/aiService';
import { prepareChatTask, settleChatTask, getActivePrice } from '../services/aiCreditService';
import { fmtMicros } from '../config/aiCredits';
import prisma from '../config/database';
import {
  buildIntentMessages,
  parseIntent,
  AiIntent,
} from '../services/aiIntent';
import { runPlannedTools, validateToolPlan, Evidence, AI_TOOLS } from '../services/aiTools';
import { publicChatCards, publicVerificationNotice } from '../services/aiChatPresentation';
import { resolveBusinessCalendar } from '../services/aiBusinessCalendar';
import { adviceTopic, renderOperatingAdvice } from '../services/aiOperatingAdvice';
import { buildOperatingSnapshot, renderOperatingFacts } from '../services/aiOperatingFacts';
import { alignMeasures, bindUserThreshold, comparisonFactIds, requestsTable, scopeClarification } from '../services/aiQueryRequirements';
import { renderTeacherComparison, teacherComparisonIntent } from '../services/aiTeacherComparison';
import { renderTeacherRanking, teacherRankingIntent } from '../services/aiTeacherRanking';
import { businessToday, calendarTools, exceedsCalendarToolLimit, supportsHistoricalPeriod } from '../services/aiOperatingPlan';
import {
  createOrGetReportFileTask,
  generateReportFile,
  getReportFileForActor,
  retryReportFile,
  buildFileCard,
} from '../services/reportFileService';
import fs from 'fs';
import {
  CTX_BUDGET,
  ConversationOwner,
  buildContextWindow,
  createConversation,
  deleteConversation,
  getOwnedConversation,
  listConversations,
  renameConversation,
  summarySuppressed,
  updateSummary,
} from '../services/conversationService';

/**
 * AI 工作台路由（方向 B · G1 会话记忆版）
 *
 * 会话记忆：客户端只提交当前消息 + 会话 ID + 幂等 requestId；历史一律由服务端读取，
 * 不信任客户端伪造的 assistant 历史或 system 指令（旧 messages 数组协议已废弃）。
 * 计费：预留→结算→释放不变；账单关联 conversationId；摘要成本计入同一账单。
 * 鉴权：复用既有 authenticate + requireOrganizationAccess；AI 资格由 prepareChatTask 校验
 * （仅机构/校区管理员、需开通与余额）。
 */

export const aiRoutes = Router();

/** 补修1：无账单占位的在途宽限（ms）——区分「刚开始」与「崩溃残留」的租约到期条件 */
const RUN_LEASE_GRACE_MS = parseInt(process.env.AI_RUN_LEASE_GRACE_MS || '30000', 10);

aiRoutes.use(authenticate);
aiRoutes.use(requireOrganizationAccess());
aiRoutes.use((req: AuthRequest, _res, next) => {
  const u = req.user;
  if (!u || !['admin', 'manager'].includes(u.role) || u.isPlatformAdmin || !u.campusId)
    return next(new ApiError('仅校区管理账号可使用 AI 助理', 403, 'AI_ROLE_REQUIRED'));
  next();
});

// 对话限流：默认每分钟 20 次，可用 AI_CHAT_RATE_LIMIT 覆盖（压测/验收场景调高）
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.AI_CHAT_RATE_LIMIT || '20', 10),
  message: { error: 'AI 对话请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const getCurrentUser = (req: AuthRequest) => req.user;

function ownerOf(req: AuthRequest): ConversationOwner {
  const u = getCurrentUser(req) as any;
  return {
    userId: u?.id,
    organizationId: u?.organizationId,
    campusId: u?.campusId ?? null,
  };
}

// ==================== 会话 CRUD（仅本人；G1） ====================

/** 新建会话 */
aiRoutes.post('/conversations', async (req: AuthRequest, res, next) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const conv = await createConversation(ownerOf(req), title);
    sendSuccess(res, conv, '会话已创建', 201);
  } catch (error) {
    next(error);
  }
});

/** 列出我的会话（按更新时间倒序） */
aiRoutes.get('/conversations', async (req: AuthRequest, res, next) => {
  try {
    sendSuccess(res, await listConversations(ownerOf(req)));
  } catch (error) {
    next(error);
  }
});

/** 会话消息（仅本人会话）。R1-8：默认取最新一页并正序返回；?before=<sequence> 向更早翻页。
 *  超长会话刷新不再只能看到最早 N 条。 */
aiRoutes.get('/conversations/:id/messages', async (req: AuthRequest, res, next) => {
  try {
    const conv = await getOwnedConversation(ownerOf(req), req.params.id);
    const take = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const before = parseInt(req.query.before as string, 10);
    const rows = await prisma.aiMessage.findMany({
      where: {
        conversationId: conv.id,
        status: { in: ['complete', 'stopped'] },
        role: { in: ['user', 'assistant'] },
        ...(Number.isFinite(before) ? { sequence: { lt: before } } : {}),
      },
      orderBy: { sequence: 'desc' },
      take: take + 1, // 多取一条判断 hasMore
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse(); // 正序呈现
    sendSuccess(res, {
      conversation: { id: conv.id, title: conv.title, summaryVersion: conv.summaryVersion },
      messages: page.map((m) => ({
        id: m.id,
        sequence: m.sequence,
        role: m.role,
        content: m.content,
        status: m.status,
        createdAt: m.createdAt,
        evidences: publicChatCards(m.evidenceJson),
        verificationNotice: publicVerificationNotice(m.usageJson, m.evidenceJson),
      })),
      hasMore,
      oldestSequence: page.length > 0 ? page[0].sequence : null,
    });
  } catch (error) {
    next(error);
  }
});

/** 重命名会话 */
aiRoutes.patch('/conversations/:id', async (req: AuthRequest, res, next) => {
  try {
    await renameConversation(ownerOf(req), req.params.id, String(req.body?.title || ''));
    sendSuccess(res, { ok: true });
  } catch (error) {
    next(error);
  }
});

/** 删除会话（软删） */
aiRoutes.delete('/conversations/:id', async (req: AuthRequest, res, next) => {
  try {
    await deleteConversation(ownerOf(req), req.params.id);
    sendSuccess(res, { ok: true });
  } catch (error) {
    next(error);
  }
});

function renderEvidenceTable(card: Evidence): string {
  const columns = card.columns.filter(c=>c.key !== 'id' && !c.key.endsWith('Id'));
  if (!columns.length) return '';
  const cell = (value: unknown) => String(value ?? '—').replace(/[|\r\n]/g,' ');
  const rows = card.rows.slice(0,50).map(row=>'| '+columns.map(c=>cell(row[c.key])).join(' | ')+' |');
  const period = card.timeRange ? '（'+card.timeRange.start+' 至 '+card.timeRange.end+'）' : '';
  return [card.title+period,'','| '+columns.map(c=>cell(c.label)).join(' | ')+' |',
    '| '+columns.map(()=>'---').join(' | ')+' |',...rows,
    ...(card.rows.length>50?['对话展示前 50 行，本次查询快照共有 '+card.rows.length+' 行。']:[])].join('\n');
}

function writeSse(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

aiRoutes.post('/chat', chatLimiter, async (req: AuthRequest, res, next) => {
  // R1：运行级状态提升到 handler 作用域——任何异常路径都能完成账务收尾与消息终态
  let run: {
    conversationId: string;
    userMsgId: string;
    userMsgSeq: number;
    aiMsgId: string;
    isRetry: boolean;
  } | null = null;
  let conversationId: string | null = null;
  let preparedBillId: string | null = null;
  let clientDisconnected = false;
  const upstreamAbort = new AbortController();
  // R1-4：逐子调用用量记录（intent/chat/summary）；结算时据此判定完整性
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  const usageCalls: Array<{
    purpose: string;
    status: string;
    usage: { promptTokens: number; completionTokens: number } | null;
    model?: string;
    provider?: string;
    startedAt?: string;
    durationMs?: number;
    usageSource?: string;
  }> = [];
  const startCall = (purpose: string) =>
    usageCalls.push({
      purpose,
      status: 'started',
      usage: null,
      model: activeAiModel(),
      provider: activeAiProviderLabel(),
      startedAt: new Date().toISOString(),
    });
  const markCall = (
    purpose: string,
    usage: { promptTokens: number; completionTokens: number } | null,
    status: 'ok' | 'failed' | 'skipped'
  ) => {
    const existing = usageCalls.find((c) => c.purpose === purpose);
    if (existing) {
      existing.usage = usage ?? existing.usage;
      existing.status = status;
      existing.durationMs = existing.startedAt ? Date.now() - Date.parse(existing.startedAt) : 0;
      existing.usageSource =
        activeAiModel() === 'mock-recorded-v1'
          ? 'synthetic'
          : usage
            ? 'provider_reported'
            : 'missing';
    } else usageCalls.push({ purpose, status, usage });
  };
  try {
    const currentUser = getCurrentUser(req) as any;
    const organizationId = currentUser?.organizationId;
    if (!organizationId) {
      return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
    }
    if (!isAiConfigured()) {
      return next(new ApiError('AI 服务未配置（GLM/Ark/mock 供应商）', 503, 'AI_NOT_CONFIGURED'));
    }

    // ===== 协议：{ conversationId?, content, requestId }；客户端不提交历史 =====
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId.trim() : '';
    if (!requestId || requestId.length > 100) {
      return next(new ApiError('缺少有效幂等请求 ID（requestId）', 400, 'VALIDATION_ERROR'));
    }
    if (!content || content.length > CTX_BUDGET.maxMessageChars) {
      return next(
        new ApiError(
          `消息内容为空或过长（上限 ${CTX_BUDGET.maxMessageChars} 字符）`,
          400,
          'VALIDATION_ERROR'
        )
      );
    }
    const uploadIds = Array.isArray(req.body?.uploadIds) ? req.body.uploadIds : [];
    if (uploadIds.length > 12 || uploadIds.some((id: unknown) => typeof id !== 'string'))
      throw new ApiError('每次最多选择12个本人附件', 400, 'UPLOAD_LIMIT');
    for (const id of uploadIds) ownedUpload(ownerOf(req), id);
    const explicitConvId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId
        ? req.body.conversationId
        : null;
    const owner = ownerOf(req);

    // ===== 补修2：requestId 预查重（建会话之前）——首问响应丢失后以同键重发（未带 convId）
    // 必须回到原运行回放，而不是先建新会话再撞 409（Codex 复验实测）。
    // 归属校验：仅同 owner（账号+机构+校区）可回放；跨 owner 一律 409，不可探知原内容。
    const preDup = await prisma.aiMessage.findUnique({ where: { requestId } });
    if (preDup) {
      const preConv = await prisma.aiConversation.findFirst({
        where: {
          id: preDup.conversationId,
          ownerUserId: owner.userId,
          status: 'active',
          organizationId: owner.organizationId,
          campusId: owner.campusId,
        },
      });
      if (!preConv) {
        // 不同所有者占用该键：拒绝且不泄露任何原内容
        return next(new ApiError('该 requestId 已被其他会话占用', 409, 'REQUEST_ID_CONFLICT'));
      }
      if (explicitConvId && explicitConvId !== preConv.id)
        return next(new ApiError('该请求编号已用于另一会话',409,'REQUEST_ID_CONFLICT'));
      if (preDup.status === 'streaming') {
        return next(new ApiError('该请求正在进行中', 409, 'CONVERSATION_BUSY'));
      }
      const preUser = await prisma.aiMessage.findFirst({
        where: { conversationId: preConv.id, role: 'user', sequence: { lt: preDup.sequence } },
        orderBy: { sequence: 'desc' },
      });
      if (preUser?.content !== content)
        return next(new ApiError('该请求编号已用于另一条问题',409,'REQUEST_ID_CONFLICT'));
      // 回放原会话与结果：不新建会话、不新增消息、不产生账单
      startSse(res);
      writeSse(res, {
        conversationId: preConv.id,
        replay: true,
        userContent: preUser?.content ?? '',
      });
      if (Array.isArray(preDup.evidenceJson)) {
        const cards = publicChatCards(preDup.evidenceJson);
        const files = cards.filter((c) => c.type === 'file');
        writeSse(res, {
          evidences: cards.filter((c) => c.type !== 'file'),
        });
        for (const fileCard of files) writeSse(res, { fileCard });
      }
      const verificationNotice = publicVerificationNotice(preDup.usageJson, preDup.evidenceJson);
      if (verificationNotice) writeSse(res, { verificationNotice });
      if (preDup.content) writeSse(res, { delta: preDup.content });
      writeSse(res, { done: true });
      if (!res.writableEnded) res.end();
      return;
    }

    // ===== 会话解析：显式 ID 校验归属；未带则自动新建（标题=首条消息前 60 字） =====
    let createdConversationId: string | null = null;
    if (explicitConvId) {
      const conv = await getOwnedConversation(owner, explicitConvId);
      conversationId = conv.id;
    } else {
      const conv = await createConversation(owner, content.slice(0, 60));
      conversationId = conv.id;
      createdConversationId = conv.id; // 并发双发兜底：撞键时回收本轮空会话
    }

    // ===== 事务开跑：行锁 + 崩溃恢复 + 幂等 + 并发锁 + 落消息（先于预留：回放/409 无账单） =====
    let outcome;
    try {
      outcome = await beginChatRun(owner, conversationId, content, requestId);
    } catch (err: any) {
      // 并发同键双发的后进者：事务内查重命中他者会话 → 409；回收本轮误建的空会话（无消息时软删）
      if (err?.code === 'REQUEST_ID_CONFLICT' && createdConversationId) {
        const msgsIn = await prisma.aiMessage.count({
          where: { conversationId: createdConversationId },
        });
        if (msgsIn === 0) {
          await prisma.aiConversation.update({
            where: { id: createdConversationId },
            data: { status: 'deleted' },
          });
        }
      }
      throw err;
    }

    // ===== 幂等回放：同 requestId 回放既有运行（原问+原答），不建任务不双扣 =====
    if (outcome && 'replay' in outcome && outcome.replay) {
      startSse(res);
      writeSse(res, { conversationId, replay: true, userContent: outcome.replay.userContent });
      const cards = publicChatCards(outcome.replay.evidenceJson);
      writeSse(res,{evidences:cards.filter(c=>c.type!=='file')});
      for (const fileCard of cards.filter(c=>c.type==='file')) writeSse(res,{fileCard});
      if (outcome.replay.aiContent) writeSse(res, { delta: outcome.replay.aiContent });
      writeSse(res, { done: true });
      if (!res.writableEnded) res.end();
      return;
    }
    if (!outcome || !('aiMsgId' in outcome)) {
      return next(new ApiError('会话处理失败', 500, 'RUN_FAILED'));
    }
    run = outcome;

    // ===== R1-7：断开监听与取消信号在一切模型调用之前注册（意图阶段断开可即时取消） =====
    const onClientGone = () => {
      clientDisconnected = true;
      upstreamAbort.abort();
    };
    res.on('close', onClientGone);
    req.on('aborted', onClientGone);

    // Explicit operational reports share the full report pipeline; no intent/chat model call.
    const priorReportMessage=await prisma.aiMessage.findFirst({where:{conversationId:run.conversationId,role:'assistant',status:'complete'},orderBy:{sequence:'desc'},select:{usageJson:true}});
    const priorReportUsage=priorReportMessage?.usageJson as any;
    const previousReport=priorReportUsage?.operatingReport || (priorReportUsage?.pendingReport?.needsPeriod ? priorReportUsage.pendingReport : undefined);
    const campus = await prisma.campus.findFirstOrThrow({where:{id:owner.campusId!,organizationId:owner.organizationId},select:{name:true}});
    const deniedScope = scopeClarification(content,campus.name);
    const operatingRequest=deniedScope || blockedChatEntryIntent(content) ? undefined : reportRequest(content,businessToday(),previousReport);
    if(operatingRequest){
      const prepared=await prepareChatTask(currentUser,0,{conversationId:run.conversationId,plannedOutputTokens:0});preparedBillId=prepared.billId;
      await prisma.aiMessage.update({where:{id:run.aiMsgId},data:{billId:prepared.billId}});
      startSse(res);writeSse(res,{conversationId:run.conversationId,messageId:run.aiMsgId});
      let answer='',cards:any[]=[],reportMeta:any=null,failure:string|null=null,reportCalls:any[]=[];
      if('needsPeriod' in operatingRequest)answer=(operatingRequest.error?operatingRequest.error+'。':'')+'请说明报告期间，例如“生成2026-11-02至2026-11-08的运营周报”或“生成2026年10月月报”。';
      else if(clientDisconnected)failure='请求已停止，未生成新报告';
      else try{
        const report=await createOperatingReport(owner,operatingRequest,uploadIds,requestId,previousReport?.receiptIds||[],upstreamAbort.signal);
        const narrative=(report.content as any)?.narrative;if(narrative?.physicalCallId&&!narrative.cacheHit)reportCalls=[{id:narrative.physicalCallId,phase:'operating_report',requestedModel:narrative.model,actualModel:narrative.model,provider:'ark',status:narrative.usage?'complete':'failed',usage:narrative.usage?{promptTokens:narrative.usage.prompt_tokens,completionTokens:narrative.usage.completion_tokens}:null,synthetic:false}];answer=reportAnswer(report);cards=reportCards(report);reportMeta={...operatingRequest,receiptIds:(report.content as any)?.facts?.importReceipts||[],reportId:report.id,analysisComplete:(report.content as any)?.meta?.analysisComplete===true};
      }catch(e:any){failure=e.message;const reason=e instanceof ApiError&&e.statusCode<500?e.message:'生成过程有待核实，请稍后重试';answer='报告尚未完成：'+reason+'。';}
      await settleChatTask(prepared.billId,{usage:{promptTokens:0,completionTokens:0},calls:[],usageIncomplete:false,clientAborted:clientDisconnected});
      await prisma.aiMessage.update({where:{id:run.aiMsgId},data:{content:clientDisconnected?'':answer,status:failure?'failed':clientDisconnected?'stopped':'complete',evidenceJson:cards,usageJson:{requestId,uploadIds,calls:reportCalls,localOperations:{parseAndRenderModelCalls:0},operatingReport:reportMeta,pendingReport:operatingRequest,reportError:failure}}});
      await prisma.aiConversation.update({where:{id:run.conversationId},data:{updatedAt:new Date()}});
      if(!clientDisconnected&&!res.writableEnded){const visible=publicChatCards(cards);writeSse(res,{delta:answer});writeSse(res,{evidences:visible.filter(c=>c.type!=='file')});for(const fileCard of visible.filter(c=>c.type==='file'))writeSse(res,{fileCard});writeSse(res,{done:true});}
      if(!res.writableEnded)res.end();return;
    }

    // ===== 上下文窗口（先于预留：估算需要实际输入规模） =====
    const allRows = await prisma.aiMessage.findMany({
      where: { conversationId: run.conversationId, status: { in: ['complete', 'stopped'] } },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        sequence: true,
        role: true,
        content: true,
        status: true,
        evidenceJson: true,
        usageJson: true,
      },
    });
    const convRow = await prisma.aiConversation.findUnique({
      where: { id: run.conversationId },
      select: { contextSummary: true, summaryCoveredThroughMessageId: true, summaryVersion: true },
    });
    const window = buildContextWindow(
      allRows,
      convRow
        ? {
            text: convRow.contextSummary,
            coveredThroughMessageId: convRow.summaryCoveredThroughMessageId,
            version: convRow.summaryVersion,
          }
        : null
    );

    // Business data is queried only after relevance and the authorized tool plan.
    const lastAssistant = [...allRows].reverse().find(row => row.role === 'assistant');
    const previousRow = lastAssistant?.status === 'complete' ? lastAssistant : undefined;
    const previousCards = Array.isArray(previousRow?.evidenceJson) ? previousRow.evidenceJson as any[] : [];
    const previousBusiness = previousCards.filter(card => card && card.tool !== 'report_file' && card.tool !== 'operating_report' && Array.isArray(card.rows));
    const previousAnswer = (previousRow?.usageJson as any)?.operatingAnswer;
    const priorPending = (lastAssistant?.usageJson as any)?.pendingClarification;
    const pickedClass =
      priorPending?.kind === 'class' && Array.isArray(priorPending.candidates)
        ? priorPending.candidates.filter((c: any) => c.code && content.includes(c.code))
        : [];
    let pendingClarification: any = null;
    const scopeDecision =
      pickedClass.length === 1
        ? 'business'
        : businessScope(content, previousBusiness.length > 0, uploadIds.length > 0);
    const INTENT_MAX_TOKENS = 800;
    const SUMMARY_MAX_TOKENS = CTX_BUDGET.summaryMax;
    const recentForIntent: Array<{ role: 'user' | 'assistant'; content: string }> =
      window.history.slice(-12);
    const todaySH = businessToday();
    const hasLegacyDraft = allRows.some(row => row.role === 'assistant'
      && ['collecting', 'ready'].includes((row.usageJson as any)?.pendingEntry?.status));
    const mappedUploadComparison = uploadIds.length > 0 && /上传|文件|文档|名单/.test(content) &&
      /对照|比对|对比|不一致/.test(content) &&
      !/删除|修改|SQL|密码|密钥|其他机构|成单|退费|续费|新签|出勤|课消|现金流|排课|课表/i.test(content) &&
      uploadIds.every((id: string) => ownedUpload(owner, id).mapping.length > 0);
    const attachmentContext = uploadIds.length
      ? JSON.stringify(
          uploadIds.map((id: string) => {
            const u = ownedUpload(owner, id);
            return {
              fileName: u.fileName,
              rowCount: u.rowCount,
              mapping: u.mapping,
              tables: u.tables
                .slice(0, 6)
                .map((t) => ({
                  name: t.name,
                  headers: t.headers.slice(0, 12).map((h) => h.slice(0, 80)),
                  rows: t.rows.length,
                })),
              paragraphs: u.paragraphs.length,
              preview: u.paragraphs.slice(0, 2).map((p) => p.text.slice(0, 300)),
            };
          })
        )
      : undefined;
    const intentMessages = buildIntentMessages(content, {
      history: recentForIntent,
      summary: window.summaryText,
      today: todaySH,
      attachments: attachmentContext,
    });
    const intentInputEst = intentMessages.reduce((sum, m) => sum + m.content.length, 0);
    const summaryInputEst = window.needsSummary ? CTX_BUDGET.total : 0;
    const plannedOutputTokens = INTENT_MAX_TOKENS * 2 + SUMMARY_MAX_TOKENS;
    let prepared: Awaited<ReturnType<typeof prepareChatTask>>;
    try {
      prepared = await prepareChatTask(
        currentUser,
        intentInputEst * 2 + 2000 + summaryInputEst,
        {
          conversationId: run.conversationId,
          plannedOutputTokens,
        }
      );
      preparedBillId = prepared.billId;
    } catch (err) {
      await prisma.aiMessage.update({
        where: { id: run.aiMsgId },
        data: { status: 'failed', content: '（AI 积分校验未通过，可重试）' },
      });
      throw err;
    }
    await prisma.aiMessage.update({
      where: { id: run.aiMsgId },
      data: { billId: prepared.billId },
    });

    // ===== SSE 响应头 =====
    startSse(res);
    writeSse(res, { conversationId, messageId: run.aiMsgId });

    // ===== R1-2：意图解析（带界历史+摘要+服务端日期；signal 贯穿；失败按直接回答） =====
    let intent: AiIntent = {};
    let queryPlanAudit: Record<string, unknown> | undefined;
    const teacherIntent = !/校区|机构|删除|修改数据|SQL|密码|密钥|绕过/.test(content)
      ? teacherRankingIntent(content) || teacherComparisonIntent(content, previousBusiness) : undefined;
    if (scopeDecision === 'business') intent = (deniedScope ? {parsedOk:true,reply:deniedScope} : undefined) || blockedChatEntryIntent(content, hasLegacyDraft)
      || (mappedUploadComparison ? {parsedOk:true,tools:[]} : undefined)
      || securityProbeIntent(content) || workbenchHelpIntent(content, uploadIds.length > 0)
      || explanationIntent(content, previousRow?.content) || generalAttendanceAdvice(content)
      || criticalMetricClarification(content) || newStudentAttendanceIntent(content, todaySH)
      || teacherIntent || orderMetricIntent(content, todaySH) || naturalAttendanceIntent(content, todaySH)
      || ((): AiIntent | undefined => {
          // 修复链式短路（复验 S07/C3 根因）：inheritPreviousIntent 未命中时返回的空对象会被
          // “||”当真值，导致排在链尾的实体承接/组合条件意图永远不被评估。此处仅在
          // 继承结果确有 reply/tools/复用语义时才视为命中，否则放行给后续意图。
          const inherited = inheritPreviousIntent(content, {}, previousBusiness, todaySH);
          return inherited && (inherited.reply || inherited.tools?.length || inherited.reuseSnapshot || inherited.fileRequested) ? inherited : undefined;
        })()
      || entitySwapFollowupIntent(content, previousBusiness)
      || duoStudentAttendanceIntent(content)
      || studentRankingIntent(content)
      || lowAttendanceRenewalIntent(content, previousBusiness) || intent;
    if (scopeDecision !== 'business')
      intent = {
        parsedOk: true,
        reply:
          scopeDecision === 'unrelated'
            ? SCOPE_REPLY
            : '请说明要查询的课务对象、指标或文件，例如：本月成单及退费汇总。',
      };
    if (pickedClass.length === 1 && !intent.reply) {
      const picked = pickedClass[0];
      const allowed = await prisma.class.findFirst({
        where: {
          id: picked.id,
          organizationId,
          campusId: owner.campusId,
          status: { not: 'deleted' },
        },
        select: { id: true },
      });
      intent = allowed
        ? {
            parsedOk: true,
            tools: (priorPending.plan.tools || []).map((t: any) => ({
              ...t,
              params: { ...t.params, classId: allowed.id },
            })),
          }
        : { parsedOk: true, reply: '该班级已变更，请重新提供班级名查询。' };
    }
    if (scopeDecision === 'business' && !intent.parsedOk && !clientDisconnected) {
      startCall('intent');
      try {
        const ir = await collectModel(intentMessages, {
          signal: upstreamAbort.signal,
          maxTokens: INTENT_MAX_TOKENS,
        });
        intent = parseIntent(ir.text);
        markCall('intent', ir.usage, clientDisconnected ? 'failed' : 'ok');
      } catch (err: any) {
        if (clientDisconnected) {
          markCall('intent', null, 'failed');
        } else {
          console.error('[AI] 意图解析失败（按直接回答处理）:', err?.message || err);
          markCall('intent', null, 'failed');
        }
      }
    }

    const previousCalendar = previousAnswer?.calendar || (previousBusiness[0]?.timeRange
      ? {observation:previousBusiness[0].timeRange} : undefined);
    const deniedEntity = scopeClarification(content,campus.name,intent.entities?.campus);
    if (deniedEntity) intent = {parsedOk:true,reply:deniedEntity};
    const explanationOnly = scopeDecision === 'business' && isExplanationRequest(content);
    if (!deniedEntity && explanationOnly && !intent.reply && intent.tools?.length)
      intent = { parsedOk: true, purpose: 'explanation', reply: '你想解释的是哪一句或哪个指标？把原话贴出来，我可以顺着这段内容解释。' };
    if (!deniedEntity && intent.subject === 'teacher' && intent.purpose !== 'advice' && !intent.reply) {
      const ranking = teacherRankingIntent(content);
      const focused = ranking || teacherComparisonIntent(content, previousBusiness);
      if (focused) {
        const named = intent.entities?.teacher;
        if (!ranking && named && content.includes(named)) focused.tools![0].params.teacherName = named;
        intent = { ...intent, ...focused };
      }
    }
    const localReply = Boolean(deniedEntity) || !usageCalls.some(c => c.purpose === 'intent') && Boolean(intent.reply);
    const directExplanation = intent.purpose === 'explanation' && Boolean(intent.reply) && explanationOnly;
    const topic = scopeDecision === 'business' && !localReply && !directExplanation
      ? adviceTopic(intent,content,previousAnswer?.topic) : undefined;
    const adviceContinuation = topic && previousAnswer?.topic === topic
      && /^(?:那|然后|接着|再|继续|请|能否|可以|说得|讲得|展开|具体|详细|一点|一些|些|说说|怎么落地|如何执行|[，。！？?\s])+$/.test(content);
    if (topic) {
      intent = { ...intent, reply:undefined };
      const generalAdvice = intent.purpose === 'advice' && /一般|通常|通用|不查数据/.test(content) &&
        !/本机构|本校区|根据|结合|我们|刚才|上周|本周|本月/.test(content);
      if (generalAdvice) intent.tools = [];
      if (topic === 'compensation' && intent.purpose !== 'mixed' && !/测算|试算.*(?:工资|薪资)|根据.*(?:数据|历史)/.test(content)) intent.tools = [];
      if (!generalAdvice && topic === 'teacher' && /表现|目标|绩效/.test(content)) {
        const teacher = intent.tools?.find(t=>t.name==='teacher_performance');
        const selectedName = intent.entities?.teacher;
        const teacherQuery = teacher || {name:'teacher_performance',params:{}};
        if (selectedName && content.includes(selectedName)) teacherQuery.params.teacherName = selectedName;
        const otherRequested = (intent.tools || []).filter(t=>/低出勤/.test(content) && t.name.startsWith('low_attendance_'));
        intent.tools = [teacherQuery, ...otherRequested];
      }
    } else if (intent.reply && !localReply && !directExplanation && intent.parsedOk) {
      // A direct model reply has no evidence bindings. Render its purpose from
      // server-owned labels, even if the model phrased an assertion as a question.
      const definitions = [
        [/净成单/, '净成单额等于已确认新签金额加已确认续费金额，再减已通过退费金额。'],
        [/出勤|到课/, '出勤率按已完成场次的实到人次合计除以应到人次合计计算，到课与迟到均计入实到。'],
        [/续费率/, '到期续费率需要同一期间到期学员中已续费的人数及该批到期人数。续费订单笔数不能代替人数。'],
      ] as const;
      const definition = /口径|定义|公式|怎么算|如何计算/.test(content) && definitions.find(([rx])=>rx.test(content));
      intent.reply = definition ? definition[1] : intent.subject === 'other' ? SCOPE_REPLY
        : '请说明要了解的业务对象、指标或期间，以便从本校区资料核对。';
    }
    if (adviceContinuation && previousBusiness.length) intent = {...intent,reuseSnapshot:true};
    const calendarFor = (plan: AiIntent) => adviceContinuation && previousCalendar ? previousCalendar as ReturnType<typeof resolveBusinessCalendar> : resolveBusinessCalendar({question:content,today:todaySH,intent:plan,previous:previousCalendar});
    let calendar = calendarFor(intent);
    // The parser extracts only phrases grounded in this request; actual dates are server-owned.
    const bindPlan = (plan: AiIntent): AiIntent => {
      plan = bindUserThreshold(plan,content,!usageCalls.some(c=>c.purpose === 'intent') && previousBusiness.length>0);
      if (!plan.parsedOk || plan.reply) return plan;
      calendar = calendarFor(plan);
      if (calendar.clarification) return {parsedOk:true,reply:calendar.clarification};
      if (plan.reuseSnapshot) return plan;
      if (calendar.explicit && calendar.observation.end < todaySH && plan.tools?.length
        && plan.tools.every(t=>AI_TOOLS.some(d=>d.name===t.name) && !supportsHistoricalPeriod(t))) {
        // 盲测修复（S06R4）：改期追问撞上快照类工具时，优先复用上一轮可回溯期间的同款查询，而不是直接拒绝。
        if (previousBusiness.length) {
          const inherited = inheritPreviousIntent(content, { parsedOk: true, tools: [] }, previousBusiness, todaySH);
          if (inherited.tools?.length) return { ...inherited, tools: calendarTools(inherited, calendar) };
        }
        return {parsedOk:true,reply:'该资料只能查询当前快照，无法还原 '+calendar.observation.start+' 至 '+calendar.observation.end+' 的历史状态。请指定需要按业务日期统计的指标。'};
      }
      const tools = calendarTools(plan,calendar);
      if (exceedsCalendarToolLimit(tools)) return {parsedOk:true,reply:'请将比较缩小到两组业务指标，再核对每组的本期与基期。'};
      return {...plan,tools};
    };
    intent = bindPlan(localReply ? intent : alignMeasures(intent,content));
    // Validate before any business query. One bounded repair is metered as a separate call.
    if (intent.parsedOk && !intent.reply && intent.tools?.length) {
      const checked = validateToolPlan(intent.tools);
      if (!checked.errors.length) intent.tools = checked.tools;
      else {
        queryPlanAudit = { initialTools: intent.tools, validationErrors: checked.errors, repairAttempted: !clientDisconnected };
        if (!clientDisconnected) {
          startCall('intent_repair');
          try {
            const repaired = await collectModel([...intentMessages, {
              role: 'system',
              content: '前一个查询计划未执行，参数校验失败。纠正一次，只输出带完整必填参数的tools JSON，不输出reply，不重复调用。'
                + JSON.stringify({ plan: intent.tools, errors: checked.errors }),
            }], { signal: upstreamAbort.signal, maxTokens: INTENT_MAX_TOKENS });
            const candidate = bindPlan(alignMeasures(parseIntent(repaired.text),content));
            const fixed = validateToolPlan(candidate.tools || []);
            const valid = candidate.parsedOk === true && !candidate.reply && fixed.tools.length > 0 && fixed.errors.length === 0;
            intent = valid ? { ...candidate, tools: fixed.tools } : { parsedOk: false };
            queryPlanAudit.repairSucceeded = valid;
            queryPlanAudit.repairedTools = valid ? fixed.tools : [];
            markCall('intent_repair', repaired.usage, valid ? 'ok' : 'failed');
          } catch (e: any) {
            queryPlanAudit.repairSucceeded = false;
            intent = { parsedOk: false };
            markCall('intent_repair', null, 'failed');
          }
        } else intent = { parsedOk: false };
      }
    }

    // R2-5：意图阶段失败（调用异常，或调用成功但输出不可解析）→ 明确失败结果，
    // 不降级为正文自由回答编造（合法 {tools:[]} 空计划不算失败，正常走正文）
    const intentCall = usageCalls.find((c) => c.purpose === 'intent');
    const intentBroken =
      (!!intentCall && (intentCall.status === 'failed' || (intentCall.status === 'ok' && intent.parsedOk !== true)))
      || (Boolean(queryPlanAudit) && intent.parsedOk !== true);
    if (intentBroken) {
      const failText =
        '这次未能生成完整的查询计划，尚未查询业务数据或生成分析，请重试。';
      await prisma.aiMessage.update({
        where: { id: run.aiMsgId },
        // 用户已断开时按停止归档（stopped），其余按完成（内容为明确失败说明）
        data: {
          content: clientDisconnected ? '' : failText,
          status: clientDisconnected ? 'stopped' : 'complete',
          usageJson: { calls: usageCalls, ...(queryPlanAudit ? { queryPlan: queryPlanAudit } : {}) } as any,
        },
      });
      await prisma.aiConversation.update({
        where: { id: run.conversationId },
        data: { updatedAt: new Date() },
      });
      try {
        const combinedEarly = usageCalls
          .filter((c) => c.usage)
          .reduce(
            (a, c) => ({
              promptTokens: a.promptTokens + (c.usage?.promptTokens ?? 0),
              completionTokens: a.completionTokens + (c.usage?.completionTokens ?? 0),
            }),
            { promptTokens: 0, completionTokens: 0 }
          );
        const rEarly = await settleChatTask(prepared.billId, {
          usage: usageCalls.some((c) => c.usage) ? combinedEarly : null,
          calls: usageCalls,
          clientAborted: false,
          upstreamError: null,
          usageIncomplete: true,
        });
        if (!clientDisconnected && !res.writableEnded) {
          writeSse(res, {
            credits: {
              settled: fmtMicros(rEarly.settledMicros),
              balance: fmtMicros(rEarly.balanceMicros),
            },
          });
        }
      } catch (err: any) {
        console.error('[AI] 意图失败路径结算失败:', err?.message || err);
      }
      if (!clientDisconnected && !res.writableEnded) {
        writeSse(res, { delta: failText });
        writeSse(res, { done: true });
      }
      if (!res.writableEnded) res.end();
      return;
    }

    timings.intentMs = Date.now() - startedAt;
    if (scopeDecision === 'business' && intent.parsedOk) {
      if (!intent.reuseSnapshot && !intent.tools?.length) intent = inheritPreviousIntent(content, intent, previousBusiness, todaySH);
      intent = normalizeBusinessFilters(content, intent);
      if (mappedUploadComparison && !intent.reply) {
        intent = { parsedOk: true, tools: [], ...(isFileRequest(content) ? {
          fileRequested: true, fileFormats: requestedFormats(content),
        } : {}) };
      }
      if (isFileRequest(content) && !intent.reply) {
        intent.fileRequested = true;
        intent.fileFormats = requestedFormats(content);
      }
      if (
        /成单|新签|续费/.test(content) &&
        /退费|退款|退了|退多少|已退/.test(content) &&
        !intent.reply
      ) {
        intent.tools = calendarTools({tools:[{name:'cost_and_income',params:{}}]},calendar);
      }
      const quotedClass = content.match(/[「“"]([^」”"]*班)[」”"]/);
      const asksSchedule = /排课|课表|上课时间/.test(content);
      const asksAttendance = /应到|实到|出勤|到课/.test(content);
      const classMeasure = /班/.test(content) && (asksSchedule || asksAttendance) &&
        !/学员.{0,5}(名单|个人)|低出勤|出勤下降|环比|同比|新签|退费|续费/.test(content)
        ? (asksSchedule ? 'schedules' : 'attendance') : undefined;
      if ((quotedClass || classMeasure) && !intent.reply && !intent.reuseSnapshot) {
        const candidates = quotedClass
          ? await prisma.class.findMany({where:{organizationId,campusId:currentUser.campusId,name:{contains:quotedClass[1]},status:{not:'deleted'}},select:{id:true,name:true,code:true},take:21})
          : await prisma.$queryRaw<Array<{id:string;name:string;code:string}>>`
              SELECT id,name,code FROM classes WHERE "organizationId"=${organizationId}
                AND "campusId"=${currentUser.campusId} AND status<>'deleted' AND length(name)>1
                AND strpos(${content},name)>0 ORDER BY length(name) DESC,id LIMIT 21`;
        if (classMeasure && candidates.length) {
          const plan = {...intent,tools:classMeasure === 'schedules'
            ? [{name:'business_records',params:{domain:'schedules'}}, ...(/实到|出勤|到课/.test(content) ? [{name:'class_attendance',params:{}}] : [])]
            : [{name:'class_attendance',params:{}}]};
          intent = {...plan,tools:calendarTools(plan,calendar)};
        }
        if (candidates.length > 1)
          pendingClarification = {
            kind: 'class', plan: classClarificationPlan(content, intent, todaySH), candidates,
          };
        if (candidates.length > 1 || (quotedClass && !candidates.length))
          intent = {
            parsedOk: true,
            reply: candidates.length
              ? '匹配到多个班级，请提供班级代码：' +
                candidates.map((c) => c.name + '（' + c.code + '）').join('、')
              : '未找到该班级，请核对班级名或代码。',
          };
        else if (candidates.length === 1 &&
          intent.tools?.some((t) => !AI_TOOLS.find((d) => d.name === t.name)?.paramsSchema.classId)
        )
          intent = {
            parsedOk: true,
            reply: '该查询尚不支持按指定班级筛选，请改用班级出勤或学员明细查询。',
          };
        else if (candidates.length === 1)
          intent.tools = intent.tools?.map((t) => ({
            ...t,
            params: { ...t.params, classId: candidates[0].id },
          }));
      }
    }
    // 查询和导出使用相同日期与数据类型。
    const inheritedPeriod = previousBusiness[0]?.timeRange;
    const fileOnly =
      uploadIds.length > 0 &&
      /上传|文件|文档|名单/.test(content) &&
      !/成单|退费|续费|新签|出勤|课消|现金流|排课|课表/.test(content);
    const plannedTools = fileOnly ? [] : intent.tools || [];
    // 跨期合计（复验必修 M1）：仅在问句明确要求两期合计（两期/两周/两个月…合计/一共/比例）
    // 且本轮未自带显式期间时，才引入另一期间；显式单期间只查单期。
    const asksCrossPeriodSum = /(?:两|二|双)(?:段|期|周|个月|个期间)[^。？?]{0,8}(?:合计|一共|总共|总和|加起来|合起来|比例)|两期合计|两周合计/.test(content)
      && !/(?:\d{4}年|\d{1,2}月\d{1,2}|\d{4}-\d{1,2}|上月|上个月|本月|这周|上周|最近|半年|去年|今年|今天|昨天)/.test(content);
    if (asksCrossPeriodSum && !intent.reply && !intent.reuseSnapshot) {
      const base = plannedTools.find(t => ['signup_renewal','cost_and_income'].includes(t.name));
      if (base) {
        // 另一期优先取解析出的比较期；否则取全会话历史中同款工具最近一个不同窗口的卡片。
        let second: { start: string; end: string } | null | undefined = calendar.comparison;
        if (!second) {
          const prevCards = allRows.filter(r => r.role === 'assistant').reverse()
            .flatMap(r => Array.isArray(r.evidenceJson) ? (r.evidenceJson as any[]) : [])
            .filter(c => c && c.tool === base.name && !c.error && c.timeRange?.start && c.timeRange?.end);
          const other = prevCards.find(c => c.timeRange.start !== String(base.params.startDate ?? '') || c.timeRange.end !== String(base.params.endDate ?? ''));
          second = other?.timeRange ?? null;
        }
        if (second && (second.start !== String(base.params.startDate ?? '') || second.end !== String(base.params.endDate ?? ''))) {
          plannedTools.push({ name: base.name, params: { ...base.params, startDate: second.start, endDate: second.end } });
        }
      }
    }
    let evidences: Evidence[] = [];
    if (!clientDisconnected && !intent.reply) {
      if (intent.reuseSnapshot) {
        for (const card of previousBusiness)
          if (card.tool === 'uploaded_file') ownedUpload(owner, String(card.filters?.uploadId));
        evidences = previousBusiness.map((card) => ({
          ...card,
          modelText: JSON.stringify({
            汇总: card.totals,
            预览: card.rows?.slice(0, 8),
            口径: card.caliber,
            期间: card.timeRange,
          }).slice(0, 5000),
        }));
      } else if (plannedTools.length)
        evidences = await runPlannedTools(
          {
            organizationId,
            campusId: currentUser.campusId,
            today: todaySH,
            userId: owner.userId,
            personnelActor: req.user,
            signal: upstreamAbort.signal,
          },
          plannedTools
        );
      if (uploadIds.length) {
        const uploaded = await uploadEvidence(owner, [...new Set(uploadIds)] as string[]);
        evidences.push(...uploaded);
      }
      if (!evidences.length && !topic && !(intent.reuseSnapshot && previousAnswer?.adviceText))
        intent = {
          parsedOk: true,
          reply: '当前问题尚未定位到可用数据，请明确业务指标、班级或期间。',
        };
    }
    timings.dataMs = Date.now() - startedAt;

    const operatingSnapshot = buildOperatingSnapshot(evidences);
    const adviceText: string | undefined = intent.reply ? undefined
      : topic ? renderOperatingAdvice(topic,intent.actionIds || [],calendar,operatingSnapshot)
      : intent.reuseSnapshot && typeof previousAnswer?.adviceText === 'string' ? previousAnswer.adviceText : undefined;
    // Render every format from the exact same verified, immutable evidence payload.
    const fileCards: Record<string, unknown>[] = [];
    if (!clientDisconnected && !intent.reply && intent.fileRequested === true) {
      try {
        if ((!evidences.length && !adviceText) || evidences.some((c) => c.error))
          throw new Error('查询未完整成功，本次未生成文件');
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        });
        const cards = evidences.map(({ modelText, ...card }) => card);
        const period = evidences.find((c) => c.timeRange)?.timeRange ||
          (intent.reuseSnapshot ? inheritedPeriod : null) || { start: todaySH, end: todaySH };
        const formats = [
          ...new Set(intent.fileFormats?.length ? intent.fileFormats : requestedFormats(content)),
        ];
        for (const format of formats) {
          const task = await createOrGetReportFileTask(owner, {
            requestId: requestId + ':' + format,
            conversationId,
            messageId: run.aiMsgId,
            billId: prepared.billId,
            title: evidences.length ? evidences[0].title + '分析报告' : '管理建议',
            periodStart: period.start,
            periodEnd: period.end,
            paramsJson: {
              format,
              snapshotVersion: operatingSnapshot.version,
              institutionName: org?.name || '本机构',
              sourceMessageId: intent.reuseSnapshot ? previousRow?.id : null,
              tool: evidences[0]?.tool || 'management_advice',
              adviceText,
            },
            evidenceJson: cards as any,
          });
          if (!task.duplicate) await generateReportFile(task.id);
          const row = await prisma.aiReportFile.findUniqueOrThrow({ where: { id: task.id } });
          const card = buildFileCard(row);
          fileCards.push(card);
          writeSse(res, { fileCard: publicChatCards([card])[0] });
        }
      } catch (err: any) {
        const card = {
          type: 'file',
          tool: 'report_file',
          status: 'failed',
          title: '业务分析报告',
          fileName: null,
          fileId: null,
          downloadUrl: null,
          error: String(err?.message || '生成失败').slice(0, 200),
        };
        fileCards.push(card);
        writeSse(res, { fileCard: publicChatCards([card])[0] });
      }
    }
    timings.filesMs = Date.now() - startedAt;
    let fullText = '';
    if (!clientDisconnected) {
      const sections: string[] = [];
      if (intent.reply) sections.push(intent.reply);
      else {
        const tableRequested = requestsTable(content,intent) || intent.reuseSnapshot && isFileRequest(content);
        const teacherCards = evidences.filter(c => ['teacher_performance_comparison', 'teacher_performance_ranking'].includes(c.tool) && !c.error);
        for (const card of teacherCards) sections.push(card.tool === 'teacher_performance_ranking' ? renderTeacherRanking(card) : renderTeacherComparison(card));
        const condensedIds = new Set(teacherCards.map(c => c.evidenceId));
        const visibleSnapshot = teacherCards.length
          ? { ...operatingSnapshot, facts: operatingSnapshot.facts.filter(f => !condensedIds.has(f.source)) }
          : operatingSnapshot;
        const facts = renderOperatingFacts(visibleSnapshot,{
          factIds: calendar.comparison ? comparisonFactIds(content,visibleSnapshot.facts) : undefined,
          compare: (!teacherCards.length || visibleSnapshot.facts.length > 0) &&
            (Boolean(calendar.comparison) || /偏低|偏高|是否达标|表现如何/.test(content)),
          includeRows: !tableRequested && (/哪些|哪几|哪个|哪位|谁|排名|排行|各班|明细|名单|列出|详情|来源|对照|同名|姓名相同/.test(content) || evidences.some(e=>e.tool==='student_attendance'))
        });
        if (facts && !tableRequested) sections.push(facts);
        if (tableRequested) {
          const totals = visibleSnapshot.facts.filter(f=>f.kind === 'metric' && !f.entityName);
          const groups = new Map<string,typeof totals>();
          for (const fact of totals) {
            const range = fact.period ? fact.period.start+' 至 '+fact.period.end : '当前快照';
            const key = fact.sourceTitle+' · '+range;
            const group = groups.get(key) || [];
            group.push(fact);
            groups.set(key,group);
          }
          const cell = (v: unknown)=>String(v ?? '缺少数据').replace(/[|\r\n]/g,' ');
          for (const [title,metrics] of groups) {
            sections.push([title,'','| 指标 | 数值 |','| --- | --- |',...metrics.map(f=>
              '| '+cell(f.label)+' | '+cell(f.value)+(f.value===null?'':f.unit)+(f.coverage==='partial'?'（部分数据）':'')+' |'
            )].join('\n'));
          }
          const notes = visibleSnapshot.facts.filter(f=>['missing','distribution','comparison'].includes(f.kind));
          const shown = renderOperatingFacts({...visibleSnapshot,facts:notes});
          if (shown) sections.push(shown.split('\n').filter(line=>!groups.has(line)).join('\n'));
        }
        if (tableRequested) sections.push(...evidences.filter(c=>!c.error && !['cost_and_income','signup_renewal'].includes(c.tool)).map(renderEvidenceTable).filter(Boolean));
        // 跨期合计小节：仅两期合计问法渲染；两期相交时澄清而不相加。
        if (asksCrossPeriodSum) {
          const moneyCards = evidences.filter(c => ['signup_renewal','cost_and_income'].includes(c.tool) && !c.error && c.timeRange && typeof c.totals?.['金额合计'] === 'number');
          const seen = new Set<string>();
          const uniq = moneyCards.filter(c => { const k = c.timeRange!.start + '..' + c.timeRange!.end; if (seen.has(k)) return false; seen.add(k); return true; });
          if (uniq.length === 2) {
            const [a, b2] = uniq;
            const overlaps = a.timeRange!.start <= b2.timeRange!.end && b2.timeRange!.start <= a.timeRange!.end;
            if (overlaps) {
              sections.push('两个期间有重叠（' + a.timeRange!.start + ' 至 ' + a.timeRange!.end + ' 与 ' + b2.timeRange!.start + ' 至 ' + b2.timeRange!.end + '），直接相加会重复计算。请确认要合计的具体期间，或按订单去重的口径。');
            } else {
            const ma = a.totals['金额合计'] as number, mb = b2.totals['金额合计'] as number;
            const total = ma + mb;
            const share = total > 0 ? Math.round((ma / total) * 1000) / 10 : null;
            const share2 = total > 0 ? Math.round((mb / total) * 1000) / 10 : null;
            sections.push('两期合计：' + a.timeRange!.start + ' 至 ' + a.timeRange!.end + ' ¥' + ma.toLocaleString('zh-CN') + '，' + b2.timeRange!.start + ' 至 ' + b2.timeRange!.end + ' ¥' + mb.toLocaleString('zh-CN') + '；合计 ¥' + total.toLocaleString('zh-CN') + (share != null ? '；占比 ' + share + '% / ' + share2 + '%' : '') + '。');
            }
          }
        }
        if (adviceText) sections.push(adviceText);
        if (fileCards.some(c=>c.status==='ready')) sections.push('文件已按本次查询快照生成，可在下方下载。');
        if (fileCards.some(c=>c.status==='failed')) sections.push('部分文件未生成成功，可重试导出。');
      }
      for (const section of sections) {
        if (clientDisconnected || res.destroyed) break;
        const delta = (fullText ? '\n\n' : '') + section;
        writeSse(res,{delta});
        fullText += delta;
      }
      timings.firstOutputMs = Date.now() - startedAt;
    }

    // ===== 摘要压缩（达到预算才调用；signal 贯穿；输出受 SUMMARY_MAX_TOKENS 约束） =====
    if (
      !intent.reply &&
      window.needsSummary &&
      window.summaryUpToId &&
      !clientDisconnected &&
      !(await summarySuppressed(run.conversationId))
    ) {
      startCall('summary');
      try {
        const sr = await updateSummary(
          owner,
          run.conversationId,
          window.summaryUpToId,
          async (msgs) => {
            let text = '';
            let su: { promptTokens: number; completionTokens: number } | null = null;
            for await (const d of streamGlmChat(msgs, upstreamAbort.signal, {
              maxTokens: SUMMARY_MAX_TOKENS,
              onUsage: (u) => {
                su = u;
              },
            })) {
              text += d;
            }
            return { text, usage: su! };
          }
        );
        if (sr.used && sr.usage) {
          markCall('summary', sr.usage, 'ok');
          writeSse(res, { summaryUpdated: true });
        } else if (!sr.used) {
          markCall('summary', null, 'skipped');
          if (window.truncated) writeSse(res, { historyTruncated: true });
        }
      } catch (err: any) {
        console.error('[AI] 摘要生成失败（已退回有界近期历史）:', err?.message || err);
        markCall('summary', null, 'failed');
      }
    }

    if (
      /股票|旅游|推荐.*手机/.test(content) &&
      scopeDecision === 'business' &&
      !intent.reply &&
      !clientDisconnected
    ) {
      const refusal = '\n与课务无关的部分不受理。';
      fullText += refusal;
      writeSse(res, { delta: refusal });
    }
    for (const call of usageCalls) {
      if (call.status === 'started') {
        call.status = clientDisconnected ? 'stopped' : 'usage_missing';
        call.durationMs = call.startedAt ? Date.now() - Date.parse(call.startedAt) : 0;
        call.usageSource = 'missing';
      }
    }
    // ===== 结算（R1-4：usage 完整性驱动；意图/正文/摘要合并同一账单） =====
    const finalStatus = clientDisconnected ? 'stopped' : 'complete';
    let creditsFeedback: { settled: string; balance: string } | null = null;
    const knownUsage = usageCalls.filter((c) => c.usage);
    const combined =
      knownUsage.length > 0
        ? knownUsage.reduce(
            (a, c) => ({
              promptTokens: a.promptTokens + (c.usage?.promptTokens ?? 0),
              completionTokens: a.completionTokens + (c.usage?.completionTokens ?? 0),
            }),
            { promptTokens: 0, completionTokens: 0 }
          )
        : null;
    // 任一已启动且未跳过的子调用缺 usage → 整轮不完整（Codex §4：不得伪装完整结算）
    const usageIncomplete = usageCalls.some(
      (c) =>
        c.status !== 'skipped' &&
        (!c.usage ||
          ((c.usage as any).actualModel && (c.usage as any).actualModel !== activeAiModel()))
    );
    try {
      const r = await settleChatTask(prepared.billId, {
        usage: combined,
        calls: usageCalls,
        clientAborted: clientDisconnected,
        upstreamError: null,
        usageIncomplete,
      });
      creditsFeedback = {
        settled: fmtMicros(r.settledMicros),
        balance: fmtMicros(r.balanceMicros),
      };
    } catch (err: any) {
      console.error('[AI] 积分结算失败:', err?.message || err);
    }

    // ===== R1-10：消息终态在摘要与结算之后落库（运行锁覆盖完整生命周期） =====
    const savedContent = fullText;
    await prisma.aiMessage.update({
      where: { id: run.aiMsgId },
      data: {
        content: savedContent,
        status: finalStatus,
        evidenceJson: [
          ...(evidences.length > 0 ? (evidences.map(({ modelText, ...card }) => card) as any) : []),
          ...fileCards,
        ] as any,
        usageJson: {
          calls: usageCalls,
          requestId,
          model: activeAiModel(),
          provider: activeAiProviderLabel(),
          synthetic: activeAiModel() === 'mock-recorded-v1',
          elapsedMs: Date.now() - startedAt,
          timings,
          uploadIds,
          localOperations: { parseAndRenderModelCalls: 0 },
          pendingClarification,
          ...(queryPlanAudit ? { queryPlan: queryPlanAudit } : {}),
          operatingAnswer: {version:operatingSnapshot.version,calendar,adviceText,topic:adviceText ? topic || previousAnswer?.topic : undefined,
            factIds:operatingSnapshot.facts.map(f=>f.id),purpose:intent.purpose,subject:intent.subject,actions:intent.actionIds},
          queryErrors:evidences.filter(c=>c.error).map(c=>({tool:c.tool,error:c.error})),
        } as any,
      },
    });
    await prisma.aiConversation.update({
      where: { id: run.conversationId },
      data: { updatedAt: new Date() },
    });

    if (!clientDisconnected && !res.writableEnded) {
      if (creditsFeedback) {
        writeSse(res, { credits: creditsFeedback });
      }
      writeSse(res, { done: true });
    }
    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    // R1-11：预留后任意异常路径——先收尾账单（不留永久 reserved），再落消息终态
    if (run) {
      if (preparedBillId) {
        try {
          const known = usageCalls.filter((c) => c.usage);
          const combined =
            known.length > 0
              ? known.reduce(
                  (a, c) => ({
                    promptTokens: a.promptTokens + (c.usage?.promptTokens ?? 0),
                    completionTokens: a.completionTokens + (c.usage?.completionTokens ?? 0),
                  }),
                  { promptTokens: 0, completionTokens: 0 }
                )
              : null;
          await settleChatTask(preparedBillId, {
            usage: combined,
            clientAborted: clientDisconnected,
            upstreamError: `route-exception: ${String((error as any)?.message || error).slice(0, 120)}`,
            usageIncomplete: true,
          });
        } catch (settleErr: any) {
          console.error('[AI] 异常路径结算失败（账单留待核对）:', settleErr?.message || settleErr);
        }
      }
      await prisma.aiMessage.updateMany({
        where: { id: run.aiMsgId, status: 'streaming' },
        data: { status: 'failed', content: '（处理失败，可重试）' },
      });
    }
    next(error);
  }
});

// ==================== 会话运行（事务锁/幂等/并发） ====================

/** 流式响应头 */
function startSse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/** 非流式收集一次模型输出（意图/摘要阶段用；usage 记入同一账单） */
async function collectModel(
  messages: ChatMessage[],
  opts?: { signal?: AbortSignal; maxTokens?: number }
): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number } | null }> {
  let text = '';
  let usage: { promptTokens: number; completionTokens: number } | null = null;
  for await (const d of streamGlmChat(messages, opts?.signal, {
    maxTokens: opts?.maxTokens,
    onUsage: (u) => {
      usage = u;
    },
  })) {
    text += d;
  }
  return { text, usage };
}

interface RunContext {
  conversationId: string;
  userMsgId: string;
  userMsgSeq: number;
  aiMsgId: string;
  isRetry: boolean;
}

/**
 * 事务内开跑：行锁 → 归属校验 → 幂等查重 → 并发锁 → 落用户消息 + assistant 占位。
 * - 同 requestId 已存在 → 返回 replay 信号（不建任务不双扣）
 * - 会话已有 streaming 消息 → 409 CONVERSATION_BUSY（序列/版本锁）
 * - 重试复用：上一条用户消息同内容且回复已终止（stopped/failed）→ 复用用户消息，只建新回复
 */
async function beginChatRun(
  owner: ConversationOwner,
  conversationId: string,
  content: string,
  requestId: string
): Promise<RunContext | { replay: { userContent: string; aiContent: string; aiStatus: string; evidenceJson: unknown } }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ai-request:' + requestId}))`;
    await tx.$queryRaw`SELECT id FROM ai_conversations WHERE id = ${conversationId} FOR UPDATE`;
    const conv = await tx.aiConversation.findFirst({
      where: {
        id: conversationId,
        ownerUserId: owner.userId,
        organizationId: owner.organizationId,
        campusId: owner.campusId,
        status: 'active',
      },
    });
    if (!conv) throw new ApiError('会话不存在或无权访问', 404, 'CONVERSATION_NOT_FOUND');

    // R1-10 + 补修1：崩溃恢复租约——区分「刚开始」与「崩溃残留」：
    // - 有 billId 且 reserved → 真在跑 → 409
    // - 有 billId 且已终态 → 崩溃残留 → 标 failed 放行
    // - 无 billId 且创建距今 < RUN_LEASE_GRACE_MS → 占位已建、账单未绑的在途窗口 → 409
    //   （原实现直接判崩溃误杀并发/在途运行，产生双成功双账单——Codex 复验实测）
    // - 无 billId 且超宽限 → 预留前崩溃残留 → 标 failed 放行（不永久卡 streaming）
    const stale = await tx.aiMessage.findFirst({
      where: { conversationId, status: 'streaming' },
      orderBy: { sequence: 'desc' },
    });
    if (stale) {
      const staleBill = stale.billId
        ? await tx.aiTaskBill.findUnique({ where: { id: stale.billId } })
        : null;
      if (staleBill) {
        if (staleBill.status === 'reserved') {
          throw new ApiError('同一会话已有进行中的对话', 409, 'CONVERSATION_BUSY');
        }
      } else {
        const ageMs = Date.now() - new Date(stale.createdAt).getTime();
        if (ageMs < RUN_LEASE_GRACE_MS) {
          throw new ApiError('同一会话已有进行中的对话', 409, 'CONVERSATION_BUSY');
        }
      }
      await tx.aiMessage.update({
        where: { id: stale.id },
        data: { status: 'failed', content: stale.content || '（处理中断，可重试）' },
      });
    }

    // R1-1：requestId 挂在 assistant 消息（每次运行=一个回复），重试天然携带新键；
    // 回放取该键自身关联的 user(前一条)+assistant，不会误取相邻旧失败回答
    const dup = await tx.aiMessage.findUnique({ where: { requestId } });
    if (dup) {
      if (dup.conversationId !== conversationId || dup.role !== 'assistant') {
        throw new ApiError('该 requestId 已被其他会话占用', 409, 'REQUEST_ID_CONFLICT');
      }
      if (dup.status === 'streaming') {
        throw new ApiError('该请求正在进行中', 409, 'CONVERSATION_BUSY');
      }
      // 原问 = 该运行之前最近的一条 user（重试运行的前一条可能是旧 assistant）
      const userMsg = await tx.aiMessage.findFirst({
        where: { conversationId, role: 'user', sequence: { lt: dup.sequence } },
        orderBy: { sequence: 'desc' },
      });
      if (userMsg?.content !== content) throw new ApiError('该请求编号已用于另一条问题',409,'REQUEST_ID_CONFLICT');
      return {
        replay: {
          userContent: userMsg?.content ?? '',
          aiContent: dup.content,
          aiStatus: dup.status,
          evidenceJson: dup.evidenceJson,
        },
      };
    }

    // 并发锁（崩溃恢复后复查）
    const streaming = await tx.aiMessage.findFirst({
      where: { conversationId, status: 'streaming' },
    });
    if (streaming) throw new ApiError('同一会话已有进行中的对话', 409, 'CONVERSATION_BUSY');

    // 重试复用：最后 user 同内容且相邻 assistant 已终止 → 复用用户消息，只建新回复（新键）
    const lastTwo = await tx.aiMessage.findMany({
      where: { conversationId },
      orderBy: { sequence: 'desc' },
      take: 2,
    });
    const lastUser = lastTwo.find((m) => m.role === 'user');
    const lastAiAdjacent = lastTwo.find(
      (m) => m.role === 'assistant' && lastUser && m.sequence === lastUser.sequence + 1
    );
    const isRetry = Boolean(
      lastUser &&
      lastUser.content === content &&
      lastAiAdjacent &&
      (lastAiAdjacent.status === 'stopped' || lastAiAdjacent.status === 'failed')
    );
    const maxSeq = lastTwo[0]?.sequence ?? 0;
    if (isRetry) {
      const aiMsg = await tx.aiMessage.create({
        data: {
          conversationId,
          sequence: maxSeq + 1,
          role: 'assistant',
          content: '',
          status: 'streaming',
          requestId,
        },
      });
      return {
        conversationId,
        userMsgId: lastUser!.id,
        userMsgSeq: lastUser!.sequence,
        aiMsgId: aiMsg.id,
        isRetry: true,
      };
    }
    const userMsg = await tx.aiMessage.create({
      data: { conversationId, sequence: maxSeq + 1, role: 'user', content, status: 'complete' },
    });
    const aiMsg = await tx.aiMessage.create({
      data: {
        conversationId,
        sequence: maxSeq + 2,
        role: 'assistant',
        content: '',
        status: 'streaming',
        requestId,
      },
    });
    return {
      conversationId,
      userMsgId: userMsg.id,
      userMsgSeq: userMsg.sequence,
      aiMsgId: aiMsg.id,
      isRetry: false,
    };
  });
}

/** 本进程启动时刻（实例标识）：测试脚本用它确认探测到的是"本次新起的实例"，
 *  而不是残留旧实例占着端口（补修4——Codex 复验点名）。 */
const PROCESS_BOOT_TS = Date.now();

/** 诊断（鉴权后）：供应商/模型标签 + 实例标识。测试脚本启动前硬校验：
 *  非 mock 拒跑；bootTs 早于脚本 spawn 时间说明端口被旧实例占用，同样拒跑。 */
// ==================== G3 步骤3：报告文件（下载/状态/重试） ====================

/** 文件状态（进行中/成功/失败可查；归属校验） */
aiRoutes.get('/report-files/:id', async (req: AuthRequest, res, next) => {
  try {
    const owner = ownerOf(req);
    const row = await getReportFileForActor(owner, req.params.id);
    sendSuccess(res, {
      file: {
        id: row.id,
        status: row.status,
        title: row.title,
        fileName: row.fileName,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        error: row.error,
        downloadCount: row.downloadCount,
        createdAt: row.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/** 下载：服务端鉴权；仅 ready 且磁盘文件存在；重复下载不消费 */
aiRoutes.get('/report-files/:id/download', async (req: AuthRequest, res, next) => {
  try {
    const owner = ownerOf(req);
    const row = await getReportFileForActor(owner, req.params.id);
    if (row.status === 'processing') {
      return next(new ApiError('报告仍在生成中，请稍后再试', 409, 'REPORT_PROCESSING'));
    }
    if (row.status !== 'ready') {
      return next(
        new ApiError(
          '报告未生成成功：' + (row.error || '请重试或重新发起'),
          409,
          'REPORT_NOT_READY'
        )
      );
    }
    const exists = fs.existsSync(row.filePath || '');
    if (!exists) {
      return next(
        new ApiError(
          '报告文件已丢失，请点击重试从快照重新生成（不重复消费）',
          410,
          'REPORT_FILE_MISSING'
        )
      );
    }
    const verifiedBuffer = verifiedReportFileBuffer(row);
    res.setHeader('Cache-Control', 'private, no-store');
    await prisma.aiReportFile.update({
      where: { id: row.id },
      data: { downloadCount: { increment: 1 } },
    });
    res.setHeader(
      'Content-Type',
      row.fileName?.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="' + encodeURIComponent((row.fileName || 'report.xlsx').replace(/(\.[^.]+)$/, '_' + row.periodStart + '_' + row.periodEnd + '_' + row.id.slice(0,8) + '$1')) + '"'
    );
    res.send(verifiedBuffer);
  } catch (error) {
    next(error);
  }
});

/** 失败重试：复用分析快照重新排版（不调用模型、不新增账单） */
aiRoutes.post('/report-files/:id/retry', async (req: AuthRequest, res, next) => {
  try {
    const owner = ownerOf(req);
    const r = await retryReportFile(owner, req.params.id);
    const row = await prisma.aiReportFile.findUnique({ where: { id: req.params.id } });
    sendSuccess(res, { fileCard: row ? buildFileCard(row) : null, generation: r });
  } catch (error) {
    next(error);
  }
});

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
}).single('file');
aiRoutes.get('/usage-summary', async (req: AuthRequest, res, next) => {
  try {
    sendSuccess(
      res,
      await usageSummary(
        ownerOf(req),
        String(req.query.startDate || ''),
        String(req.query.endDate || '')
      )
    );
  } catch (e) {
    next(e);
  }
});
aiRoutes.get('/data-dictionary', (_req, res) => sendSuccess(res, runtimeDictionary()));
aiRoutes.post('/uploads', (req, res, next) => {
  uploadMiddleware(req, res, (err: any) => {
    if (err)
      return next(
        new ApiError(
          err.code === 'LIMIT_FILE_SIZE' ? '文件不能超过8MB' : '上传失败，请一次选择一个有效文件',
          400,
          'UPLOAD_LIMIT'
        )
      );
    try {
      if (!req.file) throw new ApiError('请选择文件', 400, 'UPLOAD_EMPTY');
      sendSuccess(res, saveUpload(ownerOf(req), req.file.buffer, req.file.originalname));
    } catch (e) {
      next(e);
    }
  });
});
aiRoutes.post('/report-imports/preview', (req: AuthRequest,res,next)=>{
  try{sendSuccess(res,previewReportImport(ownerOf(req),req.body).publicData);}catch(e){next(e);}
});
aiRoutes.post('/report-imports/confirm', (req: AuthRequest,res,next)=>{
  try{sendSuccess(res,confirmReportImport(ownerOf(req),req.body));}catch(e){next(e);}
});
aiRoutes.get('/uploads/:id', (req: AuthRequest, res, next) => {
  try {
    sendSuccess(res, getUpload(ownerOf(req), req.params.id));
  } catch (e) {
    next(e);
  }
});
aiRoutes.put('/uploads/:id/mapping', (req: AuthRequest, res, next) => {
  try {
    sendSuccess(res, mapUpload(ownerOf(req), req.params.id, req.body?.mapping));
  } catch (e) {
    next(e);
  }
});
aiRoutes.delete('/uploads/:id', (req: AuthRequest, res, next) => {
  try {
    removeUpload(ownerOf(req), req.params.id);
    sendSuccess(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
/** Usage belongs to the same owner as the message. No other administrator's prose/attachments. */
aiRoutes.get('/messages/:id/usage', async (req: AuthRequest, res, next) => {
  try {
    if (process.env.AI_DEBUG_DIAGNOSTICS !== '1') throw new ApiError('页面不存在', 404, 'NOT_FOUND');
    const owner = ownerOf(req);
    const m = await prisma.aiMessage.findFirst({
      where: {
        id: req.params.id,
        role: 'assistant',
        conversation: {
          ownerUserId: owner.userId,
          organizationId: owner.organizationId,
          campusId: owner.campusId,
          status: 'active',
        },
      },
    });
    if (!m) throw new ApiError('任务不存在', 404, 'NOT_FOUND');
    const bill = m.billId
      ? await prisma.aiTaskBill.findFirst({
          where: {
            id: m.billId,
            userId: owner.userId,
            organizationId: owner.organizationId,
            campusId: owner.campusId,
          },
        })
      : null;
    const ledger = bill
      ? await prisma.aiCreditLedger.findMany({
          where: { billId: bill.id, accountId: bill.accountId },
          select: { id: true, type: true, micros: true, balanceAfter: true, createdAt: true },
        })
      : [];
    const files = await prisma.aiReportFile.findMany({
      where: {
        messageId: m.id,
        createdById: owner.userId,
        organizationId: owner.organizationId,
        campusId: owner.campusId,
      },
      select: { id: true, status: true, fileName: true, fileHash: true },
    });
    sendSuccess(res, {
      messageId: m.id,
      status: m.status,
      createdAt: m.createdAt,
      usage: m.usageJson,
      bill: bill
        ? {
            id: bill.id,
            status: bill.status,
            reservedMicros: bill.reservedMicros,
            settledMicros: bill.settledMicros,
            releasedMicros: bill.releasedMicros,
            estimateMicros: bill.estimateMicros,
            stopReason: bill.stopReason,
            usage: bill.usageJson,
          }
        : null,
      ledger,
      files,
      supplierCost: null,
      supplierCostNote: '尚未接入供应商账单对账；合成模型用量不能代表真实费用',
    });
  } catch (e) {
    next(e);
  }
});

aiRoutes.get('/diagnostics', async (req: AuthRequest, res, next) => {
  try {
    sendSuccess(res, {
      provider: activeAiProviderLabel(),
      model: activeAiModel(),
      bootTs: PROCESS_BOOT_TS,
      uptimeSec: Math.floor(process.uptime()),
    });
  } catch (error) {
    next(error);
  }
});

/** 顶栏积分胶囊：当前校区账户摘要（未开通时 enabled=false，前端隐藏） */
aiRoutes.get('/quota', async (req: AuthRequest, res, next) => {
  try {
    const currentUser = getCurrentUser(req);
    let pricingReady = false;
    let billingCode: string | null = null;
    let billingReason: string | null = null;
    if (!isAiConfigured()) {
      billingCode = 'AI_NOT_CONFIGURED';
      billingReason = 'AI 服务尚未配置，暂不能发起对话；基础课务功能可正常使用。';
    } else {
      try {
        await getActivePrice(activeAiModel());
        pricingReady = true;
      } catch (err: any) {
        billingCode = err.code || 'AI_PRICE_UNAVAILABLE';
        billingReason =
          '当前 AI 模型价格尚未核定，暂不能发起对话；基础课务、历史记录和已有文件可正常使用。';
      }
    }
    const testBudget=require('../services/aiLiveBudget.cjs').statusFromEnv();
    const pricingStatus = {
      testBudget,
      pricingReady,
      billingCode,
      billingReason,
      model: activeAiModel(),
      provider: activeAiProviderLabel(),
      billingMode:
        process.env.AI_PROVIDER === 'mock' ? 'mock_free' : pricingReady ? 'metered' : 'blocked',
    };
    const account = await prisma.aiCreditAccount.findFirst({
      where: {
        organizationId: currentUser?.organizationId ?? '',
        campusId: currentUser?.campusId ?? null,
      },
    });
    if (!account || account.status !== 'active') {
      return sendSuccess(res, {
        ...pricingStatus,
        enabled: false,
        chatAvailable: false,
        billingReason: billingReason || '本校区尚未开通 AI 服务；基础课务功能可正常使用。',
      });
    }
    sendSuccess(res, {
      ...pricingStatus,
      chatAvailable:
        pricingReady &&
        (process.env.AI_PROVIDER === 'mock' || account.balanceMicros > account.reservedMicros),
      enabled: true,
      balance: fmtMicros(account.balanceMicros),
      reserved: fmtMicros(account.reservedMicros),
      available: fmtMicros(account.balanceMicros - account.reservedMicros),
    });
  } catch (error) {
    next(error);
  }
});

aiRoutes.get('/context-summary', async (req: AuthRequest, res, next) => {
  try {
    const currentUser = getCurrentUser(req);
    const organizationId = currentUser?.organizationId;
    if (!organizationId) {
      return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
    }
    const force = req.query.refresh === 'true';
    const snapshot = await buildOrgSnapshot(organizationId, {
      force,
      campusId: currentUser?.campusId ?? null,
    });
    sendSuccess(res, snapshot);
  } catch (error) {
    next(error);
  }
});

// ==== 试点运营报告（P0：工作台触发 + 状态/内容/下载；管线=隔离副本服务模块，mock 零成本） ====
aiRoutes.get('/pilot-reports', async (req: AuthRequest, res, next) => {
  try {
    const u = req.user!;
    const rows = await prisma.orgPilotReportTask.findMany({
      where: { organizationId: u.organizationId, createdById: u.id, campusId: u.campusId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, periodStart: true, periodEnd: true, status: true, progress: true, error: true, createdAt: true },
    });
    sendSuccess(res, rows);
  } catch (error) {
    next(error);
  }
});

aiRoutes.get('/pilot-reports/:id', async (req: AuthRequest, res, next) => {
  try {
    const u = req.user!;
    const row = await prisma.orgPilotReportTask.findUnique({ where: { id: req.params.id } });
    if (!row) return next(new ApiError('报告不存在', 404, 'NOT_FOUND'));
    if (row.organizationId !== u.organizationId || row.createdById !== u.id || row.campusId !== u.campusId) {
      return next(new ApiError('无权访问该报告', 404, 'NOT_FOUND'));
    }
    sendSuccess(res, { id: row.id, status: row.status, progress: row.progress, progressLabel: row.progressLabel, error: row.error, content: row.status === 'ready' ? row.content : null, reportHtml: row.status === 'ready' ? readPilotReportFile(row.id, 'html', (row.content as any)?.files)?.toString('utf8') || null : null });
  } catch (error) {
    next(error);
  }
});

aiRoutes.post('/pilot-reports', async (req: AuthRequest, res, next) => {
  try {
    const u = req.user!;
    let period: ReturnType<typeof validateReportRequest>;
    try {
      period = validateReportRequest({ kind: String(req.body?.kind || 'weekly'), periodStart: req.body?.periodStart, periodEnd: req.body?.periodEnd });
    } catch (error) {
      return next(new ApiError(String((error as Error).message || '期间无效'), 400, 'PILOT_PERIOD_INVALID'));
    }
    const id = randomUUID();
    await prisma.orgPilotReportTask.create({
      data: {
        id,
        organizationId: u.organizationId!,
        createdById: u.id,
        campusId: u.campusId,
        kind: period.kind,
        periodStart: period.start,
        periodEnd: period.end,
        compareStart: null,
        compareEnd: null,
        snapshotDate: null,
        requestId: 'api-' + id,
        status: 'processing',
        progress: 0,
      },
    });
    void Promise.resolve()
      .then(() => runPilotReportPipeline(id,{strictQuality:true}))
      .catch(async (e: unknown) => {
        await prisma.orgPilotReportTask.update({ where: { id }, data: { status: 'failed', error: String((e as Error)?.message || e).slice(0, 300) } }).catch(() => undefined);
      });
    sendSuccess(res, { id, status: 'processing' });
  } catch (error) {
    next(error);
  }
});

aiRoutes.get('/pilot-reports/:id/download', async (req: AuthRequest, res: Response, next) => {
  try {
    const u = req.user!;
    const row = await prisma.orgPilotReportTask.findUnique({ where: { id: req.params.id } });
    if (!row) return next(new ApiError('报告不存在', 404, 'NOT_FOUND'));
    if (row.organizationId !== u.organizationId || row.createdById !== u.id || row.campusId !== u.campusId) {
      return next(new ApiError('无权访问该报告', 404, 'NOT_FOUND'));
    }
    if (row.status !== 'ready') return next(new ApiError('报告未完成', 409, 'PILOT_NOT_READY'));
    const fmt = String(req.query.format || 'html');
    if (!['html', 'docx', 'xlsx'].includes(fmt)) return next(new ApiError('不支持的格式', 400, 'PILOT_FORMAT_INVALID'));
    const buf = readPilotReportFile(row.id, fmt, (row.content as any)?.files);
    if (!buf) return next(new ApiError('报告文件缺失', 404, 'PILOT_FILE_MISSING'));
    const types: Record<string, string> = {
      html: 'text/html; charset=utf-8',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    res.setHeader('Content-Type', types[fmt]);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="report-' + row.periodStart + '_' + row.periodEnd + '-' + row.id.slice(0,8) + '.' + fmt + '"');
    res.send(buf);
  } catch (error) {
    next(error);
  }
});
