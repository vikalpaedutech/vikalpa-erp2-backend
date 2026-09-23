import { Router } from "express";

import {
  getStudentLogs,
  approveStudentRequest,
  rejectStudentRequest,
} from "../../controllers/student-management/studentApproval.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);


// Get student request/history logs
router.route("/").get(getStudentLogs);


// Approve request
router
  .route("/:logId/approve")
  .patch(approveStudentRequest);


// Reject request
router
  .route("/:logId/reject")
  .patch(rejectStudentRequest);


export default router;