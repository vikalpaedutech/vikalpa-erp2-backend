import mongoose from "mongoose";

import { StudentLog } from "../../models/student-management/studentLogs.mdoels.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";

import { ApiError } from "../../utils/api-error.js";

import { Student } from "../../models/student-management/student.models.js";
import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";



// ============================================================
// APPROVE STUDENT REQUEST
// ============================================================

const approveStudentRequest = async (
  logId,
  actionBy,
  actionReason = null
) => {
  if (!logId) {
    throw new ApiError(400, "Student log ID is required");
  }

  if (!mongoose.Types.ObjectId.isValid(logId)) {
    throw new ApiError(400, "Invalid student log ID");
  }

  if (!actionBy) {
    throw new ApiError(401, "Approver is required");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // ---------------------------------------------------------
    // 1. Find request
    // ---------------------------------------------------------

    const log = await StudentLog.findById(logId)
      .session(session);

    if (!log) {
      throw new ApiError(
        404,
        "Student request log not found"
      );
    }

    // ---------------------------------------------------------
    // 2. Request must be pending
    // ---------------------------------------------------------

    if (log.status !== "pending") {
      throw new ApiError(
        400,
        `Request is already ${log.status}`
      );
    }

    // ---------------------------------------------------------
    // 3. ADD STUDENT
    // ---------------------------------------------------------

    if (log.requestType === "add-student") {
      if (!log.enrollmentId) {
        throw new ApiError(
          400,
          "Enrollment ID is missing from add request"
        );
      }

      const student = await Student.findById(
        log.studentId
      ).session(session);

      if (!student) {
        throw new ApiError(
          404,
          "Student not found"
        );
      }

      const enrollment =
        await StudentEnrollment.findById(
          log.enrollmentId
        ).session(session);

      if (!enrollment) {
        throw new ApiError(
          404,
          "Student enrollment not found"
        );
      }

      // Student becomes active
      student.isActive = true;

      await student.save({
        session,
      });

      // Enrollment becomes active
      enrollment.status = "active";

      // Add request approved = SLC submitted
      enrollment.slcSubmitted = true;

      await enrollment.save({
        session,
      });
    }

    // ---------------------------------------------------------
    // 4. REMOVE STUDENT
    // ---------------------------------------------------------

    else if (log.requestType === "remove-student") {
      if (!log.enrollmentId) {
        throw new ApiError(
          400,
          "Enrollment ID is missing from remove request"
        );
      }

      const enrollment =
        await StudentEnrollment.findById(
          log.enrollmentId
        ).session(session);

      if (!enrollment) {
        throw new ApiError(
          404,
          "Student enrollment not found"
        );
      }

      if (enrollment.status !== "remove-request") {
        throw new ApiError(
          400,
          `Enrollment is not in remove-request state. Current status: ${enrollment.status}`
        );
      }

      enrollment.status = "left";

      // Remove request approved = SLC not submitted
      enrollment.slcSubmitted = false;

      await enrollment.save({
        session,
      });
    }

    // ---------------------------------------------------------
    // 5. SLC REQUEST
    // ---------------------------------------------------------

    else if (log.requestType === "slc-request") {
      if (!log.enrollmentId) {
        throw new ApiError(
          400,
          "Enrollment ID is missing from SLC request"
        );
      }

      const enrollment =
        await StudentEnrollment.findById(
          log.enrollmentId
        ).session(session);

      if (!enrollment) {
        throw new ApiError(
          404,
          "Student enrollment not found"
        );
      }

      if (enrollment.status !== "requested-slc") {
        throw new ApiError(
          400,
          `Enrollment is not in requested-slc state. Current status: ${enrollment.status}`
        );
      }

      // SLC request approved = SLC submitted flag false
      enrollment.slcSubmitted = false;

      enrollment.status = "left";

      // slcSubmittedAt is intentionally NOT changed

      await enrollment.save({
        session,
      });
    }

    // ---------------------------------------------------------
    // 6. TRANSFER STUDENT
    // ---------------------------------------------------------

    else if (log.requestType === "transfer-student") {
      if (!log.enrollmentId) {
        throw new ApiError(
          400,
          "Enrollment ID is missing from transfer request"
        );
      }

      if (
        !log.transferTo ||
        !log.transferTo.districtId ||
        !log.transferTo.blockId ||
        !log.transferTo.centerId
      ) {
        throw new ApiError(
          400,
          "Transfer destination is incomplete"
        );
      }

      const enrollment =
        await StudentEnrollment.findById(
          log.enrollmentId
        ).session(session);

      if (!enrollment) {
        throw new ApiError(
          404,
          "Student enrollment not found"
        );
      }

      if (
        !["active", "provisional"].includes(
          enrollment.status
        )
      ) {
        throw new ApiError(
          400,
          `Student cannot be transferred from current enrollment status: ${enrollment.status}`
        );
      }

      // Validate destination block
      const block = await Block.findOne({
        _id: log.transferTo.blockId,
        districtId: log.transferTo.districtId,
      }).session(session);

      if (!block) {
        throw new ApiError(
          400,
          "Selected block does not belong to selected district"
        );
      }

      // Validate destination center
      const center = await Center.findOne({
        _id: log.transferTo.centerId,
        blockId: log.transferTo.blockId,
      }).session(session);

      if (!center) {
        throw new ApiError(
          400,
          "Selected center does not belong to selected block"
        );
      }

      // Update enrollment location
      enrollment.districtId =
        log.transferTo.districtId;

      enrollment.blockId =
        log.transferTo.blockId;

      enrollment.centerId =
        log.transferTo.centerId;

      // Status remains active/provisional
      // slcSubmitted remains unchanged

      await enrollment.save({
        session,
      });
    }

    // ---------------------------------------------------------
    // 7. Unsupported request
    // ---------------------------------------------------------

    else {
      throw new ApiError(
        400,
        `Unsupported request type: ${log.requestType}`
      );
    }

    // ---------------------------------------------------------
    // 8. UPDATE SAME LOG
    // ---------------------------------------------------------

    log.status = "approved";
    log.actionBy = actionBy;
    log.actionAt = new Date();
    log.actionReason = actionReason?.trim() || null;

    await log.save({
      session,
    });

    // ---------------------------------------------------------
    // 9. Commit
    // ---------------------------------------------------------

    await session.commitTransaction();

    return {
      log,
      message: "Student request approved successfully",
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};



// ============================================================
// REJECT STUDENT REQUEST
// ============================================================

const rejectStudentRequest = async (
  logId,
  actionBy,
  actionReason
) => {
  if (!logId) {
    throw new ApiError(400, "Student log ID is required");
  }

  if (!mongoose.Types.ObjectId.isValid(logId)) {
    throw new ApiError(400, "Invalid student log ID");
  }

  if (!actionBy) {
    throw new ApiError(401, "Approver is required");
  }

  if (!actionReason?.trim()) {
    throw new ApiError(
      400,
      "Rejection reason is required"
    );
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // ---------------------------------------------------------
    // 1. Find pending request
    // ---------------------------------------------------------

    const log = await StudentLog.findById(logId)
      .session(session);

    if (!log) {
      throw new ApiError(
        404,
        "Student request log not found"
      );
    }

    if (log.status !== "pending") {
      throw new ApiError(
        400,
        `Request is already ${log.status}`
      );
    }

    // ---------------------------------------------------------
    // 2. ADD STUDENT
    // ---------------------------------------------------------

    if (log.requestType === "add-student") {
      const student = await Student.findById(
        log.studentId
      ).session(session);

      if (!student) {
        throw new ApiError(
          404,
          "Student not found"
        );
      }

      const enrollment =
        await StudentEnrollment.findById(
          log.enrollmentId
        ).session(session);

      if (!enrollment) {
        throw new ApiError(
          404,
          "Student enrollment not found"
        );
      }

      /*
       * Add request was never approved.
       *
       * Student should remain inactive.
       * Enrollment should remain in add-request.
       */

      student.isActive = false;

      await student.save({
        session,
      });

      enrollment.status = "add-request";

      await enrollment.save({
        session,
      });
    }

    // ---------------------------------------------------------
    // 3. REMOVE STUDENT
    // ---------------------------------------------------------

    else if (log.requestType === "remove-student") {
      const enrollment =
        await StudentEnrollment.findById(
          log.enrollmentId
        ).session(session);

      if (!enrollment) {
        throw new ApiError(
          404,
          "Student enrollment not found"
        );
      }

      // Restore previous operational state
      enrollment.status = "active";

      await enrollment.save({
        session,
      });
    }

    // ---------------------------------------------------------
    // 4. SLC REQUEST
    // ---------------------------------------------------------

    else if (log.requestType === "slc-request") {
      const enrollment =
        await StudentEnrollment.findById(
          log.enrollmentId
        ).session(session);

      if (!enrollment) {
        throw new ApiError(
          404,
          "Student enrollment not found"
        );
      }

      enrollment.status = "active";

      await enrollment.save({
        session,
      });
    }

    // ---------------------------------------------------------
    // 5. TRANSFER REQUEST
    // ---------------------------------------------------------

    else if (log.requestType === "transfer-student") {
      /*
       * Transfer request does not modify enrollment
       * while request is pending.
       *
       * Therefore rejection requires no enrollment change.
       */
    }

    // ---------------------------------------------------------
    // 6. Unsupported request
    // ---------------------------------------------------------

    else {
      throw new ApiError(
        400,
        `Unsupported request type: ${log.requestType}`
      );
    }

    // ---------------------------------------------------------
    // 7. Update SAME log
    // ---------------------------------------------------------

    log.status = "rejected";
    log.actionBy = actionBy;
    log.actionAt = new Date();
    log.actionReason = actionReason.trim();

    await log.save({
      session,
    });

    // ---------------------------------------------------------
    // 8. Commit
    // ---------------------------------------------------------

    await session.commitTransaction();

    return {
      log,
      message: "Student request rejected successfully",
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};



// ============================================================
// GET STUDENT LOGS
// ============================================================

const getStudentLogs = async (queryParams = {}) => {
  const {
    studentId,
    enrollmentId,
    requestType,
    status,
    requestedBy,
    actionBy,
    fromDate,
    toDate,
    page = 1,
    limit = 20,
  } = queryParams;

  const pageNumber = Math.max(
    Number(page) || 1,
    1
  );

  const limitNumber = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip =
    (pageNumber - 1) * limitNumber;

  const match = {};

  // ---------------------------------------------------------
  // ObjectId filters
  // ---------------------------------------------------------

  const objectIdFilters = {
    studentId,
    enrollmentId,
    requestedBy,
    actionBy,
  };

  for (
    const [field, value] of Object.entries(
      objectIdFilters
    )
  ) {
    if (value) {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new ApiError(
          400,
          `Invalid ${field}`
        );
      }

      match[field] = value;
    }
  }

  // ---------------------------------------------------------
  // Request type
  // ---------------------------------------------------------

  if (requestType) {
    const validRequestTypes = [
      "add-student",
      "remove-student",
      "slc-request",
      "transfer-student",
    ];

    if (
      !validRequestTypes.includes(
        requestType
      )
    ) {
      throw new ApiError(
        400,
        "Invalid requestType"
      );
    }

    match.requestType = requestType;
  }

  // ---------------------------------------------------------
  // Status
  // ---------------------------------------------------------

  if (status) {
    const validStatuses = [
      "pending",
      "approved",
      "rejected",
      "cancelled",
      "completed",
    ];

    if (!validStatuses.includes(status)) {
      throw new ApiError(
        400,
        "Invalid status"
      );
    }

    match.status = status;
  }

  // ---------------------------------------------------------
  // Requested date range
  // ---------------------------------------------------------

  if (fromDate || toDate) {
    match.requestedAt = {};

    if (fromDate) {
      const startDate = new Date(fromDate);

      if (isNaN(startDate.getTime())) {
        throw new ApiError(
          400,
          "Invalid fromDate"
        );
      }

      startDate.setHours(0, 0, 0, 0);

      match.requestedAt.$gte = startDate;
    }

    if (toDate) {
      const endDate = new Date(toDate);

      if (isNaN(endDate.getTime())) {
        throw new ApiError(
          400,
          "Invalid toDate"
        );
      }

      endDate.setHours(
        23,
        59,
        59,
        999
      );

      match.requestedAt.$lte = endDate;
    }
  }

  // ---------------------------------------------------------
  // Fetch logs
  // ---------------------------------------------------------

  const [logs, total] =
    await Promise.all([
      StudentLog.find(match)
        .populate(
          "studentId",
          "studentSrn name fatherName"
        )
        .populate(
          "enrollmentId",
          "programId batchId districtId blockId centerId class board status"
        )
        .populate(
          "requestedBy",
          "name email contact"
        )
        .populate(
          "actionBy",
          "name email contact"
        )
        .populate(
          "transferTo.districtId",
          "districtName"
        )
        .populate(
          "transferTo.blockId",
          "blockName"
        )
        .populate(
          "transferTo.centerId",
          "centerName"
        )
        .sort({
          requestedAt: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      StudentLog.countDocuments(match),
    ]);

  const totalPages = Math.ceil(
    total / limitNumber
  );

  return {
    logs,

    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages,

      hasNextPage:
        pageNumber < totalPages,

      hasPreviousPage:
        pageNumber > 1,
    },
  };
};


export {
  approveStudentRequest,
  rejectStudentRequest,
  getStudentLogs,
};