import { Router } from "express";

import {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  deleteRole,
  toggleRoleStatus,
  getActiveRoles,
  searchRoles,
} from "../../controllers/permissions-management/role.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/permission.middlewares.js";

const router = Router();

router.use(verifyJWT);
router.use(requireAdmin);

/**
 * @route   POST /api/v1/permissions-management/roles
 * @desc    Create a new role
 * @access  Protected
 */
router.route("/").post(createRole);

/**
 * @route   GET /api/v1/permissions-management/roles
 * @desc    Get all roles
 * @access  Protected
 */
router.route("/").get(getAllRoles);

/**
 * @route   GET /api/v1/permissions-management/roles/search
 * @desc    Search roles. roleName, roleCode
 * @access  Protected
 */
router.route("/search").get(searchRoles);

/**
 * @route   GET /api/v1/permissions-management/roles/active
 * @desc    Get only active roles
 * @access  Protected
 */
router.route("/active").get(getActiveRoles);

/**
 * @route   GET /api/v1/permissions-management/roles/:roleId
 * @desc    Get role by ID
 * @access  Protected
 */
router.route("/:roleId").get(getRoleById);

/**
 * @route   PATCH /api/v1/permissions-management/roles/:roleId
 * @desc    Update role
 * @access  Protected
 */
router.route("/:roleId").patch(updateRole);

/**
 * @route   DELETE /api/v1/permissions-management/roles/:roleId
 * @desc    Delete role
 * @access  Protected
 */
router.route("/:roleId").delete(deleteRole);

/**
 * @route   PATCH /api/v1/permissions-management/roles/:roleId/status
 * @desc    Activate / Deactivate role
 * @access  Protected
 */
router.route("/:roleId/status").patch(toggleRoleStatus);

export default router;