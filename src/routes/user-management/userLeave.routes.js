import { Router } from "express";

import {
  applyLeave,
  getMyLeaves,
  getMyLeaveById,
  withdrawLeave,
  cancelLeave,
} from "../../controllers/user-management/userLeave.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { uploadLeaveAttachments } from "../../middlewares/upload.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Apply leave
router.post(
  "/",
  uploadLeaveAttachments.array("attachments", 10),
  applyLeave
);

// Get my leaves
router.get(
  "/",
  getMyLeaves
);

// Get my leave by ID
router.get(
  "/:id",
  getMyLeaveById
);

// Withdraw pending leave
router.patch(
  "/:leaveId/withdraw",
  withdrawLeave
);

// Cancel approved leave
router.patch(
  "/:leaveId/cancel",
  cancelLeave
);

export default router;