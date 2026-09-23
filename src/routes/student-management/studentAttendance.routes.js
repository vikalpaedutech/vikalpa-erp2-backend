import { Router } from "express";

import {
  markAttendance,
  bulkMarkAttendance,
  getAttendance,
  getStudentAttendance,
  getStudentAttendanceSummary,
  getContinuousAbsentStudents,
  getAbsenteeCallingStudents,
  saveAbsenteeCalling
} from "../../controllers/student-management/studentAttendance.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

// ============================================================
// AUTHENTICATION
// ============================================================

router.use(verifyJWT);

// ============================================================
// ATTENDANCE
// ============================================================

// Mark attendance for single student
router
  .route("/")
  .post(markAttendance);

// Bulk mark attendance as Present
router
  .route("/bulk")
  .post(bulkMarkAttendance);

// Get attendance for students
router
  .route("/")
  .get(getAttendance);

// Get students for Absentee Calling
router
  .route("/absentee-calling")
  .get(getAbsenteeCallingStudents);



// Get individual student's date-wise attendance
router
  .route("/student/:studentId")
  .get(getStudentAttendance);

// Get individual student's attendance summary
router
  .route("/student/:studentId/summary")
  .get(getStudentAttendanceSummary);

// Get students continuously absent
router
  .route("/continuous-absent")
  .get(getContinuousAbsentStudents);

router.route("/absentee-calling/call").post(
  saveAbsenteeCalling
);

export default router;