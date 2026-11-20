"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const leadController_1 = require("../controllers/leadController");
exports.leadRoutes = (0, express_1.Router)();
exports.leadRoutes.use(auth_1.authenticate);
exports.leadRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.leadRoutes.get('/', leadController_1.leadController.getLeads);
exports.leadRoutes.get('/:id', leadController_1.leadController.getLeadById);
exports.leadRoutes.post('/', leadController_1.leadController.createLead);
exports.leadRoutes.put('/:id', leadController_1.leadController.updateLead);
exports.leadRoutes.put('/:id/contact', leadController_1.leadController.updateLastContactTime);
exports.leadRoutes.delete('/:id', leadController_1.leadController.deleteLead);
//# sourceMappingURL=leads.js.map