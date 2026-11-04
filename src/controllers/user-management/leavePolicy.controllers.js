import mongoose from "mongoose";
import { LeavePolicy } from "../../models/hr-management/leavePolicy.models.js";
import { LeaveType } from "../../models/hr-management/leaveType.models.js";
import { Role } from "../../models/permissions-management/role.models.js";
import { Designation } from "../../models/program-management/designation.models.js";
import { User } from "../../models/user.models.js";

const populatePolicy = (query) => query
  .populate({ path: "leaveTypeId", select: "name code isPaid isActive" })
  .populate({ path: "eligibility.roles", select: "roleName roleCode" })
  .populate({ path: "eligibility.designations", select: "designation designationCode" })
  .populate({ path: "eligibility.users", select: "name email userId" });

const normalizePayload = (body) => ({
  accrualFrequency: body.accrualFrequency || "none",
  accrualAmount: Number(body.accrualAmount || 0),
  annualEntitlement: Number(body.annualEntitlement || 0),
  carryForwardAllowed: Boolean(body.carryForwardAllowed),
  maxCarryForward: Number(body.maxCarryForward || 0),
  expiryMonths: Number(body.expiryMonths || 0),
  effectiveFrom: body.effectiveFrom || new Date(),
  description: body.description || "",
  isActive: body.isActive !== false,
  eligibility: {
    applyToAll: body.eligibility?.applyToAll !== false,
    roles: Array.isArray(body.eligibility?.roles) ? body.eligibility.roles : [],
    designations: Array.isArray(body.eligibility?.designations) ? body.eligibility.designations : [],
    users: Array.isArray(body.eligibility?.users) ? body.eligibility.users : [],
  },
});

export const getLeavePolicies = async (req, res) => {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
    const policies = await populatePolicy(LeavePolicy.find(filter).sort({ updatedAt: -1 })).lean();
    res.status(200).json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch leave policies." });
  }
};

export const upsertLeavePolicy = async (req, res) => {
  try {
    const { leaveTypeId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(leaveTypeId)) {
      return res.status(400).json({ success: false, message: "A valid leave type is required." });
    }
    const leaveType = await LeaveType.findById(leaveTypeId);
    if (!leaveType) return res.status(404).json({ success: false, message: "Leave type not found." });

    const payload = normalizePayload(req.body);
    const eligibility = payload.eligibility;
    if (!eligibility.applyToAll && !eligibility.roles.length && !eligibility.designations.length && !eligibility.users.length) {
      return res.status(400).json({ success: false, message: "Select at least one role, designation or employee, or enable Apply to all." });
    }
    const [validRoles, validDesignations, validUsers] = await Promise.all([
      Role.countDocuments({ _id: { $in: eligibility.roles }, isActive: true }),
      Designation.countDocuments({ _id: { $in: eligibility.designations }, isActive: true }),
      User.countDocuments({ _id: { $in: eligibility.users }, isActive: true }),
    ]);
    if (validRoles !== eligibility.roles.length || validDesignations !== eligibility.designations.length || validUsers !== eligibility.users.length) {
      return res.status(400).json({ success: false, message: "One or more selected eligibility records are invalid or inactive." });
    }
    if (payload.accrualFrequency !== "none" && payload.accrualAmount <= 0) {
      return res.status(400).json({ success: false, message: "Accrual amount must be greater than zero when accrual is enabled." });
    }
    if (payload.maxCarryForward > 0 && !payload.carryForwardAllowed) {
      return res.status(400).json({ success: false, message: "Enable carry forward before setting its maximum limit." });
    }

    const policy = await LeavePolicy.findOneAndUpdate(
      { leaveTypeId },
      { $set: payload, $setOnInsert: { leaveTypeId } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await policy.populate([
      { path: "leaveTypeId", select: "name code isPaid isActive" },
      { path: "eligibility.roles", select: "roleName roleCode" },
      { path: "eligibility.designations", select: "designation designationCode" },
      { path: "eligibility.users", select: "name email userId" },
    ]);
    res.status(200).json({ success: true, message: "Leave policy saved successfully.", data: policy });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Failed to save leave policy." });
  }
};

export const deactivateLeavePolicy = async (req, res) => {
  try {
    const policy = await LeavePolicy.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!policy) return res.status(404).json({ success: false, message: "Leave policy not found." });
    res.status(200).json({ success: true, message: "Leave policy deactivated successfully.", data: policy });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Failed to deactivate leave policy." });
  }
};


// HR accrual audit report: every automated credit with employee and balance snapshots.
export const getAccrualReport = async (req, res) => {
  try {
    const filter = { transactionType: "Accrual" };
    if (req.query.leaveYear) filter.leaveYear = Number(req.query.leaveYear);
    if (req.query.leaveTypeId && mongoose.Types.ObjectId.isValid(req.query.leaveTypeId)) filter.leaveTypeId = req.query.leaveTypeId;
    if (req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) filter.userId = req.query.userId;
    if (req.query.transactionType && req.query.transactionType !== "All") filter.transactionType = req.query.transactionType;
    if (req.query.roleId && mongoose.Types.ObjectId.isValid(req.query.roleId)) {
      const { UserRole } = await import("../../models/user-management/userRole.models.js");
      filter.userId = { $in: await UserRole.find({ roleId: req.query.roleId, isActive: true }).distinct("userId") };
    }
    if (req.query.designationId && mongoose.Types.ObjectId.isValid(req.query.designationId)) {
      const { UserDesignation } = await import("../../models/user-management/userDesignation.models.js");
      filter.userId = { $in: await UserDesignation.find({ designationId: req.query.designationId, isActive: true }).distinct("userId") };
    }
    if (req.query.departmentId && mongoose.Types.ObjectId.isValid(req.query.departmentId)) {
      const { Designation } = await import("../../models/program-management/designation.models.js");
      const { UserDesignation } = await import("../../models/user-management/userDesignation.models.js");
      const designationIds = await Designation.find({ departmentId: req.query.departmentId, isActive: true }).distinct("_id");
      filter.userId = { $in: await UserDesignation.find({ designationId: { $in: designationIds }, isActive: true }).distinct("userId") };
    }
    const rows = await (await import("../../models/user-management/leaveBalanceTransaction.models.js")).LeaveBalanceTransaction
      .find(filter)
      .populate({ path: "userId", select: "name userId email" })
      .populate({ path: "leaveTypeId", select: "name code" })
      .populate({ path: "leaveBalanceId", select: "availableBalance accruedBalance" })
      .sort({ transactionDate: -1, createdAt: -1 }).limit(5000).lean();
    return res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch accrual report." });
  }
};
