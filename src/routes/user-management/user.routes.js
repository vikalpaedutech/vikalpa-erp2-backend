import { Router } from "express";

import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  searchUsers,
  toggleUserStatus,
} from "../../controllers/user-management/user.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import {
  bulkOnboardUsers,
  downloadBulkUserOnboardingTemplate,
} from "../../controllers/user-management/bulkUserOnboarding.controllers.js";
import { uploadSpreadsheet } from "../../middlewares/upload.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Bulk user onboarding
router.get(
  "/bulk-onboard/template",
  downloadBulkUserOnboardingTemplate
);

router.post(
  "/bulk-onboard",
  uploadSpreadsheet.single("file"),
  bulkOnboardUsers
);

/**
 * @route   POST /api/v1/user-management/users
 * @desc    Create a new user
 * @access  Protected
 */
router.route("/").post(createUser);

/**
 * @route   GET /api/v1/user-management/users
 * @desc    Get all users
 * @access  Protected
 */
router.route("/").get(getAllUsers);

/**
 * @route   GET /api/v1/user-management/users/search?q=
 * @desc    Search users
 * @access  Protected
 */
router.route("/search").get(searchUsers);

/**
 * @route   GET /api/v1/user-management/users/:userId
 * @desc    Get user by ID
 * @access  Protected
 */
router.route("/:userId").get(getUserById);

/**
 * @route   PATCH /api/v1/user-management/users/:userId
 * @desc    Update user
 * @access  Protected
 */
router.route("/:userId").patch(updateUser);

/**
 * @route   PATCH /api/v1/user-management/users/:userId/status
 * @desc    Activate / Deactivate user
 * @access  Protected
 */
router.route("/:userId/status").patch(toggleUserStatus);

/**
 * @route   DELETE /api/v1/user-management/users/:userId
 * @desc    Delete user
 * @access  Protected
 */
router.route("/:userId").delete(deleteUser);

export default router;