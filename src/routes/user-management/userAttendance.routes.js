import { Router } from "express";
import multer from "multer";
import { downloadBulkAttendanceTemplate, uploadBulkAttendance } from "../../controllers/user-management/bulkAttendance.controllers.js";
const bulkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

import {
  createUserAttendance,
  getUserAttendance,
  getUserAttendanceById,
  updateUserAttendance,
  checkoutUserAttendance,
  getMyUserAttendance,
} from "../../controllers/user-management/userAttendance.controllers.js";

import {
  getAccessBasedUserAttendance,
} from "../../controllers/user-management/attendanceAccess.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { uploadImage } from "../../middlewares/upload.middlewares.js";

const router = Router();

router.use(verifyJWT);
router.get("/bulk/template", downloadBulkAttendanceTemplate);
router.post("/bulk", bulkUpload.single("file"), uploadBulkAttendance);

// ============================================================
// CREATE ATTENDANCE
// ============================================================

router.post(
  "/",
  uploadImage.single("photo"),
  createUserAttendance
);

// ============================================================
// GET ACCESS BASED ATTENDANCE
// ============================================================

router.get(
  "/access-based",
  getAccessBasedUserAttendance
);

// ============================================================
// GET MY ATTENDANCE
// ============================================================

router.get(
  "/me",
  getMyUserAttendance
);

// ============================================================
// GET ATTENDANCE LIST
// ============================================================

router.get(
  "/",
  getUserAttendance
);

// ============================================================
// GET ATTENDANCE BY ID
// ============================================================

router.get(
  "/:id",
  getUserAttendanceById
);

// ============================================================
// UPDATE ATTENDANCE
// ============================================================

router.patch(
  "/:id/checkout",
  checkoutUserAttendance
);

router.patch(
  "/:id",
  uploadImage.single("photo"),
  updateUserAttendance
);

export default router;