import { Router } from "express";

import {
  createLeaveApprovalRule,
  getLeaveApprovalRules,
  getLeaveApprovalRuleById,
  updateLeaveApprovalRule,
  deleteLeaveApprovalRule,
} from "../../controllers/user-management/leaveApprovalRule.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Create leave approval rule
router.post(
  "/",
  createLeaveApprovalRule
);

// Get all leave approval rules
router.get(
  "/",
  getLeaveApprovalRules
);

// Get leave approval rule by ID
router.get(
  "/:id",
  getLeaveApprovalRuleById
);

// Update leave approval rule
router.patch(
  "/:id",
  updateLeaveApprovalRule
);

// Deactivate leave approval rule
router.delete(
  "/:id",
  deleteLeaveApprovalRule
);

export default router;