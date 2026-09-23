import { Router } from "express";

import {
  getMonitoringRoles,
  getMonitoringUsersByRole,
  getUserMonitoringAccess,
  getMyMonitoringAccess,
  assignMonitoringCenters,
  revokeMonitoringAccess,
  revokeUserMonitoringAccess,
  getAvailableMonitoringCenters,
  revokeMonitoringAccessByLevel,
} from "../../controllers/academic-management/monitoringRegionAccess.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);


// ============================================================
// Monitoring Roles
// ============================================================

router.get(
  "/roles",
  getMonitoringRoles
);


// ============================================================
// Monitoring Users
// ============================================================

router.get(
  "/users",
  getMonitoringUsersByRole
);


// ============================================================
// CURRENT LOGGED-IN USER MONITORING ACCESS
// ============================================================

/*
 * IMPORTANT:
 * This route must come BEFORE:
 *
 * /user/:userId
 *
 * Otherwise Express can interpret "me" as a userId.
 */

router.get(
  "/me",
  getMyMonitoringAccess
);


// ============================================================
// Available Centers
// ============================================================

router.get(
  "/available-centers",
  getAvailableMonitoringCenters
);


// ============================================================
// User Monitoring Access
// ============================================================

router.get(
  "/user/:userId",
  getUserMonitoringAccess
);


// ============================================================
// Assign Monitoring Centers
// ============================================================

router.post(
  "/assign",
  assignMonitoringCenters
);


// ============================================================
// Revoke Single Access
// ============================================================

router.patch(
  "/revoke/:accessId",
  revokeMonitoringAccess
);


// ============================================================
// Revoke Access By Assignment Level
// ============================================================

router.patch(
  "/revoke-level",
  revokeMonitoringAccessByLevel
);


// ============================================================
// Revoke User Program + Batch Access
// ============================================================

router.patch(
  "/revoke-user",
  revokeUserMonitoringAccess
);


export default router;