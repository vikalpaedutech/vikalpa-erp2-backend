import { Router } from "express";

import {
    createCallingType,
    getCallingTypes,
    getCallingTypeById,
    updateCallingType,
    deleteCallingType,
} from "../../controllers/calling-management/callingType.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Create calling type
router
    .route("/")
    .post(createCallingType);

// Get all calling types
router
    .route("/")
    .get(getCallingTypes);

// Get calling type by ID
router
    .route("/:callingTypeId")
    .get(getCallingTypeById);

// Update calling type
router
    .route("/:callingTypeId")
    .patch(updateCallingType);

// Delete calling type
router
    .route("/:callingTypeId")
    .delete(deleteCallingType);

export default router;