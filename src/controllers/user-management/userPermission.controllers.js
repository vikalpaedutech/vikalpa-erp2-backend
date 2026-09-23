import mongoose from "mongoose";
import { UserPermission } from "../../models/user-management/userPermission.models.js";
import { User } from "../../models/user.models.js";
import { Permission } from "../../models/permissions-management/permissions.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getUserAccess } from "../../services/user-managment/authorization.services.js";

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

export const getUserPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!validId(userId)) throw new ApiError(400, "Invalid user ID");
  const user = await User.findById(userId).select("name email isActive");
  if (!user) throw new ApiError(404, "User not found");
  const record = await UserPermission.findOne({ userId }).populate(
    "permissionIds",
    "permissionName permissionCode module action description isActive"
  );
  return res.status(200).json(new ApiResponse(200, {
    user,
    permissionIds: (record?.permissionIds || []).filter((p) => p?.isActive),
  }, "User permissions fetched successfully"));
});

export const replaceUserPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { permissionIds = [] } = req.body;
  if (!validId(userId)) throw new ApiError(400, "Invalid user ID");
  if (!Array.isArray(permissionIds)) throw new ApiError(400, "permissionIds must be an array");
  const user = await User.findById(userId).select("name email isActive");
  if (!user) throw new ApiError(404, "User not found");
  const uniqueIds = [...new Set(permissionIds.map(String))];
  if (uniqueIds.some((id) => !validId(id))) throw new ApiError(400, "Invalid permission ID");
  const activeCount = await Permission.countDocuments({ _id: { $in: uniqueIds }, isActive: true });
  if (activeCount !== uniqueIds.length) throw new ApiError(400, "One or more permissions are invalid or inactive");
  const record = await UserPermission.findOneAndUpdate(
    { userId },
    { $set: { permissionIds: uniqueIds } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("permissionIds", "permissionName permissionCode module action description isActive");
  return res.status(200).json(new ApiResponse(200, record, "User permissions updated successfully"));
});


export const getEffectiveUserPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!validId(userId)) throw new ApiError(400, "Invalid user ID");
  const user = await User.findById(userId).select("name email isActive");
  if (!user) throw new ApiError(404, "User not found");

  const access = await getUserAccess(userId);
  return res.status(200).json(
    new ApiResponse(200, {
      user,
      roles: access.roles,
      permissions: access.permissions,
    }, "Effective user permissions fetched successfully")
  );
});

export const getMyPermissions = asyncHandler(async (req, res) => {
  const record = await UserPermission.findOne({ userId: req.user._id }).populate(
    "permissionIds",
    "permissionName permissionCode module action description isActive"
  );
  return res.status(200).json(new ApiResponse(200, {
    permissions: (record?.permissionIds || []).filter((p) => p?.isActive),
  }, "My direct permissions fetched successfully"));
});
