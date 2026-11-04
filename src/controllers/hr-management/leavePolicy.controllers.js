import mongoose from "mongoose";
import { LeavePolicy } from "../../models/hr-management/leavePolicy.models.js";
import { LeaveType } from "../../models/hr-management/leaveType.models.js";
import { User } from "../../models/user.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { runLeaveAccrual } from "../../services/hr-management/leaveAccrual.service.js";
import { ApiResponse } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

async function requireHR(req) {
  if (req.user?.isAdmin === true) return;
  const roles = await UserRole.find({ userId: req.user._id, isActive: true }).populate("roleId", "roleCode roleName").lean();
  const allowed = roles.some(({ roleId }) => [roleId?.roleCode, roleId?.roleName].filter(Boolean)
    .some(v => ["admin", "administrator", "hr", "hr-admin", "hr manager", "hr_manager", "hradmin", "hr_admin"].includes(String(v).toLowerCase())));
  if (!allowed) throw new ApiError(403, "HR administrator access is required");
}

export const listLeavePolicies = asyncHandler(async (req, res) => {
  await requireHR(req);
  const filter = {};
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
  if (req.query.leaveTypeId) filter.leaveTypeId = req.query.leaveTypeId;
  const policies = await LeavePolicy.find(filter).populate("leaveTypeId", "name code isPaid").populate("assignedUserIds", "name email userId").sort({ name: 1 }).lean();
  res.status(200).json(new ApiResponse(200, policies, "Leave policies fetched"));
});

export const createLeavePolicy = asyncHandler(async (req, res) => {
  await requireHR(req);
  const body = req.body || {};
  if (!body.name || !mongoose.isValidObjectId(body.leaveTypeId)) throw new ApiError(400, "Policy name and valid leaveTypeId are required");
  if (!(await LeaveType.exists({ _id: body.leaveTypeId, isActive: true }))) throw new ApiError(404, "Active leave type not found");
  if (body.assignedUserIds && (!Array.isArray(body.assignedUserIds) || body.assignedUserIds.some(id => !mongoose.isValidObjectId(id)))) throw new ApiError(400, "assignedUserIds must contain valid user IDs");
  if (body.assignedUserIds?.length) {
    const count = await User.countDocuments({ _id: { $in: body.assignedUserIds } });
    if (count !== body.assignedUserIds.length) throw new ApiError(400, "One or more assignedUserIds do not exist");
  }
  const policy = await LeavePolicy.create({
    name: body.name, leaveTypeId: body.leaveTypeId, description: body.description || "",
    leaveYearStartMonth: body.leaveYearStartMonth ?? 1, annualQuota: body.annualQuota ?? 0,
    accrualFrequency: body.accrualFrequency || "Monthly", accrualAmount: body.accrualAmount ?? 0,
    accrualDay: body.accrualDay ?? 1, maxBalance: body.maxBalance ?? null,
    carryForwardAllowed: body.carryForwardAllowed ?? false, carryForwardLimit: body.carryForwardLimit ?? 0,
    expiryMonth: body.expiryMonth ?? 12, expiryDay: body.expiryDay ?? 31,
    prorateOnJoining: body.prorateOnJoining ?? true, assignedUserIds: body.assignedUserIds || [],
    isDefault: body.isDefault ?? false, isActive: body.isActive ?? true,
    createdBy: req.user._id, updatedBy: req.user._id
  });
  res.status(201).json(new ApiResponse(201, policy, "Leave policy created"));
});

export const updateLeavePolicy = asyncHandler(async (req, res) => {
  await requireHR(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid policy ID");
  const policy = await LeavePolicy.findById(req.params.id);
  if (!policy) throw new ApiError(404, "Leave policy not found");
  const allowed = ["name","description","annualQuota","accrualFrequency","accrualAmount","accrualDay","maxBalance","carryForwardAllowed","carryForwardLimit","expiryMonth","expiryDay","prorateOnJoining","assignedUserIds","isDefault","isActive","leaveYearStartMonth"];
  for (const key of allowed) if (req.body[key] !== undefined) policy[key] = req.body[key];
  if (req.body.assignedUserIds !== undefined) {
    if (!Array.isArray(req.body.assignedUserIds) || req.body.assignedUserIds.some(id => !mongoose.isValidObjectId(id))) throw new ApiError(400, "assignedUserIds must contain valid user IDs");
    const count = await User.countDocuments({ _id: { $in: req.body.assignedUserIds } });
    if (count !== req.body.assignedUserIds.length) throw new ApiError(400, "One or more assignedUserIds do not exist");
  }
  if (req.body.leaveTypeId !== undefined) {
    if (!mongoose.isValidObjectId(req.body.leaveTypeId) || !(await LeaveType.exists({ _id: req.body.leaveTypeId, isActive: true }))) throw new ApiError(400, "Invalid active leaveTypeId");
    policy.leaveTypeId = req.body.leaveTypeId;
  }
  policy.updatedBy = req.user._id;
  await policy.save();
  res.status(200).json(new ApiResponse(200, policy, "Leave policy updated"));
});

export const runLeavePolicyAccrual = asyncHandler(async (req, res) => {
  await requireHR(req);
  const date = req.body.date ? new Date(req.body.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "Invalid accrual date");
  if (req.body.policyId && !mongoose.isValidObjectId(req.body.policyId)) throw new ApiError(400, "Invalid policyId");
  const result = await runLeaveAccrual({ date, force: req.body.force !== false, policyId: req.body.policyId || null, actorId: req.user._id });
  res.status(200).json(new ApiResponse(200, result, "Leave accrual process completed"));
});
