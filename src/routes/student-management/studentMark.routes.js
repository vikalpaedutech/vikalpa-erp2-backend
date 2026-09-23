import { Router } from "express";

import {
  createStudentMark,
  getStudentMarks,
  getStudentMarkById,
  updateStudentMark,
  deleteStudentMark,
} from "../../controllers/student-management/studentMark.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Create marks
router.route("/").post(createStudentMark);

// Get marks
router.route("/").get(getStudentMarks);

// Get, update and delete single marks record
router
  .route("/:markId")
  .get(getStudentMarkById)
  .patch(updateStudentMark)
  .delete(deleteStudentMark);

export default router;