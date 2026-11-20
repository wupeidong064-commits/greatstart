import { Server } from '@modelcontextprotocol/sdk/server/index.js';
/**
 * MCP Server（只读）—— 把课务系统的经营数据以标准 MCP Tools 暴露给 AI 客户端（如 Claude）。
 *
 * 边界（务必维持）：
 * - 全部工具只读；任何写数据库的能力不得注册为 MCP 工具。
 * - 所有查询强制 organizationId 隔离（来自服务端认证身份），不接受客户端传入机构参数。
 * - 所有列表类输出有 LIMIT 保护，避免全量导出。
 * - 续费名单工具暂缓：口径内联在 studentController.getRenewalStudents，
 *   需先抽成 service 再接入，避免复刻出错口径（见 docs/mcp-integration.md 待开发清单）。
 */
export interface McpOrgContext {
    organizationId: string;
    userId: string;
    role: string;
}
export declare function buildMcpServer(ctx: McpOrgContext): Server;
export declare const mcpRoutes: import("express-serve-static-core").Router;
//# sourceMappingURL=mcpServer.d.ts.map