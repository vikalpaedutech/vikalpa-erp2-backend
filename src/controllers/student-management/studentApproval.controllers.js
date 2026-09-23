import { asyncHandler } from "../../utils/async-handler.js";
import { ApiResponse } from "../../utils/api-response.js";

import {
  getStudentLogs as getStudentLogsService,
  approveStudentRequest as approveStudentRequestService,
  rejectStudentRequest as rejectStudentRequestService,
} from "../../services/student-management/studentApproval.services.js";


// ============================================================
// GET STUDENT LOGS
// ============================================================

const getStudentLogs = asyncHandler(async (req, res) => {
  const result = await getStudentLogsService(req.query);

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Student logs fetched successfully"
    )
  );
});


// ============================================================
// APPROVE STUDENT REQUEST
// ============================================================

const approveStudentRequest = asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const { reason } = req.body;

  const result = await approveStudentRequestService(
    logId,
    req.user._id,
    reason || null
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Student request approved successfully"
    )
  );
});


// ============================================================
// REJECT STUDENT REQUEST
// ============================================================

const rejectStudentRequest = asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const { reason } = req.body;

  const result = await rejectStudentRequestService(
    logId,
    req.user._id,
    reason
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Student request rejected successfully"
    )
  );
});


export {
  getStudentLogs,
  approveStudentRequest,
  rejectStudentRequest,
};