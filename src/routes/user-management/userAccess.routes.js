import { Router } from "express";

import {
    createUserAccess,
    getAllUserAccess,
    getUserAccessByUserId,
    updateUserAccess,
    deleteUserAccess
} from "../../controllers/user-management/userAccess.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();


// Secure routes

// Create user access
router.route("/").post(
    verifyJWT,
    createUserAccess
);

// Get all user access
router.route("/").get(
    verifyJWT,
    getAllUserAccess
);

// Get user access by user ID
router.route("/user/:userId").get(
    verifyJWT,
    getUserAccessByUserId
);

// Update user access
router.route("/:userAccessId").patch(
    verifyJWT,
    updateUserAccess
);

// Delete user access
router.route("/:userAccessId").delete(
    verifyJWT,
    deleteUserAccess
);


export default router;