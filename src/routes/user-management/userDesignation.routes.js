import { Router } from "express";

import {
  assignDesignationToUser,
  getAllUserDesignations,
  getUserDesignationById,
  getDesignationsByUser,
  getUsersByDesignation,
  toggleUserDesignationStatus,
  removeDesignationFromUser,
} from "../../controllers/user-management/userDesignation.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

/**
 * @route   POST /api/v1/user-management/user-designations
 * @desc    Assign a designation to a user
 * @access  Protected
 */
router.route("/").post(assignDesignationToUser);

/**
 * @route   GET /api/v1/user-management/user-designations
 * @desc    Get all user-designation mappings
 * @access  Protected
 */
router.route("/").get(getAllUserDesignations);

/**
 * @route   GET /api/v1/user-management/user-designations/user/:userId
 * @desc    Get all designations assigned to a user
 * @access  Protected
 */
router.route("/user/:userId").get(getDesignationsByUser);

/**
 * @route   GET /api/v1/user-management/user-designations/designation/:designationId
 * @desc    Get all users assigned to a designation
 * @access  Protected
 */
router.route("/designation/:designationId").get(getUsersByDesignation);

/**
 * @route   GET /api/v1/user-management/user-designations/:userDesignationId
 * @desc    Get user-designation mapping by ID
 * @access  Protected
 */
router.route("/:userDesignationId").get(getUserDesignationById);

/**
 * @route   PATCH /api/v1/user-management/user-designations/:userDesignationId/status
 * @desc    Activate / Deactivate user-designation assignment
 * @access  Protected
 */
router
  .route("/:userDesignationId/status")
  .patch(toggleUserDesignationStatus);

/**
 * @route   DELETE /api/v1/user-management/user-designations/:userDesignationId
 * @desc    Remove a designation from a user
 * @access  Protected
 */
router
  .route("/:userDesignationId")
  .delete(removeDesignationFromUser);

export default router;