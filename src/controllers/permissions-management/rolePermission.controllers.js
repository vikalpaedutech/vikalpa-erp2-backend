import mongoose from "mongoose";
import { RolePermission } from "../../models/permissions-management/rolePermission.models.js";
import { Role } from "../../models/permissions-management/role.models.js";
import { Permission } from "../../models/permissions-management/permissions.models.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";

/**
 * @desc    Assign a permission to a role
 * @route   POST /api/v1/permissions-management/role-permissions
 * @access  Protected
 */
const assignPermissionToRole = asyncHandler(async (req, res) => {
  const { roleId, permissionId } = req.body;

  if (!roleId || !permissionId) {
    throw new ApiError(
      400,
      "Role ID and permission ID are required"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }

  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw new ApiError(400, "Invalid permission ID");
  }

  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  if (!role.isActive) {
    throw new ApiError(400, "Cannot assign permission to an inactive role");
  }

  const permission = await Permission.findById(permissionId);

  if (!permission) {
    throw new ApiError(404, "Permission not found");
  }

  if (!permission.isActive) {
    throw new ApiError(
      400,
      "Cannot assign an inactive permission"
    );
  }

  const existingRolePermission = await RolePermission.findOne({
    roleId,
    permissionId,
  });

  if (existingRolePermission) {
    throw new ApiError(
      409,
      "This permission is already assigned to this role"
    );
  }

  const rolePermission = await RolePermission.create({
    roleId,
    permissionId,
  });

  const populatedRolePermission = await RolePermission.findById(
    rolePermission._id
  )
    .populate("roleId", "roleName roleCode")
    .populate(
      "permissionId",
      "permissionName permissionCode module action"
    );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        populatedRolePermission,
        "Permission assigned to role successfully"
      )
    );
});

/**
 * @desc    Get all role-permission mappings
 * @route   GET /api/v1/permissions-management/role-permissions
 * @access  Protected
 *
 * Query parameters:
 * ?page=1
 * ?limit=10
 * ?roleId=ROLE_ID
 * ?permissionId=PERMISSION_ID
 */
const getAllRolePermissions = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  const skip = (page - 1) * limit;

  const { roleId, permissionId } = req.query;

  const filter = {};

  if (roleId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      throw new ApiError(400, "Invalid role ID");
    }

    filter.roleId = roleId;
  }

  if (permissionId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(permissionId)) {
      throw new ApiError(400, "Invalid permission ID");
    }

    filter.permissionId = permissionId;
  }

  const [rolePermissions, totalRolePermissions] = await Promise.all([
    RolePermission.find(filter)
      .populate("roleId", "roleName roleCode")
      .populate(
        "permissionId",
        "permissionName permissionCode module action"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    RolePermission.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRolePermissions / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        rolePermissions,
        pagination: {
          currentPage: page,
          totalPages,
          totalRolePermissions,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Role permissions fetched successfully"
    )
  );
});

/**
 * @desc    Get role-permission mapping by ID
 * @route   GET /api/v1/permissions-management/role-permissions/:rolePermissionId
 * @access  Protected
 */
const getRolePermissionById = asyncHandler(async (req, res) => {
  const { rolePermissionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(rolePermissionId)) {
    throw new ApiError(400, "Invalid role permission ID");
  }

  const rolePermission = await RolePermission.findById(rolePermissionId)
    .populate("roleId", "roleName roleCode")
    .populate(
      "permissionId",
      "permissionName permissionCode module action"
    );

  if (!rolePermission) {
    throw new ApiError(404, "Role permission mapping not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        rolePermission,
        "Role permission fetched successfully"
      )
    );
});

/**
 * @desc    Get all permissions assigned to a role
 * @route   GET /api/v1/permissions-management/role-permissions/role/:roleId
 * @access  Protected
 */
const getPermissionsByRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }

  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  const rolePermissions = await RolePermission.find({
    roleId,
  })
    .populate(
      "permissionId",
      "permissionName permissionCode module action description isActive"
    )
    .sort({
      createdAt: -1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        rolePermissions,
        "Permissions assigned to role fetched successfully"
      )
    );
});

/**
 * @desc    Get all roles assigned to a permission
 * @route   GET /api/v1/permissions-management/role-permissions/permission/:permissionId
 * @access  Protected
 */
const getRolesByPermission = asyncHandler(async (req, res) => {
  const { permissionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw new ApiError(400, "Invalid permission ID");
  }

  const permission = await Permission.findById(permissionId);

  if (!permission) {
    throw new ApiError(404, "Permission not found");
  }

  const rolePermissions = await RolePermission.find({
    permissionId,
  })
    .populate("roleId", "roleName roleCode description isActive")
    .sort({
      createdAt: -1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        rolePermissions,
        "Roles assigned to permission fetched successfully"
      )
    );
});

/**
 * @desc    Remove a permission from a role
 * @route   DELETE /api/v1/permissions-management/role-permissions/:rolePermissionId
 * @access  Protected
 */
const removePermissionFromRole = asyncHandler(async (req, res) => {
  const { rolePermissionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(rolePermissionId)) {
    throw new ApiError(400, "Invalid role permission ID");
  }

  const rolePermission = await RolePermission.findById(rolePermissionId);

  if (!rolePermission) {
    throw new ApiError(404, "Role permission mapping not found");
  }

  await RolePermission.findByIdAndDelete(rolePermissionId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Permission removed from role successfully"
      )
    );
});


const replacePermissionsForRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;
  const { permissionIds = [] } = req.body;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }
  if (!Array.isArray(permissionIds)) {
    throw new ApiError(400, "permissionIds must be an array");
  }

  const role = await Role.findById(roleId);
  if (!role) throw new ApiError(404, "Role not found");
  if (!role.isActive) throw new ApiError(400, "Cannot update an inactive role");

  const ids = [...new Set(permissionIds.map(String))];
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new ApiError(400, "One or more permission IDs are invalid");
  }

  const activeCount = await Permission.countDocuments({
    _id: { $in: ids },
    isActive: true,
  });
  if (activeCount !== ids.length) {
    throw new ApiError(400, "One or more permissions are invalid or inactive");
  }

  await RolePermission.deleteMany({ roleId });
  if (ids.length) {
    await RolePermission.insertMany(
      ids.map((permissionId) => ({ roleId, permissionId })),
      { ordered: true }
    );
  }

  const result = await RolePermission.find({ roleId })
    .populate("permissionId", "permissionName permissionCode module action description isActive")
    .sort({ createdAt: -1 });

  return res.status(200).json(
    new ApiResponse(200, result, "Role permissions replaced successfully")
  );
});

export {
  assignPermissionToRole,
  replacePermissionsForRole,
  getAllRolePermissions,
  getRolePermissionById,
  getPermissionsByRole,
  getRolesByPermission,
  removePermissionFromRole,
};