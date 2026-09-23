import { Router } from "express";

import {
    createCallingDetails,
    getCallingDetails,
    getCallingDetailsById,
    updateCallingDetails,
    deleteCallingDetails,
    downloadCallingDetailsTemplate,
    bulkUploadCallingDetails,
    getMyCallingTypeSummary,
    exportCallingDetails,

    
    getAbsenteeCallingStudents,
    saveAbsenteeCalling,
} from "../../controllers/calling-management/callingDetails.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";


const router = Router();


router.use(verifyJWT);


// ============================================================
// CREATE CALLING DETAILS
// ============================================================

router
    .route("/")
    .post(createCallingDetails);


// ============================================================
// GET ALL CALLING DETAILS
// ============================================================

router
    .route("/")
    .get(getCallingDetails);


    // ============================================================
// ABSENTEE CALLING
// ============================================================

router
    .route("/absentee-students")
    .get(getAbsenteeCallingStudents);

router
    .route("/absentee-call")
    .post(saveAbsenteeCalling);


// ============================================================
// MY CALLING TYPE SUMMARY
// ============================================================

router
    .route("/my-call-types")
    .get(getMyCallingTypeSummary);


// ============================================================
// DOWNLOAD CALLING DETAILS TEMPLATE
// ============================================================

router
    .route("/template")
    .get(downloadCallingDetailsTemplate);


// ============================================================
// BULK UPLOAD CALLING DETAILS
// ============================================================

router
    .route("/bulk-upload")
    .post(bulkUploadCallingDetails);


// ============================================================
// EXPORT CALLING DETAILS
// ============================================================

router
    .route("/export")
    .get(exportCallingDetails);


// ============================================================
// GET CALLING DETAILS BY ID
// ============================================================

router
    .route("/:callingDetailsId")
    .get(getCallingDetailsById);


// ============================================================
// UPDATE CALLING DETAILS
// ============================================================

router
    .route("/:callingDetailsId")
    .patch(updateCallingDetails);


// ============================================================
// DELETE CALLING DETAILS
// ============================================================

router
    .route("/:callingDetailsId")
    .delete(deleteCallingDetails);


export default router;