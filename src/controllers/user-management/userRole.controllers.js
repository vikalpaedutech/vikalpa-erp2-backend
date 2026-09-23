import mongoose from "mongoose";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { User } from "../../models/user.models.js";
import { Role } from "../../models/permissions-management/role.models.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";

/**
 * @desc    Assign a role to a user
 * @route   POST /api/v1/user-management/user-roles
 * @access  Protected
 */
const assignRoleToUser = asyncHandler(async (req, res) => {
  const { userId, roleId } = req.body;

  
  if (!userId || !roleId) {
    throw new ApiError(400, "User ID and role ID are required");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  if (!role.isActive) {
    throw new ApiError(400, "Cannot assign an inactive role");
  }

  const existingUserRole = await UserRole.findOne({
    userId,
    roleId,
  });

  if (existingUserRole) {
    throw new ApiError(
      409,
      "This role is already assigned to this user"
    );
  }

  const userRole = await UserRole.create({
    userId,
    roleId,
  });

  const populatedUserRole = await UserRole.findById(userRole._id)
    .populate("userId", "userId name email")
    .populate("roleId", "roleName roleCode description");

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        populatedUserRole,
        "Role assigned to user successfully"
      )
    );
});

/**
 * @desc    Get all user-role mappings
 * @route   GET /api/v1/user-management/user-roles
 * @access  Protected
 *
 * Query parameters:
 * ?page=1
 * ?limit=10
 * ?userId=USER_ID
 * ?roleId=ROLE_ID
 * ?isActive=true
 */
const getAllUserRoles = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  const skip = (page - 1) * limit;

  const { userId, roleId, isActive } = req.query;

  const filter = {};

  if (userId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID");
    }

    filter.userId = userId;
  }

  if (roleId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      throw new ApiError(400, "Invalid role ID");
    }

    filter.roleId = roleId;
  }

  if (isActive !== undefined) {
    if (isActive === "true") {
      filter.isActive = true;
    } else if (isActive === "false") {
      filter.isActive = false;
    }
  }

  const [userRoles, totalUserRoles] = await Promise.all([
    UserRole.find(filter)
      .populate("userId", "userId name email")
      .populate("roleId", "roleName roleCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    UserRole.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalUserRoles / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        userRoles,
        pagination: {
          currentPage: page,
          totalPages,
          totalUserRoles,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "User roles fetched successfully"
    )
  );
});

/**
 * @desc    Get user-role mapping by ID
 * @route   GET /api/v1/user-management/user-roles/:userRoleId
 * @access  Protected
 */
const getUserRoleById = asyncHandler(async (req, res) => {
  const { userRoleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userRoleId)) {
    throw new ApiError(400, "Invalid user role ID");
  }

  const userRole = await UserRole.findById(userRoleId)
    .populate("userId", "userId name email")
    .populate("roleId", "roleName roleCode description");

  if (!userRole) {
    throw new ApiError(404, "User role mapping not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userRole,
        "User role fetched successfully"
      )
    );
});

/**
 * @desc    Get all roles assigned to a user
 * @route   GET /api/v1/user-management/user-roles/user/:userId
 * @access  Protected
 */
const getRolesByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const userRoles = await UserRole.find({
    userId,
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
        userRoles,
        "Roles assigned to user fetched successfully"
      )
    );
});

/**
 * @desc    Get all users assigned to a role
 * @route   GET /api/v1/user-management/user-roles/role/:roleId
 * @access  Protected
 */
const getUsersByRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new ApiError(400, "Invalid role ID");
  }

  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  const userRoles = await UserRole.find({
    roleId,
  })
    .populate("userId", "userId name email isActive")
    .sort({
      createdAt: -1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userRoles,
        "Users assigned to role fetched successfully"
      )
    );
});

/**
 * @desc    Activate / Deactivate user role assignment
 * @route   PATCH /api/v1/user-management/user-roles/:userRoleId/status
 * @access  Protected
 */
const toggleUserRoleStatus = asyncHandler(async (req, res) => {
  const { userRoleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userRoleId)) {
    throw new ApiError(400, "Invalid user role ID");
  }

  const userRole = await UserRole.findById(userRoleId);

  if (!userRole) {
    throw new ApiError(404, "User role mapping not found");
  }

  userRole.isActive = !userRole.isActive;

  await userRole.save();

  const populatedUserRole = await UserRole.findById(userRoleId)
    .populate("userId", "userId name email")
    .populate("roleId", "roleName roleCode");

  return res.status(200).json(
    new ApiResponse(
      200,
      populatedUserRole,
      `User role ${
        userRole.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
});

/**
 * @desc    Remove a role from a user
 * @route   DELETE /api/v1/user-management/user-roles/:userRoleId
 * @access  Protected
 */
const removeRoleFromUser = asyncHandler(async (req, res) => {
  const { userRoleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userRoleId)) {
    throw new ApiError(400, "Invalid user role ID");
  }

  const userRole = await UserRole.findById(userRoleId);

  if (!userRole) {
    throw new ApiError(404, "User role mapping not found");
  }

  await UserRole.findByIdAndDelete(userRoleId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Role removed from user successfully"
      )
    );
});

export {
  assignRoleToUser,
  getAllUserRoles,
  getUserRoleById,
  getRolesByUser,
  getUsersByRole,
  toggleUserRoleStatus,
  removeRoleFromUser,
};