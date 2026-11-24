import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import {
  listHolidayCalendars, createHoliday, bulkCreateHolidays, updateHoliday, deleteHoliday,
  getMyHolidayCalendar, saveMyHolidaySelection, listEmployeeHolidaySelections, getAttendanceHolidayOverlay
} from "../../controllers/hr-management/holidayCalendar.controllers.js";

const router = Router();
router.use(verifyJWT);
router.get("/my", getMyHolidayCalendar);
router.get("/attendance-overlay", getAttendanceHolidayOverlay);
router.post("/my/selections", saveMyHolidaySelection);
router.get("/selections", listEmployeeHolidaySelections);
router.get("/", listHolidayCalendars);
router.post("/", createHoliday);
router.post("/bulk", bulkCreateHolidays);
router.patch("/:id", updateHoliday);
router.delete("/:id", deleteHoliday);
export default router;
