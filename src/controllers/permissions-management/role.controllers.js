import mongoose from "mongoose";
import { Role } from "../../models/permissions-management/role.models.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";

/**
 * @desc    Create a new role
 * @route   POST /api/v1/permissions-management/roles
 * @access  Protected
 */
const createRole = asyncHandler(async (req, res) => {
  const { roleName, roleCode, description } = req.body;

  if (!roleName || !roleCode) {
    throw new ApiError(400, "Role name and role code are required");
  }

  const normalizedRoleName = roleName.trim();
  const normalizedRoleCode = roleCode.trim().toUpperCase();

  if (!normalizedRoleName) {
    throw new ApiError(400, "Role name cannot be empty");
  }

  if (!normalizedRoleCode) {
    throw new ApiError(400, "Role code cannot be empty");
  }

  const existingRole = await Role.findOne({
    $or: [
      { roleName: normalizedRoleName },
      { roleCode: normalizedRoleCode },
    ],
  });

  if (existingRole) {
    throw new ApiError(
      409,
      "Role with this name or code already exists"
    );
  }

  const role = await Role.create({
    roleName: normalizedRoleName,
    roleCode: normalizedRoleCode,
    description: description?.trim() || "",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, role, "Role created successfully"));
});

/**
 * @desc    Get all roles
 * @route   GET /api/v1/permissions-management/roles
 * @access  Protected
 *
 * Query parameters:
 * ?page=1
 * ?limit=10
 * ?search=center
 * ?isActive=true
 */
const getAllRoles = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  const skip = (page - 1) * limit;

  const { search, isActive } = req.query;

  const filter = {};

  if (search?.trim()) {
    filter.$or = [
      {
        roleName: {
          $regex: search.trim(),
          $options: "i",
        },
      },
      {
        roleCode: {
          $regex: search.trim(),
          $options: "i",
        },
      },
    ];
  }

  if (isActive !== undefined) {
    if (isActive === "true") {
      filter.isActive = true;
    } else if (isActive === "false") {
      filter.isActive = false;
    }
  }

  const [roles, totalRoles] = await Promise.all([
    Role.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Role.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRoles / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        roles,
        pagination: {
          currentPage: page,
          totalPages,
          totalRoles,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Roles fetched successfully"
    )
  );
});

/**
 * @desc    Get role by ID
 * @route   GET /api/v1/permissions-management/roles/:roleId
 * @access  Protected
 */
const getRoleById = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }

  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, role, "Role fetched successfully"));
});

/**
 * @desc    Update role
 * @route   PATCH /api/v1/permissions-management/roles/:roleId
 * @access  Protected
 */
const updateRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }

  const { roleName, roleCode, description } = req.body;

  if (
    roleName === undefined &&
    roleCode === undefined &&
    description === undefined
  ) {
    throw new ApiError(400, "At least one field is required for update");
  }

  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  if (roleName !== undefined) {
    const normalizedRoleName = roleName.trim();

    if (!normalizedRoleName) {
      throw new ApiError(400, "Role name cannot be empty");
    }

    const existingRole = await Role.findOne({
      roleName: normalizedRoleName,
      _id: { $ne: roleId },
    });

    if (existingRole) {
      throw new ApiError(
        409,
        "Role with this name already exists"
      );
    }

    role.roleName = normalizedRoleName;
  }

  if (roleCode !== undefined) {
    const normalizedRoleCode = roleCode.trim().toUpperCase();

    if (!normalizedRoleCode) {
      throw new ApiError(400, "Role code cannot be empty");
    }

    const existingRole = await Role.findOne({
      roleCode: normalizedRoleCode,
      _id: { $ne: roleId },
    });

    if (existingRole) {
      throw new ApiError(
        409,
        "Role with this code already exists"
      );
    }

    role.roleCode = normalizedRoleCode;
  }

  if (description !== undefined) {
    role.description = description.trim();
  }

  await role.save();

  return res
    .status(200)
    .json(new ApiResponse(200, role, "Role updated successfully"));
});

/**
 * @desc    Delete role
 * @route   DELETE /api/v1/permissions-management/roles/:roleId
 * @access  Protected
 */
const deleteRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }

  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  await Role.findByIdAndDelete(roleId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Role deleted successfully"));
});

/**
 * @desc    Activate / Deactivate role
 * @route   PATCH /api/v1/permissions-management/roles/:roleId/status
 * @access  Protected
 */
const toggleRoleStatus = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }

  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  role.isActive = !role.isActive;

  await role.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      role,
      `Role ${
        role.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
});

/**
 * @desc    Get only active roles
 * @route   GET /api/v1/permissions-management/roles/active
 * @access  Protected
 */
const getActiveRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find({
    isActive: true,
  }).sort({
    roleName: 1,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        roles,
        "Active roles fetched successfully"
      )
    );
});

/**
 * @desc    Search roles
 * @route   GET /api/v1/permissions-management/roles/search
 * @access  Protected
 *
 * Query parameter:
 * ?q=center
 */
const searchRoles = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q?.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const roles = await Role.find({
    $or: [
      {
        roleName: {
          $regex: q.trim(),
          $options: "i",
        },
      },
      {
        roleCode: {
          $regex: q.trim(),
          $options: "i",
        },
      },
    ],
  }).sort({
    roleName: 1,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        roles,
        "Roles search completed successfully"
      )
    );
});

export {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  deleteRole,
  toggleRoleStatus,
  getActiveRoles,
  searchRoles,
};