import { Router } from "express";

import {
  createUserRegionAccess,
  getAllUserRegionAccess,
  getUserRegionAccessByUserId,
  updateUserRegionAccess,
  deleteUserRegionAccess,
  getMyRegionAccess,
  getMyMergedRegionAccess
} from "../../controllers/user-management/userRegionAccess.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";



const router = Router();

router.use(verifyJWT);




/**
 * @route   POST /api/v1/user-management/user-region-access
 * @desc    Create a region access assignment for a user
 * @access  Protected
 */
router.route("/").post(createUserRegionAccess);

/**
 * @route   GET /api/v1/user-management/user-region-access
 * @desc    Get all user region access assignments
 * @access  Protected
 */
router.route("/").get(getAllUserRegionAccess);

router.route("/me").get(getMyRegionAccess);

router.route("/me/regions").get(getMyMergedRegionAccess);
/**
 * @route   GET /api/v1/user-management/user-region-access/user/:userId
 * @desc    Get all region access assignments of a user
 * @access  Protected
 */
router
  .route("/user/:userId")
  .get(getUserRegionAccessByUserId);

/**
 * @route   PATCH /api/v1/user-management/user-region-access/:userRegionAccessId
 * @desc    Update a specific region access assignment
 * @access  Protected
 */
router
  .route("/:userRegionAccessId")
  .patch(updateUserRegionAccess);

/**
 * @route   DELETE /api/v1/user-management/user-region-access/:userRegionAccessId
 * @desc    Delete a specific region access assignment
 * @access  Protected
 */
router
  .route("/:userRegionAccessId")
  .delete(deleteUserRegionAccess);



export default router;