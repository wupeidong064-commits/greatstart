"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonPricingController = void 0;
const lessonPricingService_1 = require("../services/lessonPricingService");
const response_1 = require("../utils/response");
exports.lessonPricingController = {
    async get(req, res, next) {
        try {
            res.set('Cache-Control', 'no-store');
            (0, response_1.sendSuccess)(res, await (0, lessonPricingService_1.getLessonPricing)(req));
        }
        catch (error) {
            next(error);
        }
    },
    async confirm(req, res, next) {
        try {
            (0, response_1.sendSuccess)(res, await (0, lessonPricingService_1.confirmLessonPricing)(req), '原批次计价已确认');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=lessonPricingController.js.map