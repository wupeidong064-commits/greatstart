import type { NextFunction, Request, Response } from 'express';
/** Inspect parsed text only: arbitrary uploaded binary data is not text. */
export declare function containsNul(value: unknown): boolean;
export declare function rejectNul(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=rejectNul.d.ts.map