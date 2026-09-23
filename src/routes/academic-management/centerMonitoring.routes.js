import { Router } from "express";

import {
  createCenterMonitoring,
  getMonitoringCenters,
  getCenterMonitoringRecords,
  getMyMonitoringAccess,
  getCenterMonitoringSummary,
  getCenterMonitoringReport,
  getCenterMonitoringReportOptions,
  getCenterMonitoringIndividualReport,
} from "../../controllers/academic-management/centerMonitoring.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Center Monitoring
router.get("/my-access", getMyMonitoringAccess);
router.get("/centers", getMonitoringCenters);
router.post("/", createCenterMonitoring);

// Monitoring Records
router.get("/records", getCenterMonitoringRecords);
router.get("/summary", getCenterMonitoringSummary);

// Monitoring Report Options
router.get("/report-options", getCenterMonitoringReportOptions);

// Main / Full Monitoring Report
router.get("/report", getCenterMonitoringReport);

// Individual / My Monitoring Report
router.get(
  "/individual-report",
  getCenterMonitoringIndividualReport
);

export default router;