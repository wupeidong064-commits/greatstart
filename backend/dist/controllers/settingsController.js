"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const database_1 = __importDefault(require("../config/database"));
const DEFAULT_SETTINGS = { maxClasses: '10', workingHoursStart: '09:00', workingHoursEnd: '21:00' };
exports.settingsController = {
    getSetting: async (req, res, next) => {
        try {
            const { key } = req.params, organizationId = req.user?.organizationId;
            if (!organizationId)
                throw new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN');
            const setting = await database_1.default.setting.findUnique({ where: { key_organizationId: { key: `${organizationId}_${key}`, organizationId } } })
                ?? await database_1.default.setting.findUnique({ where: { key_organizationId: { key, organizationId } } });
            (0, response_1.sendSuccess)(res, setting ? { ...setting, key } : { key, value: DEFAULT_SETTINGS[key] || '', organizationId, isDefault: true });
        }
        catch (error) {
            next(error);
        }
    },
    updateSetting: async (req, res, next) => {
        try {
            const { key } = req.params, { value } = req.body, organizationId = req.user?.organizationId;
            if (!organizationId)
                throw new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN');
            if (value === undefined || value === null)
                throw new errorHandler_1.ApiError('设置值不能为空', 400, 'INVALID_VALUE');
            const uniqueKey = `${organizationId}_${key}`;
            const result = await database_1.default.setting.upsert({
                where: { key_organizationId: { key: uniqueKey, organizationId } },
                create: { key: uniqueKey, organizationId, value: String(value) }, update: { value: String(value) },
            });
            (0, response_1.sendSuccess)(res, { ...result, key }, '设置已保存');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=settingsController.js.map