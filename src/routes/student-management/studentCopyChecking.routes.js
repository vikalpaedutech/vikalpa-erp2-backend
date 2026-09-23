import { Router } from "express";

import {
  createStudentCopyChecking,
  createBulkStudentCopyChecking,
  getStudentCopyCheckings,
  getStudentCopyCheckingStudents,
  getStudentCopyCheckingById,
  updateStudentCopyChecking,
  deleteStudentCopyChecking,
} from "../../controllers/student-management/studentCopyChecking.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// ============================================================
// COPY CHECKING
// ============================================================

// Create single copy checking
router.route("/").post(createStudentCopyChecking);

// Create / update multiple copy checking records
router
  .route("/bulk")
  .post(createBulkStudentCopyChecking);

// Get students available for copy checking
router
  .route("/students")
  .get(getStudentCopyCheckingStudents);

// Get copy checking records
router
  .route("/")
  .get(getStudentCopyCheckings);

// Get / update / delete copy checking by ID
router
  .route("/:checkingId")
  .get(getStudentCopyCheckingById)
  .patch(updateStudentCopyChecking)
  .delete(deleteStudentCopyChecking);

export default router;