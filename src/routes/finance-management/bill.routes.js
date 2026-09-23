

import { Router } from "express";

import {
  createBill,
  getBills,
  getBillsForVerification,
  getBillsForApproval,
  getBillById,
  getBillHistory,
  updateBill,
  submitBill,
  verifyBill,
  rejectBill,
  approveBill,
  markPaymentPending,
  markBillPaid,
  getBillDashboard,

  // Bulk actions
  bulkVerifyBills,
  bulkApproveBills,
  bulkRejectBills,

  // Dashboard export
  exportBillDashboard,
    bulkMarkPaymentPending,
  bulkMarkBillsPaid,
} from "../../controllers/finance-management/bill.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

import { uploadFinanceAttachments } from "../../middlewares/financeUpload.middlewares.js";

const router = Router();

router.use(verifyJWT);

// ============================================================
// CREATE BILL
// ============================================================

router
  .route("/")
  .post(
    uploadFinanceAttachments.array("attachments", 10),
    createBill
  );

// ============================================================
// WORKFLOW QUEUES
// ============================================================

// Bills pending verification
router
  .route("/verification")
  .get(getBillsForVerification);

// Bills pending approval
router
  .route("/approval")
  .get(getBillsForApproval);


  // ============================================================
// BULK PAYMENT ACTIONS
// IMPORTANT:
// These routes MUST come before /:billId routes.
// ============================================================

// Bulk move approved bills to payment pending
router
  .route("/bulk-payment-pending")
  .patch(bulkMarkPaymentPending);

// Bulk mark payment-pending bills as paid
router
  .route("/bulk-paid")
  .patch(bulkMarkBillsPaid);


// ============================================================
// BILL DASHBOARD
// ============================================================

router
  .route("/dashboard")
  .get(getBillDashboard);

// ============================================================
// BILL DASHBOARD
// ============================================================

// Master bill dashboard
router
  .route("/dashboard")
  .get(getBillDashboard);

// Export dashboard data as CSV
router
  .route("/dashboard/export")
  .get(exportBillDashboard);

// ============================================================
// BULK WORKFLOW ACTIONS
// IMPORTANT:
// These routes MUST come before /:billId routes.
// ============================================================

// Bulk verify
router
  .route("/bulk-verify")
  .patch(bulkVerifyBills);

// Bulk approve
router
  .route("/bulk-approve")
  .patch(bulkApproveBills);

// Bulk reject
router
  .route("/bulk-reject")
  .patch(bulkRejectBills);

// ============================================================
// NORMAL BILLS
// ============================================================

// Get own bills
router
  .route("/")
  .get(getBills);

// Submit / resubmit bill
router
  .route("/:billId/submit")
  .patch(submitBill);

// Verify bill
router
  .route("/:billId/verify")
  .patch(verifyBill);

// Reject bill
router
  .route("/:billId/reject")
  .patch(rejectBill);

// Approve bill
router
  .route("/:billId/approve")
  .patch(approveBill);

// Move bill to payment pending
router
  .route("/:billId/payment-pending")
  .patch(markPaymentPending);

// Mark bill as paid
router
  .route("/:billId/paid")
  .patch(markBillPaid);

// Get bill history
router
  .route("/:billId/history")
  .get(getBillHistory);

// Get bill by ID
router
  .route("/:billId")
  .get(getBillById)
  .patch(
    uploadFinanceAttachments.array(
      "attachments",
      10
    ),
    updateBill
  );

export default router;