import mongoose from "mongoose";

import { UserLeave } from "../../models/user-management/userLeave.models.js";
import { LeaveType } from "../../models/hr-management/leaveType.models.js";
import { UserLeaveBalance } from "../../models/user-management/userLeaveBalance.models.js";
import { LeaveBalanceTransaction } from "../../models/user-management/leaveBalanceTransaction.models.js";
import { UserLeaveApproval } from "../../models/user-management/userLeaveApproval.models.js";

import {
  getLeaveApprovalRulesForUser,
} from "../../services/user-managment/leaveApproval.services.js";

import {
  createLeaveAttendance,
  removeLeaveAttendance,
} from "../../services/user-managment/userAttendance.services.js";

import {
  uploadToSpaces,
  deleteFromSpaces,
  getSignedUrlForSpacesKey,
} from "../../utils/space.utils.js";

// Apply Leave
export const applyLeave = async (req, res) => {
  const session = await mongoose.startSession();
  const uploadedAttachmentKeys = [];

  try {
    const userId = req.user?._id;

    const {
      leaveTypeId,
      fromDate,
      toDate,
      durationType,
      halfDayType,
      numberOfDays,
      reason,
      attachment,
      remarks,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    if (
      !leaveTypeId ||
      !fromDate ||
      !toDate ||
      !durationType ||
      numberOfDays === undefined ||
      numberOfDays === null ||
      !reason
    ) {
      return res.status(400).json({
        success: false,
        message:
          "leaveTypeId, fromDate, toDate, durationType, numberOfDays and reason are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(leaveTypeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leaveTypeId.",
      });
    }

    if (!["Full Day", "Half Day"].includes(durationType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid durationType.",
      });
    }

    if (
      durationType === "Half Day" &&
      !["First Half", "Second Half"].includes(halfDayType)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "halfDayType must be First Half or Second Half for Half Day leave.",
      });
    }

    if (
      durationType === "Full Day" &&
      halfDayType
    ) {
      return res.status(400).json({
        success: false,
        message:
          "halfDayType should not be provided for Full Day leave.",
      });
    }

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid fromDate or toDate.",
      });
    }

    /*
     * Normalize dates to UTC date-only values.
     * This prevents timezone shifting.
     */
    const normalizedFromDate = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate()
      )
    );

    const normalizedToDate = new Date(
      Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate()
      )
    );

    if (normalizedToDate < normalizedFromDate) {
      return res.status(400).json({
        success: false,
        message: "toDate cannot be earlier than fromDate.",
      });
    }

    // --------------------------------------------------------
    // CALCULATE NUMBER OF DAYS ON SERVER
    // --------------------------------------------------------

    const calendarDays =
      Math.floor(
        (normalizedToDate.getTime() -
          normalizedFromDate.getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 1;

    let requestedDays;

    if (durationType === "Half Day") {
      if (calendarDays !== 1) {
        return res.status(400).json({
          success: false,
          message:
            "Half Day leave can only be applied for one date.",
        });
      }

      requestedDays = 0.5;
    } else {
      requestedDays = calendarDays;
    }

    // Client-sent numberOfDays is accepted only for backwards
    // compatibility, but the server-calculated value is the
    // authoritative value.
    if (
      numberOfDays !== undefined &&
      numberOfDays !== null &&
      Number(numberOfDays) !== requestedDays
    ) {
      return res.status(400).json({
        success: false,
        message:
          `numberOfDays must be ${requestedDays} for the selected dates and duration.`,
      });
    }

    /*
     * Leave cannot cross two leave years.
     */
    const leaveYear =
      normalizedFromDate.getUTCFullYear();

    if (
      normalizedFromDate.getUTCFullYear() !==
      normalizedToDate.getUTCFullYear()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Leave application cannot span across two leave years.",
      });
    }

    /*
     * Check active leave type before starting
     * the transaction.
     */
    const leaveType = await LeaveType.findOne({
      _id: leaveTypeId,
      isActive: true,
    });

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Active leave type not found.",
      });
    }

    // --------------------------------------------------------
    // UPLOAD OPTIONAL PDF / IMAGE ATTACHMENTS
    // --------------------------------------------------------

    const uploadedAttachments = [];

    if (Array.isArray(req.files) && req.files.length) {
      for (const file of req.files) {
        const uploadedFile = await uploadToSpaces({
          file,
          folder: "user-leaves",
          fileName: `${userId}/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}-${String(file.originalname || "attachment")
            .replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        });

        uploadedAttachmentKeys.push(uploadedFile.key);

        uploadedAttachments.push({
          url: uploadedFile.url,
          localPath: uploadedFile.key,
          fileName: uploadedFile.fileName,
          mimeType: file.mimetype,
          size: file.size,
        });
      }
    }

    let createdLeave;

    await session.withTransaction(
      async () => {
        /*
         * Check overlapping leave applications
         * inside the transaction.
         *
         * Pending and Approved leaves block
         * overlapping applications.
         */
        const overlappingLeave =
          await UserLeave.findOne({
            userId,
            status: {
              $in: ["Pending", "Approved"],
            },
            fromDate: {
              $lte: normalizedToDate,
            },
            toDate: {
              $gte: normalizedFromDate,
            },
          }).session(session);

        if (overlappingLeave) {
          throw new Error(
            "You already have a pending or approved leave overlapping with the selected dates."
          );
        }

        /*
         * Find current leave balance.
         */
        const leaveBalance =
          await UserLeaveBalance.findOne({
            userId,
            leaveTypeId,
            leaveYear,
            isActive: true,
          }).session(session);

        if (!leaveBalance) {
          throw new Error(
            "Leave balance is not configured for this leave type and year."
          );
        }

        const availableBalance =
          Number(
            leaveBalance.availableBalance || 0
          );

        const pendingBalance =
          Number(
            leaveBalance.pendingBalance || 0
          );

        /*
         * Pending leaves are reserved.
         *
         * Example:
         *
         * Available = 10
         * Pending = 2
         * New request = 3
         *
         * 2 + 3 <= 10
         */
        if (
          pendingBalance +
            requestedDays >
          availableBalance
        ) {
          throw new Error(
            "Insufficient leave balance."
          );
        }

        /*
         * Find approval hierarchy BEFORE
         * creating the leave.
         *
         * If no approval rule exists,
         * the entire transaction fails.
         */
        const approvalRules =
          await getLeaveApprovalRulesForUser(
            userId
          );

        if (!approvalRules.length) {
          throw new Error(
            "No leave approval rule configured for this user."
          );
        }

        /*
         * Ensure approval levels are sequential.
         *
         * Example:
         * 1, 2, 3 = valid
         *
         * 1, 3 = invalid
         */
        for (
          let index = 0;
          index < approvalRules.length;
          index++
        ) {
          const expectedLevel =
            index + 1;

          if (
            approvalRules[index]
              .approvalLevel !==
            expectedLevel
          ) {
            throw new Error(
              "Leave approval levels must be sequential starting from level 1."
            );
          }
        }

        /*
         * Create Leave Application.
         */
        const leaveDocuments =
          await UserLeave.create(
            [
              {
                userId,

                leaveTypeId,

                fromDate:
                  normalizedFromDate,

                toDate:
                  normalizedToDate,

                durationType,

                halfDayType:
                  durationType ===
                  "Half Day"
                    ? halfDayType
                    : null,

                numberOfDays:
                  requestedDays,

                reason:
                  reason.trim(),

                // Keep the old single attachment field for backwards
                // compatibility, while new applications use attachments.
                attachment:
                  uploadedAttachments[0] || attachment || null,

                attachments:
                  uploadedAttachments,

                status: "Pending",

                appliedAt:
                  new Date(),

                remarks:
                  remarks?.trim() ||
                  null,
              },
            ],
            {
              session,
            }
          );

        const leave =
          leaveDocuments[0];

        /*
         * Reserve pending balance.
         *
         * availableBalance remains unchanged.
         * usedBalance remains unchanged.
         */
        const pendingBalanceBefore =
          Number(
            leaveBalance.pendingBalance ||
              0
          );

        const pendingBalanceAfter =
          pendingBalanceBefore +
          requestedDays;

        leaveBalance.pendingBalance =
          pendingBalanceAfter;

        leaveBalance.lastUpdatedAt =
          new Date();

        await leaveBalance.save({
          session,
        });

        /*
         * Create approval records.
         *
         * Level 1:
         * Pending
         *
         * Level 2+:
         * Skipped until previous level
         * gets approved.
         */
        const approvalDocuments =
          approvalRules.map(
            (rule, index) => ({
              leaveId:
                leave._id,

              approverId:
                rule.approverId._id,

              approvalLevel:
                rule.approvalLevel,

              status:
                index === 0
                  ? "Pending"
                  : "Skipped",

              approvalReason:
                null,

              rejectionReason:
                null,

              remarks:
                null,

              actionAt:
                null,

              assignedAt:
                index === 0
                  ? new Date()
                  : null,

              isActive:
                index === 0,
            })
          );

        await UserLeaveApproval.insertMany(
          approvalDocuments,
          {
            session,
          }
        );

        /*
         * Create ledger entry for pending
         * balance reservation.
         *
         * Available balance is intentionally
         * unchanged.
         */
        await LeaveBalanceTransaction.create(
          [
            {
              userId,

              leaveTypeId,

              leaveBalanceId:
                leaveBalance._id,

              leaveId:
                leave._id,

              leaveYear,

              transactionType:
                "Pending Reservation",

              amount:
                requestedDays,

              balanceBefore:
                availableBalance,

              balanceAfter:
                availableBalance,

              referenceType:
                "Leave",

              referenceId:
                leave._id,

              reason:
                "Leave application pending approval.",

              remarks:
                remarks?.trim() ||
                null,

              transactionDate:
                new Date(),

              createdBy:
                userId,
            },
          ],
          {
            session,
          }
        );

        createdLeave = leave;
      }
    );

    /*
     * Fetch populated response only after
     * transaction has successfully committed.
     */
    const populatedLeave =
      await UserLeave.findById(
        createdLeave._id
      )
        .populate(
          "leaveTypeId",
          "name code isPaid"
        );

    const approvals =
      await UserLeaveApproval.find({
        leaveId:
          createdLeave._id,
      })
        .populate(
          "approverId",
          "name email userId"
        )
        .sort({
          approvalLevel: 1,
        });

    return res.status(201).json({
      success: true,
      message:
        "Leave applied successfully and sent for approval.",
      data: {
        leave: populatedLeave,
        approvals,
      },
    });
  } catch (error) {
    console.error(
      "Apply Leave Error:",
      error
    );

    // Best-effort cleanup for files uploaded before a failed transaction.
    for (const key of uploadedAttachmentKeys) {
      try {
        await deleteFromSpaces(key);
      } catch (cleanupError) {
        console.error(
          "LEAVE ATTACHMENT CLEANUP ERROR:",
          cleanupError
        );
      }
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  } finally {
    await session.endSession();
  }
};


// Get My Leaves
export const getMyLeaves = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    const {
      status,
      leaveTypeId,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {
      userId,
    };

    if (status) {
      filter.status = status;
    }

    if (leaveTypeId) {
      filter.leaveTypeId = leaveTypeId;
    }

    const pageNumber = Math.max(
      Number(page),
      1
    );

    const limitNumber = Math.min(
      Math.max(Number(limit), 1),
      100
    );

    const skip =
      (pageNumber - 1) *
      limitNumber;

    const [leaves, total] =
      await Promise.all([
        UserLeave.find(filter)
          .populate(
            "leaveTypeId",
            "name code isPaid"
          )
          .populate({
            path: "userId",
            select: "userId name email",
          })
          .sort({
            fromDate: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limitNumber),

        UserLeave.countDocuments(
          filter
        ),
      ]);

    return res.status(200).json({
      success: true,
      message:
        "Leaves fetched successfully.",
      data: leaves,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(
          total / limitNumber
        ),
      },
    });
  } catch (error) {
    console.error(
      "Get My Leaves Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch leaves.",
      error: error.message,
    });
  }
};


// Get My Leave By ID
export const getMyLeaveById = async (
  req,
  res
) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave ID.",
      });
    }

    const leave =
      await UserLeave.findOne({
        _id: id,
        userId,
      })
        .populate(
          "leaveTypeId",
          "name code isPaid"
        )
        .populate(
          "userId",
          "userId name email"
        );

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found.",
      });
    }

    const [approvals, balanceTransactions] =
      await Promise.all([
        UserLeaveApproval.find({
          leaveId: leave._id,
        })
          .populate(
            "approverId",
            "userId name email"
          )
          .sort({
            approvalLevel: 1,
          })
          .lean(),

        LeaveBalanceTransaction.find({
          leaveId: leave._id,
        })
          .sort({
            createdAt: 1,
          })
          .lean(),
      ]);

    const balanceAtApplication =
      balanceTransactions.find(
        (transaction) =>
          transaction.transactionType ===
          "Pending Reservation"
      ) || null;

    const rawAttachments =
      Array.isArray(leave.attachments) &&
      leave.attachments.length
        ? leave.attachments
        : leave.attachment
          ? [leave.attachment]
          : [];

    const attachments = await Promise.all(
      rawAttachments.map(async (attachment) => {
        if (!attachment?.localPath) {
          return attachment;
        }

        try {
          return {
            ...attachment,
            url: await getSignedUrlForSpacesKey(
              attachment.localPath
            ),
          };
        } catch (error) {
          console.error(
            "LEAVE ATTACHMENT SIGNED URL ERROR:",
            error
          );

          return attachment;
        }
      })
    );

    return res.status(200).json({
      success: true,
      message:
        "Leave fetched successfully.",
      data: {
        leave: {
          ...leave.toObject(),
          attachments,
        },
        approvals,
        balanceAtApplication,
        balanceTransactions,
      },
    });
  } catch (error) {
    console.error(
      "Get My Leave By ID Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch leave.",
      error: error.message,
    });
  }
};




// Withdraw Pending Leave
export const withdrawLeave = async (
  req,
  res
) => {
  const session =
    await mongoose.startSession();

  try {
    const userId = req.user?._id;
    const { leaveId } = req.params;

    const {
      withdrawalReason,
      remarks,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        leaveId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave ID.",
      });
    }

    let result = null;

    await session.withTransaction(
      async () => {
        /*
         * Only the employee who applied the
         * leave can withdraw it.
         */
        const leave =
          await UserLeave.findOne({
            _id: leaveId,
            userId,
            status: "Pending",
          }).session(session);

        if (!leave) {
          throw new Error(
            "Pending leave not found or it cannot be withdrawn."
          );
        }

        /*
         * Find leave balance.
         */
        const leaveBalance =
          await UserLeaveBalance.findOne({
            userId: leave.userId,
            leaveTypeId:
              leave.leaveTypeId,
            leaveYear:
              leave.fromDate.getUTCFullYear(),
            isActive: true,
          }).session(session);

        if (!leaveBalance) {
          throw new Error(
            "Leave balance not found."
          );
        }

        const requestedDays =
          Number(
            leave.numberOfDays || 0
          );

        const pendingBalance =
          Number(
            leaveBalance.pendingBalance ||
              0
          );

        const availableBalance =
          Number(
            leaveBalance.availableBalance ||
              0
          );

        /*
         * The pending leave must have already
         * reserved this amount.
         */
        if (
          pendingBalance <
          requestedDays
        ) {
          throw new Error(
            "Invalid pending leave balance."
          );
        }

        /*
         * Update leave.
         */
        leave.status = "Withdrawn";

        leave.withdrawnAt =
          new Date();

        leave.withdrawalReason =
          withdrawalReason?.trim() ||
          null;

        leave.remarks =
          remarks?.trim() ||
          leave.remarks ||
          null;

        await leave.save({
          session,
        });

        /*
         * Release pending balance.
         *
         * Available remains unchanged.
         * Used remains unchanged.
         */
        leaveBalance.pendingBalance =
          pendingBalance -
          requestedDays;

        leaveBalance.lastUpdatedAt =
          new Date();

        await leaveBalance.save({
          session,
        });

        /*
         * Cancel all remaining approval records.
         *
         * Already completed approvals remain
         * as history.
         */
        await UserLeaveApproval.updateMany(
          {
            leaveId,
            status: {
              $in: [
                "Pending",
                "Skipped",
              ],
            },
          },
          {
            $set: {
              status: "Cancelled",
              isActive: false,
              actionAt: new Date(),
            },
          },
          {
            session,
          }
        );

        /*
         * Safety cleanup:
         *
         * A Pending leave normally should NOT have
         * leave attendance because attendance is
         * created only after final approval.
         *
         * But if an inconsistent/orphan record exists,
         * remove ONLY attendance that was automatically
         * created from this leave.
         *
         * Manual attendance is never touched.
         */
        await removeLeaveAttendance(
          leave._id,
          session
        );

        /*
         * Ledger entry.
         */
        await LeaveBalanceTransaction.create(
          [
            {
              userId:
                leave.userId,

              leaveTypeId:
                leave.leaveTypeId,

              leaveBalanceId:
                leaveBalance._id,

              leaveId:
                leave._id,

              leaveYear:
                leave.fromDate.getUTCFullYear(),

              transactionType:
                "Pending Release",

              amount:
                requestedDays,

              balanceBefore:
                availableBalance,

              balanceAfter:
                availableBalance,

              referenceType:
                "Leave",

              referenceId:
                leave._id,

              reason:
                withdrawalReason?.trim() ||
                "Leave withdrawn by employee.",

              remarks:
                remarks?.trim() ||
                null,

              transactionDate:
                new Date(),

              createdBy:
                userId,
            },
          ],
          {
            session,
          }
        );

        result = {
          leaveStatus: "Withdrawn",
          releasedDays:
            requestedDays,
          pendingBalance:
            pendingBalance -
            requestedDays,
        };
      }
    );

    const updatedLeave =
      await UserLeave.findById(
        leaveId
      ).populate(
        "leaveTypeId",
        "name code isPaid"
      );

    return res.status(200).json({
      success: true,
      message:
        "Leave withdrawn successfully.",
      data: {
        leave: updatedLeave,
        workflow: result,
      },
    });
  } catch (error) {
    console.error(
      "Withdraw Leave Error:",
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  } finally {
    await session.endSession();
  }
};


// Cancel Approved Leave
export const cancelLeave = async (
  req,
  res
) => {
  const session =
    await mongoose.startSession();

  try {
    const userId = req.user?._id;
    const { leaveId } = req.params;

    const {
      cancellationReason,
      remarks,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        leaveId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave ID.",
      });
    }

    if (
      !cancellationReason ||
      !cancellationReason.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Cancellation reason is required.",
      });
    }

    let result = null;

    await session.withTransaction(
      async () => {
        /*
         * Only the employee who applied the
         * leave can cancel it through this API.
         *
         * Future admin/HR cancellation can be
         * implemented separately.
         */
        const leave =
          await UserLeave.findOne({
            _id: leaveId,
            userId,
            status: "Approved",
          }).session(session);

        if (!leave) {
          throw new Error(
            "Approved leave not found or it cannot be cancelled."
          );
        }

        /*
         * Employee can cancel only future approved leaves.
         * Current-day and past leaves are controlled by
         * HR/Admin through a separate workflow later.
         */
        const today = new Date();

        const todayDate = new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate()
          )
        );

        if (leave.fromDate <= todayDate) {
          throw new Error(
            "Only future approved leaves can be cancelled by the employee."
          );
        }

        /*
         * Find balance.
         */
        const leaveBalance =
          await UserLeaveBalance.findOne({
            userId: leave.userId,
            leaveTypeId:
              leave.leaveTypeId,
            leaveYear:
              leave.fromDate.getUTCFullYear(),
            isActive: true,
          }).session(session);

        if (!leaveBalance) {
          throw new Error(
            "Leave balance not found."
          );
        }

        const requestedDays =
          Number(
            leave.numberOfDays || 0
          );

        const usedBalance =
          Number(
            leaveBalance.usedBalance ||
              0
          );

        const availableBalance =
          Number(
            leaveBalance.availableBalance ||
              0
          );

        /*
         * The approved leave should already
         * exist inside usedBalance.
         */
        if (
          usedBalance <
          requestedDays
        ) {
          throw new Error(
            "Invalid used leave balance."
          );
        }

        /*
         * Restore the cancelled leave.
         */
        const balanceBefore =
          availableBalance;

        const balanceAfter =
          availableBalance +
          requestedDays;

        /*
         * Update leave.
         */
        leave.status = "Cancelled";

        leave.cancelledAt =
          new Date();

        leave.cancellationReason =
          cancellationReason.trim();

        leave.remarks =
          remarks?.trim() ||
          leave.remarks ||
          null;

        await leave.save({
          session,
        });

        /*
         * Restore balance.
         *
         * Pending remains unchanged.
         * Used decreases.
         * Available increases.
         */
        leaveBalance.usedBalance =
          usedBalance -
          requestedDays;

        leaveBalance.availableBalance =
          balanceAfter;

        leaveBalance.lastUpdatedAt =
          new Date();

        await leaveBalance.save({
          session,
        });

        /*
         * IMPORTANT:
         *
         * Remove only attendance automatically
         * generated from this approved leave.
         *
         * We do NOT mark the employee Absent.
         * We do NOT touch manually created
         * attendance records.
         */
        await removeLeaveAttendance(
          leave._id,
          session
        );

        /*
         * Ledger entry for restored balance.
         */
        await LeaveBalanceTransaction.create(
          [
            {
              userId:
                leave.userId,

              leaveTypeId:
                leave.leaveTypeId,

              leaveBalanceId:
                leaveBalance._id,

              leaveId:
                leave._id,

              leaveYear:
                leave.fromDate.getUTCFullYear(),

              transactionType:
                "Leave Cancellation",

              amount:
                requestedDays,

              balanceBefore,

              balanceAfter,

              referenceType:
                "Leave",

              referenceId:
                leave._id,

              reason:
                cancellationReason.trim(),

              remarks:
                remarks?.trim() ||
                null,

              transactionDate:
                new Date(),

              createdBy:
                userId,
            },
          ],
          {
            session,
          }
        );

        result = {
          leaveStatus: "Cancelled",
          restoredDays:
            requestedDays,
          usedBalance:
            usedBalance -
            requestedDays,
          availableBalance:
            balanceAfter,
        };
      }
    );

    const updatedLeave =
      await UserLeave.findById(
        leaveId
      ).populate(
        "leaveTypeId",
        "name code isPaid"
      );

    return res.status(200).json({
      success: true,
      message:
        "Leave cancelled successfully.",
      data: {
        leave: updatedLeave,
        workflow: result,
      },
    });
  } catch (error) {
    console.error(
      "Cancel Leave Error:",
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  } finally {
    await session.endSession();
  }
};