"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashflowSummaryController = void 0;
const response_1 = require("../utils/response");
const scope_1 = require("../utils/scope");
const cashflowSummaryService_1 = require("../services/cashflowSummaryService");
exports.cashflowSummaryController = {
    getSummary: async (req, res, next) => {
        try {
            const data = await (0, cashflowSummaryService_1.getCashflowSummary)((0, scope_1.resolveScope)(req), req.query);
            (0, response_1.sendSuccess)(res, data);
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=cashflowSummaryController.js.map