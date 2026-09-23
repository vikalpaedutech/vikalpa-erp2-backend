import { Router } from "express";

import {
  getPendingLeaveApprovals,
  getLeaveApprovalById,
  approveLeave,
  rejectLeave,
} from "../../controllers/user-management/userLeaveApproval.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Get pending leave approvals
router.get(
  "/",
  getPendingLeaveApprovals
);

// Get leave approval detail
router.get(
  "/:leaveId",
  getLeaveApprovalById
);

// Approve leave
router.patch(
  "/:leaveId/approve",
  approveLeave
);

// Reject leave
router.patch(
  "/:leaveId/reject",
  rejectLeave
);

export default router;