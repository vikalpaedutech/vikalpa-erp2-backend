import { Router } from "express";
import {
  getDashboardOptions,
  getDashboardAnalytics,
  exportDashboardAnalytics,
  getStudentsDashboard,
  exportStudentsDashboard,
  getAttendanceDashboard,
  exportAttendanceDashboard,
  getStudentAttendanceDashboard,
  exportStudentAttendanceDashboard,
  exportAttendanceStudentData,
  getAbsenteeCallingOverviewDashboard,
  exportAbsenteeCallingOverviewDashboard,
  getAbsenteeCallingDashboard,
  exportAbsenteeCallingDashboard,
  exportCallingStudentData,
  getCenterAttendanceUploadDashboard,
  exportCenterAttendanceUploadDashboard,
  getDownloadStudentsOptions,
  downloadStudentsDashboard,
  getExamsMarksDashboard,
  getExamMarksReport,
  exportExamMarksReport,
  exportExamStudentsData,
  getCopyCheckingDashboard,
  exportCopyCheckingDashboard,
  exportCopyCheckingStudentData,
} from "../../controllers/dashboard-management/dashboard.controllers.js";
import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { requirePermission, requireAnyPermission } from "../../middlewares/permission.middlewares.js";

const router = Router();
router.use(verifyJWT);

router.get("/options", requireAnyPermission([
  "dashboard.view",
  "dashboard.students.view",
  "dashboard.attendance.view",
  "dashboard.student-attendance.view",
  "dashboard.absentee-calling-overview.view",
  "dashboard.absentee-calling.view",
  "dashboard.center-attendance-upload.view",
  "dashboard.download-students.view",
  "dashboard.exams-marks.view",
  "dashboard.copy-checking.view",
]), getDashboardOptions);
router.get("/analytics", requirePermission("dashboard.view"), getDashboardAnalytics);
router.get("/export", requirePermission("dashboard.export"), exportDashboardAnalytics);

router.get("/students", requirePermission("dashboard.students.view"), getStudentsDashboard);
router.get("/students/export", requirePermission("dashboard.students.export"), exportStudentsDashboard);

router.get("/attendance", requirePermission("dashboard.attendance.view"), getAttendanceDashboard);
router.get("/attendance/export", requirePermission("dashboard.attendance.export"), exportAttendanceDashboard);

router.get("/student-attendance", requirePermission("dashboard.student-attendance.view"), getStudentAttendanceDashboard);
router.get("/student-attendance/export", requirePermission("dashboard.student-attendance.export"), exportStudentAttendanceDashboard);
router.get("/student-attendance/export-students", requirePermission("dashboard.student-attendance.student-export"), exportAttendanceStudentData);

router.get("/absentee-calling-overview", requirePermission("dashboard.absentee-calling-overview.view"), getAbsenteeCallingOverviewDashboard);
router.get("/absentee-calling-overview/export", requirePermission("dashboard.absentee-calling-overview.export"), exportAbsenteeCallingOverviewDashboard);

router.get("/absentee-calling", requirePermission("dashboard.absentee-calling.view"), getAbsenteeCallingDashboard);
router.get("/absentee-calling/export", requirePermission("dashboard.absentee-calling.export"), exportAbsenteeCallingDashboard);
router.get("/absentee-calling/export-students", requirePermission("dashboard.absentee-calling.student-export"), exportCallingStudentData);

router.get("/center-attendance-upload", requirePermission("dashboard.center-attendance-upload.view"), getCenterAttendanceUploadDashboard);
router.get("/center-attendance-upload/export", requirePermission("dashboard.center-attendance-upload.export"), exportCenterAttendanceUploadDashboard);

router.get("/download-students/options", requirePermission("dashboard.download-students.view"), getDownloadStudentsOptions);
router.get("/download-students/export", requirePermission("dashboard.download-students.export"), downloadStudentsDashboard);

router.get("/exams-marks", requirePermission("dashboard.exams-marks.view"), getExamsMarksDashboard);
router.get("/exams-marks/report", requirePermission("dashboard.exams-marks.view"), getExamMarksReport);
router.get("/exams-marks/export", requirePermission("dashboard.exams-marks.export"), exportExamMarksReport);
router.get("/exams-marks/export-students", requirePermission("dashboard.exams-marks.student-export"), exportExamStudentsData);

router.get("/copy-checking", requirePermission("dashboard.copy-checking.view"), getCopyCheckingDashboard);
router.get("/copy-checking/export", requirePermission("dashboard.copy-checking.export"), exportCopyCheckingDashboard);
router.get("/copy-checking/export-students", requirePermission("dashboard.copy-checking.student-export"), exportCopyCheckingStudentData);

export default router;
