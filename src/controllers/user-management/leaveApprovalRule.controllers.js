import mongoose from "mongoose";

import { LeaveApprovalRule } from "../../models/user-management/leaveApprovalRule.models.js";
import { Designation } from "../../models/program-management/designation.models.js";
import { User } from "../../models/user.models.js";


// Create Leave Approval Rule
export const createLeaveApprovalRule = async (req, res) => {
  try {
    const {
      departmentId,
      designationId,
      approverId,
      approvalLevel,
      isActive,
    } = req.body;

    if (
      !departmentId ||
      !designationId ||
      !approverId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "departmentId, designationId and approverId are required.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        departmentId
      ) ||
      !mongoose.Types.ObjectId.isValid(
        designationId
      ) ||
      !mongoose.Types.ObjectId.isValid(
        approverId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID provided.",
      });
    }

    const level =
      approvalLevel === undefined
        ? 1
        : Number(approvalLevel);

    if (
      !Number.isInteger(level) ||
      level < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "approvalLevel must be a positive integer.",
      });
    }

    const designation =
      await Designation.findOne({
        _id: designationId,
        departmentId,
        isActive: true,
      });

    if (!designation) {
      return res.status(400).json({
        success: false,
        message:
          "Designation does not belong to the selected department or is inactive.",
      });
    }

    const approver =
      await User.findOne({
        _id: approverId,
        isActive: true,
      });

    if (!approver) {
      return res.status(404).json({
        success: false,
        message:
          "Active approver user not found.",
      });
    }

    const existingRule =
      await LeaveApprovalRule.findOne({
        departmentId,
        designationId,
        approvalLevel: level,
      });

    if (existingRule) {
      return res.status(409).json({
        success: false,
        message:
          "Leave approval rule already exists for this designation and approval level.",
      });
    }

    const rule =
      await LeaveApprovalRule.create({
        departmentId,
        designationId,
        approverId,
        approvalLevel: level,
        isActive:
          typeof isActive === "boolean"
            ? isActive
            : true,
      });

    const populatedRule =
      await LeaveApprovalRule.findById(
        rule._id
      )
        .populate(
          "departmentId",
          "departmentName departmentCode"
        )
        .populate(
          "designationId",
          "designation designationCode"
        )
        .populate(
          "approverId",
          "name email userId"
        );

    return res.status(201).json({
      success: true,
      message:
        "Leave approval rule created successfully.",
      data: populatedRule,
    });
  } catch (error) {
    console.error(
      "Create Leave Approval Rule Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create leave approval rule.",
      error: error.message,
    });
  }
};


// Get Leave Approval Rules
export const getLeaveApprovalRules = async (
  req,
  res
) => {
  try {
    const {
      departmentId,
      designationId,
      approverId,
      isActive,
    } = req.query;

    const filter = {};

    if (departmentId) {
      filter.departmentId = departmentId;
    }

    if (designationId) {
      filter.designationId = designationId;
    }

    if (approverId) {
      filter.approverId = approverId;
    }

    if (isActive !== undefined) {
      filter.isActive =
        isActive === "true";
    }

    const rules =
      await LeaveApprovalRule.find(filter)
        .populate(
          "departmentId",
          "departmentName departmentCode"
        )
        .populate(
          "designationId",
          "designation designationCode"
        )
        .populate(
          "approverId",
          "name email userId"
        )
        .sort({
          departmentId: 1,
          designationId: 1,
          approvalLevel: 1,
        });

    return res.status(200).json({
      success: true,
      message:
        "Leave approval rules fetched successfully.",
      data: rules,
    });
  } catch (error) {
    console.error(
      "Get Leave Approval Rules Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch leave approval rules.",
      error: error.message,
    });
  }
};


// Get Leave Approval Rule By ID
export const getLeaveApprovalRuleById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid leave approval rule ID.",
      });
    }

    const rule =
      await LeaveApprovalRule.findById(id)
        .populate(
          "departmentId",
          "departmentName departmentCode"
        )
        .populate(
          "designationId",
          "designation designationCode"
        )
        .populate(
          "approverId",
          "name email userId"
        );

    if (!rule) {
      return res.status(404).json({
        success: false,
        message:
          "Leave approval rule not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Leave approval rule fetched successfully.",
      data: rule,
    });
  } catch (error) {
    console.error(
      "Get Leave Approval Rule By ID Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch leave approval rule.",
      error: error.message,
    });
  }
};


// Update Leave Approval Rule
export const updateLeaveApprovalRule = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const {
      departmentId,
      designationId,
      approverId,
      approvalLevel,
      isActive,
    } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid leave approval rule ID.",
      });
    }

    const rule =
      await LeaveApprovalRule.findById(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message:
          "Leave approval rule not found.",
      });
    }

    const finalDepartmentId =
      departmentId || rule.departmentId;

    const finalDesignationId =
      designationId || rule.designationId;

    const finalApproverId =
      approverId || rule.approverId;

    const finalApprovalLevel =
      approvalLevel === undefined
        ? rule.approvalLevel
        : Number(approvalLevel);

    if (
      !Number.isInteger(
        finalApprovalLevel
      ) ||
      finalApprovalLevel < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "approvalLevel must be a positive integer.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        finalDepartmentId
      ) ||
      !mongoose.Types.ObjectId.isValid(
        finalDesignationId
      ) ||
      !mongoose.Types.ObjectId.isValid(
        finalApproverId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID provided.",
      });
    }

    const designation =
      await Designation.findOne({
        _id: finalDesignationId,
        departmentId: finalDepartmentId,
        isActive: true,
      });

    if (!designation) {
      return res.status(400).json({
        success: false,
        message:
          "Designation does not belong to the selected department or is inactive.",
      });
    }

    const approver =
      await User.findOne({
        _id: finalApproverId,
        isActive: true,
      });

    if (!approver) {
      return res.status(404).json({
        success: false,
        message:
          "Active approver user not found.",
      });
    }

    const duplicateRule =
      await LeaveApprovalRule.findOne({
        _id: {
          $ne: id,
        },
        departmentId: finalDepartmentId,
        designationId: finalDesignationId,
        approvalLevel:
          finalApprovalLevel,
      });

    if (duplicateRule) {
      return res.status(409).json({
        success: false,
        message:
          "Another leave approval rule already exists for this designation and approval level.",
      });
    }

    rule.departmentId =
      finalDepartmentId;

    rule.designationId =
      finalDesignationId;

    rule.approverId =
      finalApproverId;

    rule.approvalLevel =
      finalApprovalLevel;

    if (
      typeof isActive === "boolean"
    ) {
      rule.isActive = isActive;
    }

    await rule.save();

    const populatedRule =
      await LeaveApprovalRule.findById(
        rule._id
      )
        .populate(
          "departmentId",
          "departmentName departmentCode"
        )
        .populate(
          "designationId",
          "designation designationCode"
        )
        .populate(
          "approverId",
          "name email userId"
        );

    return res.status(200).json({
      success: true,
      message:
        "Leave approval rule updated successfully.",
      data: populatedRule,
    });
  } catch (error) {
    console.error(
      "Update Leave Approval Rule Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update leave approval rule.",
      error: error.message,
    });
  }
};


// Deactivate Leave Approval Rule
export const deleteLeaveApprovalRule = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid leave approval rule ID.",
      });
    }

    const rule =
      await LeaveApprovalRule.findById(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message:
          "Leave approval rule not found.",
      });
    }

    rule.isActive = false;

    await rule.save();

    return res.status(200).json({
      success: true,
      message:
        "Leave approval rule deactivated successfully.",
      data: rule,
    });
  } catch (error) {
    console.error(
      "Delete Leave Approval Rule Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to deactivate leave approval rule.",
      error: error.message,
    });
  }
};