import { UserDesignation } from "../../models/user-management/userDesignation.models.js";
import { Designation } from "../../models/program-management/designation.models.js";
import { LeaveApprovalRule } from "../../models/user-management/leaveApprovalRule.models.js";
import { UserLeaveApproval } from "../../models/user-management/userLeaveApproval.models.js";

export const getLeaveApprovalRulesForUser = async (
  userId
) => {
  const userDesignation =
    await UserDesignation.findOne({
      userId,
      isPrimary: true,
      isActive: true,
    });

  if (!userDesignation) {
    throw new Error(
      "Primary designation not found for user."
    );
  }

  const designation =
    await Designation.findOne({
      _id: userDesignation.designationId,
      isActive: true,
    });

  if (!designation) {
    throw new Error(
      "Active designation not found."
    );
  }

  const rules =
    await LeaveApprovalRule.find({
      departmentId: designation.departmentId,
      designationId: designation._id,
      isActive: true,
    })
      .populate({
        path: "approverId",
        select: "name email userId isActive",
        match: {
          isActive: true,
        },
      })
      .sort({
        approvalLevel: 1,
      });

  const activeApproverRules =
    rules.filter(
      (rule) => rule.approverId
    );

  if (!activeApproverRules.length) {
    throw new Error(
      "No leave approval rule configured for this user's designation."
    );
  }

  return activeApproverRules;
};


export const createInitialLeaveApprovals = async (
  leave,
  session
) => {
  const rules =
    await getLeaveApprovalRulesForUser(
      leave.userId
    );

  const approvalDocuments =
    rules.map((rule, index) => ({
      leaveId: leave._id,

      approverId:
        rule.approverId._id,

      approvalLevel:
        rule.approvalLevel,

      status:
        index === 0
          ? "Pending"
          : "Skipped",

      assignedAt:
        index === 0
          ? new Date()
          : null,

      isActive:
        index === 0,

      actionAt: null,
    }));

  await UserLeaveApproval.insertMany(
    approvalDocuments,
    {
      session,
    }
  );

  return approvalDocuments;
};


export const activateNextLeaveApproval = async (
  leaveId,
  completedLevel,
  session
) => {
  const nextApproval =
    await UserLeaveApproval.findOne({
      leaveId,
      approvalLevel:
        completedLevel + 1,
      status: "Skipped",
    }).session(session);

  if (!nextApproval) {
    return null;
  }

  nextApproval.status = "Pending";
  nextApproval.isActive = true;
  nextApproval.assignedAt = new Date();
  nextApproval.actionAt = null;

  await nextApproval.save({
    session,
  });

  return nextApproval;
};