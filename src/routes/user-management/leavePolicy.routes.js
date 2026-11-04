import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { getLeavePolicies, upsertLeavePolicy, deactivateLeavePolicy, getAccrualReport } from "../../controllers/user-management/leavePolicy.controllers.js";

const router = Router();
router.use(verifyJWT);
router.get("/", getLeavePolicies);
router.get("/accrual-report", getAccrualReport);
router.post("/", upsertLeavePolicy);
router.patch("/:id/deactivate", deactivateLeavePolicy);
export default router;
