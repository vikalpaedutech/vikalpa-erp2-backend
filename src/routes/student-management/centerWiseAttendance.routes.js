import { Router } from "express";

import {
  createCenterWiseAttendance,
  getCenterWiseAttendances,
  getCenterWiseAttendanceById,
  getCenterWiseAttendanceFileUrl,
  deleteCenterWiseAttendance,
downloadCenterWiseAttendanceTemplate,

} from "../../controllers/student-management/centerWiseAttendance.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { uploadPdf } from "../../middlewares/upload.middlewares.js";

const router = Router();



router.use(verifyJWT);

// Create center-wise attendance
router
  .route("/")
  .post(
    uploadPdf.single("file"),
    createCenterWiseAttendance
  );

// Get center-wise attendance records
router.route("/").get(getCenterWiseAttendances);

// Get single attendance record
router
  .route("/:attendanceId")
  .get(getCenterWiseAttendanceById)
  .delete(deleteCenterWiseAttendance);

// Get temporary signed URL for PDF
router
  .route("/:attendanceId/file")
  .get(getCenterWiseAttendanceFileUrl);

// Download attendance PDF template for a center
router
  .route("/download-template/:programId/:batchId/:centerId")
  .get(downloadCenterWiseAttendanceTemplate);



export default router;