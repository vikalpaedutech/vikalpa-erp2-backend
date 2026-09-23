import { Router } from "express";

import {
  onboardStudent,
  bulkOnboardStudents,
  downloadBulkOnboardingTemplate,
  requestStudentAdd,
  requestStudentRemove,
  requestStudentSLC,
  requestStudentTransfer,
  getStudents,
  getStudentById,
  getStudentEnrollments

} from "../../controllers/student-management/student.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

import multer from "multer";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});



router.use(verifyJWT);

router.route("/").get(getStudents);

router.route("/onboard").post(onboardStudent);

router
  .route("/bulk-onboard")
  .post(upload.single("file"), bulkOnboardStudents);


router
  .route("/bulk-onboard/template")
  .get(downloadBulkOnboardingTemplate);

router
  .route("/request-add")
  .post(requestStudentAdd);

router
  .route("/request-remove")
  .post(requestStudentRemove);

router
  .route("/request-slc")
  .post(requestStudentSLC);

router.route("/request-transfer").post(requestStudentTransfer);

router.route("/:studentId").get(getStudentById);

router
  .route("/:studentId/enrollments")
  .get(getStudentEnrollments);

export default router;