import type { AiIntent } from './aiIntent';
export declare const CHAT_ENTRY_CLOSED_REPLY = "\u5DE5\u4F5C\u53F0\u5DF2\u5173\u95ED\u901A\u8FC7\u804A\u5929\u5F55\u5165\u6216\u4FEE\u6539\u4E1A\u52A1\u6570\u636E\u3002\u4F53\u9A8C\u767B\u8BB0\u8BF7\u5230\u201C\u4F53\u9A8C\u8BFE\u8868\u201D\uFF0C\u65B0\u7B7E\u8BF7\u5230\u201C\u6210\u5355\u4FE1\u606F\u201D\uFF0C\u7EED\u8D39\u8BF7\u4F7F\u7528\u5B66\u5458\u7684\u7EED\u8D39\u5165\u53E3\uFF0C\u5B66\u5458\u5EFA\u6863\u8BF7\u5230\u201C\u5B66\u5458\u7BA1\u7406\u201D\uFF0C\u5747\u6309\u5F53\u524D\u8D26\u53F7\u6743\u9650\u529E\u7406\u3002\u9644\u4EF6\u4ECD\u53EF\u7528\u4E8E\u5206\u6790\u3001\u6838\u5BF9\u548C\u751F\u6210\u62A5\u544A\uFF0C\u4E0D\u4F1A\u5199\u5165\u4E1A\u52A1\u6863\u6848\u3002";
export declare const LEGACY_ENTRY_EXPIRED_NOTICE = "\u8FD9\u6761\u5386\u53F2\u5F55\u5165\u8349\u7A3F\u5DF2\u5931\u6548\uFF0C\u5DE5\u4F5C\u53F0\u6587\u5B57\u5F55\u5165\u5DF2\u5173\u95ED\u3002\u8BF7\u5728\u76F8\u5E94\u4E1A\u52A1\u9875\u9762\u529E\u7406\u3002";
/** Presentation only. Actual safety comes from removal of every chat business writer. */
export declare function blockedChatEntryIntent(question: string, hasLegacyDraft?: boolean): AiIntent | undefined;
/** Fail-closed compatibility for stale internal callers. No data services are imported. */
export declare function handleEntry(_request: unknown, question: string, previous: unknown, _today: string): Promise<{
    reply: string;
} | undefined>;
//# sourceMappingURL=aiEntryService.d.ts.map