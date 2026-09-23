import mongoose from "mongoose";
import { UserRole } from "../models/user-management/userRole.models.js";
import { UserPermission } from "../models/user-management/userPermission.models.js";
import { RolePermission } from "../models/permissions-management/rolePermission.models.js";
import { Permission } from "../models/permissions-management/permissions.models.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";

const getRoleCodes = async (userId) => {
  const rows = await UserRole.find({ userId, isActive: true }).populate({ path: "roleId", match: { isActive: true }, select: "roleCode roleName" }).lean();
  return rows
    .map((r) => r.roleId)
    .filter(Boolean)
    .flatMap((role) => [role.roleCode, role.roleName])
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
};

export const requireAdmin = asyncHandler(async (req, res, next) => {
  if (!req.user?._id) throw new ApiError(401, "Unauthorized request");
  if (req.user.isAdmin === true) return next();
  const codes = await getRoleCodes(req.user._id);
  if (!codes.includes("admin") && !codes.includes("administrator")) throw new ApiError(403, "Admin access required");
  next();
});

export const getEffectivePermissionCodes = async (userId) => {
  const userRoles = await UserRole.find({ userId, isActive: true }).populate({ path: "roleId", match: { isActive: true }, select: "_id roleCode" }).lean();
  const roleIds = userRoles.map((r) => r.roleId?._id).filter(Boolean);
  const [rolePermissions, direct] = await Promise.all([
    RolePermission.find({ roleId: { $in: roleIds } }).populate({ path: "permissionId", match: { isActive: true }, select: "permissionCode" }).lean(),
    UserPermission.findOne({ userId }).populate({ path: "permissionIds", match: { isActive: true }, select: "permissionCode" }).lean(),
  ]);
  const codes = new Set();
  rolePermissions.forEach((r) => r.permissionId?.permissionCode && codes.add(String(r.permissionId.permissionCode).trim().toLowerCase()));
  direct?.permissionIds?.forEach((p) => p?.permissionCode && codes.add(String(p.permissionCode).trim().toLowerCase()));
  return codes;
};

export const requirePermission = (permissionCode) => asyncHandler(async (req, res, next) => {
  if (!req.user?._id) throw new ApiError(401, "Unauthorized request");
  if (!permissionCode) throw new ApiError(500, "Permission code is required");
  if (!mongoose.Types.ObjectId.isValid(req.user._id)) throw new ApiError(401, "Invalid user");
  if (req.user.isAdmin === true) return next();
  const roleCodes = await getRoleCodes(req.user._id);
  if (roleCodes.includes("admin") || roleCodes.includes("administrator")) return next();
  const codes = await getEffectivePermissionCodes(req.user._id);
  const required = String(permissionCode).trim().toLowerCase();

  // Backward-compatible dashboard permission hierarchy:
  // dashboard.view grants dashboard pages; dashboard.export grants exports.
  // Specific dashboard.* permissions can still be assigned for granular control.
  const allowed =
    codes.has(required) ||
    (required.endsWith(".view") && required.startsWith("dashboard.") && codes.has("dashboard.view")) ||
    (required.endsWith(".export") && required.startsWith("dashboard.") && codes.has("dashboard.export"));

  if (!allowed) throw new ApiError(403, "You do not have permission to perform this action");
  next();
});


export const requireAnyPermission = (permissionCodes = []) => asyncHandler(async (req, res, next) => {
  if (!req.user?._id) throw new ApiError(401, "Unauthorized request");
  if (req.user.isAdmin === true) return next();
  const roleCodes = await getRoleCodes(req.user._id);
  if (roleCodes.includes("admin") || roleCodes.includes("administrator")) return next();
  const codes = await getEffectivePermissionCodes(req.user._id);
  const allowed = permissionCodes.some((code) => {
    const required = String(code || "").trim().toLowerCase();
    return codes.has(required) || (required.startsWith("dashboard.") && required.endsWith(".view") && codes.has("dashboard.view"));
  });
  if (!allowed) throw new ApiError(403, "You do not have permission to perform this action");
  next();
});
