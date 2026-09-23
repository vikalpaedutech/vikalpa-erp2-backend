import { Router } from "express";

import {
  createExam,
  getExams,
  getExamById,
  getExamStudents,
  updateExam,
  deleteExam,
} from "../../controllers/academic-management/exam.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

router
  .route("/")
  .post(createExam)
  .get(getExams);

router
  .route("/:examId/students")
  .get(getExamStudents);

router
  .route("/:examId")
  .get(getExamById)
  .patch(updateExam)
  .delete(deleteExam);

export default router;