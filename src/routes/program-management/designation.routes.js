import { Router } from "express";

import {
  createDesignation,
  getAllDesignations,
  getDesignationById,
  updateDesignation,
  deleteDesignation,
  toggleDesignationStatus,
  getActiveDesignations,
} from "../../controllers/program-management/designation.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

// Protect all designation routes
router.use(verifyJWT);

// Create & Get All Designations
router.route("/").post(createDesignation).get(getAllDesignations);

// Get Active Designations
router.route("/active").get(getActiveDesignations);

// Get, Update & Delete Designation
router
  .route("/:designationId")
  .get(getDesignationById)
  .patch(updateDesignation)
  .delete(deleteDesignation);

// Toggle Designation Status
router
  .route("/:designationId/status")
  .patch(toggleDesignationStatus);

export default router;