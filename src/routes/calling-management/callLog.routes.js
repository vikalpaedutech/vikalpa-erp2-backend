import { Router } from "express";

import {
    createCallLog,
    getCallLogs,
    getCallLogById,
    updateCallLog,
    deleteCallLog,
    createCallAttempt,
} from "../../controllers/calling-management/callLog.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();


router.use(verifyJWT);


// Create Call Attempt
router
    .route("/attempt")
    .post(createCallAttempt);


// Create Call Log
router
    .route("/")
    .post(createCallLog);


// Get Call Logs
router
    .route("/")
    .get(getCallLogs);


// Get Call Log By ID
router
    .route("/:callLogId")
    .get(getCallLogById);


// Update Call Log
router
    .route("/:callLogId")
    .patch(updateCallLog);


// Delete Call Log
router
    .route("/:callLogId")
    .delete(deleteCallLog);
export default router;