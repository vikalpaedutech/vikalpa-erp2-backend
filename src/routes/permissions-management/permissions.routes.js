import { Router } from "express";

import {
  createPermission,
  getAllPermissions,
  getPermissionById,
  updatePermission,
  deletePermission,
  searchPermissions,
  getPermissionsByModule,
  getActivePermissions,
 togglePermissionStatus
} from "../../controllers/permissions-management/permissions.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/permission.middlewares.js";
import { requirePermission } from "../../middlewares/permission.middlewares.js";

const router = Router();

// Secure routes
router.use(verifyJWT);
router.use(requireAdmin);




// Create permission
router.route("/").post(createPermission);

// Get all permissions
// Query:
// ?page=1
// ?limit=10
// ?search=student
// ?module=student
// ?action=view
// ?isActive=true
router.route("/").get(getAllPermissions);

// Search permissions
// Query:
// ?q=student
// Optional:
// ?limit=20
router.route("/search").get(searchPermissions);

// Get all active permissions
router.route("/active").get(getActivePermissions);

// Get all permissions of a specific module
router.route("/module/:module").get(getPermissionsByModule);


router
  .route("/test-permission")
  .get(
    requirePermission("student.read"),
    (req, res) => {
      return res.status(200).json({
        success: true,
        message: "Permission authorized successfully",
      });
    }
  );



// Get permission by MongoDB ID
router.route("/:permissionId").get(getPermissionById);

// Update permission
router.route("/:permissionId").patch(updatePermission);

// Delete permission
router.route("/:permissionId").delete(deletePermission);

// Toggle permission status

router
  .route("/:permissionId/status")
  .patch(togglePermissionStatus);

export default router;
