import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { getStudentResources,saveStudentResource,exportDress,getStudentDistances,saveStudentDistance,exportDistance,getTA,updateTAGiven,getTAStudentAttendance,updateTAStudentAttendance,exportTA,exportDetailedTA } from "../../controllers/student-management/studentResources.controllers.js";
const router=Router();router.use(verifyJWT);
router.get("/dress",getStudentResources);router.post("/dress",saveStudentResource);router.get("/dress/export",exportDress);
router.get("/distance",getStudentDistances);router.post("/distance",saveStudentDistance);router.get("/distance/export",exportDistance);
router.get("/ta",getTA);router.post("/ta/given",updateTAGiven);router.get("/ta/attendance",getTAStudentAttendance);router.patch("/ta/attendance",updateTAStudentAttendance);router.get("/ta/export",exportTA);router.get("/ta/export-detailed",exportDetailedTA);
export default router;
