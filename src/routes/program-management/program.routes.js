import { Router } from "express";

import {
  createProgram,
  getAllPrograms,
  getProgramById,
  updateProgram,
  deleteProgram,
  toggleProgramStatus,
  getActivePrograms,
  searchPrograms,
} from "../../controllers/program-management/program.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

// All program management routes are secured
router.use(verifyJWT);

// Create a new program
router.route("/").post(createProgram);

// Get all programs
// Supports:
// ?page=1
// ?limit=10
// ?search=buniyaad
// ?isActive=true
router.route("/").get(getAllPrograms);

// Get active programs
router.route("/active").get(getActivePrograms);

// Search programs
// ?q=buniyaad
router.route("/search").get(searchPrograms);

// Get program by ID
router.route("/:programId").get(getProgramById);

// Update program
router.route("/:programId").patch(updateProgram);

// Delete program
router.route("/:programId").delete(deleteProgram);

// Toggle program active/inactive status
router.route("/:programId/status").patch(toggleProgramStatus);

export default router;