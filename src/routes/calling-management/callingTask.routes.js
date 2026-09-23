import { Router } from "express";

import {
  createCallingTask,
  getCallingTasks,
  getCallingTaskById,
  assignCallingTask,
  startCallingTask,
  addCallingAttempt,
  getCallingAttempts,
  completeCallingTask,
  cancelCallingTask,
  getCallingAssignmentHistory,
} from "../../controllers/calling-management/callingTask.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Create calling task
router.route("/").post(createCallingTask);

// Get calling tasks
router.route("/").get(getCallingTasks);

// Get calling task by ID
router.route("/:taskId").get(getCallingTaskById);

// Assign / Reassign / Transfer calling task
router
  .route("/:taskId/assign")
  .patch(assignCallingTask);

// Start calling task
router
  .route("/:taskId/start")
  .patch(startCallingTask);

// Add calling attempt
router
  .route("/:taskId/attempt")
  .post(addCallingAttempt);

// Get calling attempts
router
  .route("/:taskId/attempts")
  .get(getCallingAttempts);

// Complete calling task
router
  .route("/:taskId/complete")
  .patch(completeCallingTask);

// Cancel calling task
router
  .route("/:taskId/cancel")
  .patch(cancelCallingTask);

// Get assignment / transfer history
router
  .route("/:taskId/assignment-history")
  .get(getCallingAssignmentHistory);

export default router;