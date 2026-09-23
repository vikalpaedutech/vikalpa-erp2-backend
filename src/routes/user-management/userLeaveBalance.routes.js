import { Router } from "express";

import {
  getMyLeaveBalances,
  getLeaveBalances,
  upsertLeaveBalance,
  bulkConfigureLeaveBalances,
} from "../../controllers/user-management/userLeaveBalance.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Employee: get own leave balances
router.get("/my", getMyLeaveBalances);

// Admin: get configured balances
router.get("/", getLeaveBalances);

// Admin: configure/update one employee balance
router.post("/", upsertLeaveBalance);

// Admin: configure/update balances for multiple employees
router.post("/bulk", bulkConfigureLeaveBalances);

export default router;
