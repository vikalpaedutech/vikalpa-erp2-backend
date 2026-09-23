import { Router } from "express";

import {
  assignRoleToUser,
  getAllUserRoles,
  getUserRoleById,
  getRolesByUser,
  getUsersByRole,
  toggleUserRoleStatus,
  removeRoleFromUser,
} from "../../controllers/user-management/userRole.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/permission.middlewares.js";

const router = Router();

router.use(verifyJWT);
router.use(requireAdmin);

/**
 * @route   POST /api/v1/user-management/user-roles
 * @desc    Assign a role to a user
 * @access  Protected
 */
router.route("/").post(assignRoleToUser);

/**
 * @route   GET /api/v1/user-management/user-roles
 * @desc    Get all user-role mappings
 * @access  Protected
 */
router.route("/").get(getAllUserRoles);

/**
 * @route   GET /api/v1/user-management/user-roles/user/:userId
 * @desc    Get all roles assigned to a user
 * @access  Protected
 */
router.route("/user/:userId").get(getRolesByUser);

/**
 * @route   GET /api/v1/user-management/user-roles/role/:roleId
 * @desc    Get all users assigned to a role
 * @access  Protected
 */
router.route("/role/:roleId").get(getUsersByRole);

/**
 * @route   GET /api/v1/user-management/user-roles/:userRoleId
 * @desc    Get user-role mapping by ID
 * @access  Protected
 */
router.route("/:userRoleId").get(getUserRoleById);

/**
 * @route   PATCH /api/v1/user-management/user-roles/:userRoleId/status
 * @desc    Activate / Deactivate user-role assignment
 * @access  Protected
 */
router.route("/:userRoleId/status").patch(toggleUserRoleStatus);

/**
 * @route   DELETE /api/v1/user-management/user-roles/:userRoleId
 * @desc    Remove a role from a user
 * @access  Protected
 */
router.route("/:userRoleId").delete(removeRoleFromUser);

export default router;