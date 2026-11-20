/**
 * AI 工作台路由（方向 B · G1 会话记忆版）
 *
 * 会话记忆：客户端只提交当前消息 + 会话 ID + 幂等 requestId；历史一律由服务端读取，
 * 不信任客户端伪造的 assistant 历史或 system 指令（旧 messages 数组协议已废弃）。
 * 计费：预留→结算→释放不变；账单关联 conversationId；摘要成本计入同一账单。
 * 鉴权：复用既有 authenticate + requireOrganizationAccess；AI 资格由 prepareChatTask 校验
 * （仅机构/校区管理员、需开通与余额）。
 */
export declare const aiRoutes: import("express-serve-static-core").Router;
//# sourceMappingURL=ai.d.ts.map