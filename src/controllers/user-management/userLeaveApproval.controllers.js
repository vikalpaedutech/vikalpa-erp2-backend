import mongoose from "mongoose";

import { UserLeave } from "../../models/user-management/userLeave.models.js";
import { UserLeaveApproval } from "../../models/user-management/userLeaveApproval.models.js";
import { UserLeaveBalance } from "../../models/user-management/userLeaveBalance.models.js";
import { LeaveBalanceTransaction } from "../../models/user-management/leaveBalanceTransaction.models.js";

import {
  createLeaveAttendance,
} from "../../services/user-managment/userAttendance.services.js";

import {
  getSignedUrlForSpacesKey,
} from "../../utils/space.utils.js";


// Get Pending Leave Approvals
export const getPendingLeaveApprovals = async (
  req,
  res
) => {
  try {
    const approverId = req.user?._id;

    if (!approverId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    const {
      page = 1,
      limit = 10,
    } = req.query;

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

    const filter = {
      approverId,
      status: "Pending",
      isActive: true,
    };

    const [approvals, total] =
      await Promise.all([
        UserLeaveApproval.find(filter)
          .populate({
            path: "leaveId",
            populate: [
              {
                path: "leaveTypeId",
                select:
                  "name code isPaid",
              },
              {
                path: "userId",
                select:
                  "name email userId",
              },
            ],
          })
          .populate(
            "approverId",
            "name email userId"
          )
          .sort({
            assignedAt: 1,
          })
          .skip(skip)
          .limit(limitNumber),

        UserLeaveApproval.countDocuments(
          filter
        ),
      ]);

    return res.status(200).json({
      success: true,
      message:
        "Pending leave approvals fetched successfully.",
      data: approvals,
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
      "Get Pending Leave Approvals Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch pending leave approvals.",
      error: error.message,
    });
  }
};


// Get Leave Approval Detail
export const getLeaveApprovalById = async (req, res) => {
  try {
    const approverId = req.user?._id;
    const { leaveId } = req.params;

    if (!approverId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(leaveId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave ID.",
      });
    }

    const assignedApproval = await UserLeaveApproval.findOne({
      leaveId,
      approverId,
    })
      .sort({ approvalLevel: 1 })
      .lean();

    if (!assignedApproval) {
      return res.status(403).json({
        success: false,
        message:
          "You are not assigned to this leave approval workflow.",
      });
    }

    const leave = await UserLeave.findById(leaveId)
      .populate({
        path: "leaveTypeId",
        select: "name code isPaid",
      })
      .populate({
        path: "userId",
        select: "userId name email contact",
      })
      .lean();

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found.",
      });
    }

    const [approvals, balanceTransactions] = await Promise.all([
      UserLeaveApproval.find({ leaveId })
        .populate({
          path: "approverId",
          select: "userId name email",
        })
        .sort({ approvalLevel: 1 })
        .lean(),

      LeaveBalanceTransaction.find({ leaveId })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const balanceAtApplication =
      balanceTransactions.find(
        (transaction) =>
          transaction.transactionType === "Pending Reservation"
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
            "APPROVAL LEAVE ATTACHMENT SIGNED URL ERROR:",
            error
          );

          return attachment;
        }
      })
    );

    return res.status(200).json({
      success: true,
      message: "Leave approval detail fetched successfully.",
      data: {
        leave: {
          ...leave,
          attachments,
        },
        approvals,
        currentApproval: assignedApproval,
        balanceAtApplication,
        balanceTransactions,
      },
    });
  } catch (error) {
    console.error("Get Leave Approval Detail Error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch leave approval detail.",
    });
  }
};


// Approve Leave
export const approveLeave = async (
  req,
  res
) => {
  const session =
    await mongoose.startSession();

  try {
    const approverId = req.user?._id;
    const { leaveId } = req.params;

    const {
      approvalReason,
      remarks,
    } = req.body;

    if (!approverId) {
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
         * Find ONLY the currently pending
         * approval assigned to this approver.
         */
        const approval =
          await UserLeaveApproval.findOne({
            leaveId,
            approverId,
            status: "Pending",
            isActive: true,
          })
            .sort({
              approvalLevel: 1,
            })
            .session(session);

        if (!approval) {
          throw new Error(
            "No pending approval found for this leave."
          );
        }

        /*
         * Leave must still be Pending.
         */
        const leave =
          await UserLeave.findOne({
            _id: leaveId,
            status: "Pending",
          }).session(session);

        if (!leave) {
          throw new Error(
            "Leave is no longer pending."
          );
        }

        /*
         * Verify all previous approval levels
         * have already been approved.
         */
        const previousIncompleteApproval =
          await UserLeaveApproval.findOne({
            leaveId,
            approvalLevel: {
              $lt:
                approval.approvalLevel,
            },
            status: {
              $ne: "Approved",
            },
          }).session(session);

        if (previousIncompleteApproval) {
          throw new Error(
            "Previous approval level is not completed yet."
          );
        }

        /*
         * Find next approval level.
         */
        const nextApproval =
          await UserLeaveApproval.findOne({
            leaveId,
            approvalLevel: {
              $gt:
                approval.approvalLevel,
            },
          })
            .sort({
              approvalLevel: 1,
            })
            .session(session);

        /*
         * Complete current approval.
         */
        approval.status = "Approved";

        approval.approvalReason =
          approvalReason?.trim() ||
          null;

        approval.remarks =
          remarks?.trim() ||
          null;

        approval.actionAt =
          new Date();

        approval.isActive = false;

        await approval.save({
          session,
        });

        /*
         * ------------------------------------------------
         * CASE 1:
         * More approval levels are remaining.
         * ------------------------------------------------
         */
        if (nextApproval) {
          nextApproval.status =
            "Pending";

          nextApproval.assignedAt =
            new Date();

          nextApproval.actionAt =
            null;

          nextApproval.isActive =
            true;

          await nextApproval.save({
            session,
          });

          result = {
            approvalCompleted: true,
            leaveApproved: false,
            nextApprovalActivated: true,
            currentApprovalId:
              approval._id,
            currentApprovalLevel:
              approval.approvalLevel,
            nextApprovalId:
              nextApproval._id,
            nextApprovalLevel:
              nextApproval.approvalLevel,
          };

          return;
        }

        /*
         * ------------------------------------------------
         * CASE 2:
         * This was the FINAL approval level.
         * ------------------------------------------------
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
         * The leave should have already
         * reserved this amount during application.
         */
        if (
          pendingBalance <
          requestedDays
        ) {
          throw new Error(
            "Insufficient pending leave balance."
          );
        }

        /*
         * Final deduction cannot exceed
         * available balance.
         */
        if (
          availableBalance <
          requestedDays
        ) {
          throw new Error(
            "Insufficient available leave balance."
          );
        }

        const balanceBefore =
          availableBalance;

        const balanceAfter =
          availableBalance -
          requestedDays;

        /*
         * Final leave status.
         */
        leave.status = "Approved";

        leave.approvedAt =
          new Date();

        leave.approvalReason =
          approvalReason?.trim() ||
          null;

        leave.remarks =
          remarks?.trim() ||
          leave.remarks ||
          null;

        await leave.save({
          session,
        });

        /*
         * Convert pending reservation
         * into actual leave usage.
         */
        leaveBalance.pendingBalance =
          pendingBalance -
          requestedDays;

        leaveBalance.usedBalance =
          usedBalance +
          requestedDays;

        leaveBalance.availableBalance =
          balanceAfter;

        leaveBalance.lastUpdatedAt =
          new Date();

        await leaveBalance.save({
          session,
        });

        /*
         * Create FINAL deduction ledger.
         *
         * Pending Reservation already exists.
         * We do NOT create Pending Release here.
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
                "Leave Deduction",

              amount:
                requestedDays,

              balanceBefore,

              balanceAfter,

              referenceType:
                "LeaveApproval",

              referenceId:
                approval._id,

              reason:
                approvalReason?.trim() ||
                "Leave approved.",

              remarks:
                remarks?.trim() ||
                null,

              transactionDate:
                new Date(),

              createdBy:
                approverId,
            },
          ],
          {
            session,
          }
        );

        /*
         * ------------------------------------------------
         * ATTENDANCE INTEGRATION
         * ------------------------------------------------
         *
         * Attendance is created ONLY after the
         * final approval.
         *
         * Intermediate approvals do not create
         * attendance.
         *
         * The same transaction/session is used.
         * Therefore, if attendance creation fails,
         * the leave approval and balance update
         * will also be rolled back.
         */
        await createLeaveAttendance(
          leave,
          approverId,
          session
        );

        result = {
          approvalCompleted: true,
          leaveApproved: true,
          nextApprovalActivated: false,
          currentApprovalId:
            approval._id,
          currentApprovalLevel:
            approval.approvalLevel,
          nextApprovalId: null,
          nextApprovalLevel: null,
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

    const approvals =
      await UserLeaveApproval.find({
        leaveId,
      })
        .populate(
          "approverId",
          "name email userId"
        )
        .sort({
          approvalLevel: 1,
        });

    return res.status(200).json({
      success: true,

      message:
        result.leaveApproved
          ? "Leave approved successfully."
          : "Approval completed. Next approval level activated.",

      data: {
        leave: updatedLeave,
        approvals,
        workflow: result,
      },
    });
  } catch (error) {
    console.error(
      "Approve Leave Error:",
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


// Reject Leave
export const rejectLeave = async (
  req,
  res
) => {
  const session =
    await mongoose.startSession();

  try {
    const approverId = req.user?._id;
    const { leaveId } = req.params;

    const {
      rejectionReason,
      remarks,
    } = req.body;

    if (!approverId) {
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
      !rejectionReason ||
      !rejectionReason.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Rejection reason is required.",
      });
    }

    let result = null;

    await session.withTransaction(
      async () => {
        /*
         * Find ONLY the current pending
         * approval assigned to this approver.
         */
        const approval =
          await UserLeaveApproval.findOne({
            leaveId,
            approverId,
            status: "Pending",
            isActive: true,
          })
            .sort({
              approvalLevel: 1,
            })
            .session(session);

        if (!approval) {
          throw new Error(
            "No pending approval found for this leave."
          );
        }

        /*
         * Leave must still be Pending.
         */
        const leave =
          await UserLeave.findOne({
            _id: leaveId,
            status: "Pending",
          }).session(session);

        if (!leave) {
          throw new Error(
            "Leave is no longer pending."
          );
        }

        /*
         * Previous levels must already
         * be approved.
         */
        const previousIncompleteApproval =
          await UserLeaveApproval.findOne({
            leaveId,
            approvalLevel: {
              $lt:
                approval.approvalLevel,
            },
            status: {
              $ne: "Approved",
            },
          }).session(session);

        if (previousIncompleteApproval) {
          throw new Error(
            "Previous approval level is not completed yet."
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
         * Release the reservation.
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
         * Reject current approval.
         */
        approval.status = "Rejected";

        approval.rejectionReason =
          rejectionReason.trim();

        approval.remarks =
          remarks?.trim() ||
          null;

        approval.actionAt =
          new Date();

        approval.isActive = false;

        await approval.save({
          session,
        });

        /*
         * Final leave rejection.
         */
        leave.status = "Rejected";

        leave.rejectedAt =
          new Date();

        leave.rejectionReason =
          rejectionReason.trim();

        leave.remarks =
          remarks?.trim() ||
          leave.remarks ||
          null;

        await leave.save({
          session,
        });

        /*
         * Release pending reservation.
         *
         * availableBalance stays unchanged.
         * usedBalance stays unchanged.
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
         * Ledger:
         *
         * Pending Reservation:
         *   Available 10 → 10
         *
         * Pending Release:
         *   Available 10 → 10
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
                "LeaveApproval",

              referenceId:
                approval._id,

              reason:
                rejectionReason.trim(),

              remarks:
                remarks?.trim() ||
                null,

              transactionDate:
                new Date(),

              createdBy:
                approverId,
            },
          ],
          {
            session,
          }
        );

        /*
         * Any remaining future approval
         * levels are no longer active.
         */
        await UserLeaveApproval.updateMany(
          {
            leaveId,
            approvalLevel: {
              $gt:
                approval.approvalLevel,
            },
            status: "Skipped",
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

        result = {
          leaveRejected: true,
          rejectedAtLevel:
            approval.approvalLevel,
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

    const approvals =
      await UserLeaveApproval.find({
        leaveId,
      })
        .populate(
          "approverId",
          "name email userId"
        )
        .sort({
          approvalLevel: 1,
        });

    return res.status(200).json({
      success: true,
      message:
        "Leave rejected successfully.",

      data: {
        leave: updatedLeave,
        approvals,
        workflow: result,
      },
    });
  } catch (error) {
    console.error(
      "Reject Leave Error:",
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