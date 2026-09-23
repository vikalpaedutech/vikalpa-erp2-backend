import { Router } from "express";

import {
  assignPermissionToRole,
  replacePermissionsForRole,
  getAllRolePermissions,
  getRolePermissionById,
  getPermissionsByRole,
  getRolesByPermission,
  removePermissionFromRole,
} from "../../controllers/permissions-management/rolePermission.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/permission.middlewares.js";

const router = Router();

router.use(verifyJWT);
router.use(requireAdmin);

/**
 * @route   POST /api/v1/permissions-management/role-permissions
 * @desc    Assign a permission to a role
 * @access  Protected
 */
router.route("/").post(assignPermissionToRole);

/**
 * @route   GET /api/v1/permissions-management/role-permissions
 * @desc    Get all role-permission mappings
 * @access  Protected
 */
router.route("/").get(getAllRolePermissions);

/**
 * @route   GET /api/v1/permissions-management/role-permissions/role/:roleId
 * @desc    Get all permissions assigned to a role
 * @access  Protected
 */
router.route("/role/:roleId").get(getPermissionsByRole).put(replacePermissionsForRole);

/**
 * @route   GET /api/v1/permissions-management/role-permissions/permission/:permissionId
 * @desc    Get all roles assigned to a permission
 * @access  Protected
 */
router
  .route("/permission/:permissionId")
  .get(getRolesByPermission);

/**
 * @route   GET /api/v1/permissions-management/role-permissions/:rolePermissionId
 * @desc    Get role-permission mapping by ID
 * @access  Protected
 */
router.route("/:rolePermissionId").get(getRolePermissionById);

/**
 * @route   DELETE /api/v1/permissions-management/role-permissions/:rolePermissionId
 * @desc    Remove a permission from a role
 * @access  Protected
 */
router
  .route("/:rolePermissionId")
  .delete(removePermissionFromRole);

export default router;