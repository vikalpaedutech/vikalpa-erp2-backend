import { Router } from "express";

import {
  createBillAuditor,
  getBillAuditors,
  getBillAuditorById,
  updateBillAuditor,
  deleteBillAuditor,
} from "../../controllers/finance-management/billAuditor.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Create bill auditor mapping
router
  .route("/")
  .post(createBillAuditor);

// Get all bill auditor mappings
router
  .route("/")
  .get(getBillAuditors);

// Get bill auditor mapping by ID
router
  .route("/:billAuditorId")
  .get(getBillAuditorById);

// Update bill auditor mapping
router
  .route("/:billAuditorId")
  .patch(updateBillAuditor);

// Delete bill auditor mapping
router
  .route("/:billAuditorId")
  .delete(deleteBillAuditor);

export default router;