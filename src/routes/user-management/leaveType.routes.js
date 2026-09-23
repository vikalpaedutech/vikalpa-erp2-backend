import { Router } from "express";

import {
  createLeaveType,
  getLeaveTypes,
  getLeaveTypeById,
  updateLeaveType,
  deleteLeaveType,
} from "../../controllers/user-management/leaveType.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Create leave type
router.post("/", createLeaveType);

// Get all leave types
router.get("/", getLeaveTypes);

// Get leave type by ID
router.get("/:id", getLeaveTypeById);

// Update leave type
router.patch("/:id", updateLeaveType);

// Deactivate leave type
router.delete("/:id", deleteLeaveType);

export default router;