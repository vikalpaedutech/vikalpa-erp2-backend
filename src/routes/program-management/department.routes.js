import { Router } from "express";
import {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  toggleDepartmentStatus,
  getActiveDepartments,
} from "../../controllers/program-management/department.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

// Create & Get All Departments
router.route("/").post(createDepartment).get(getAllDepartments);

// Get Active Departments
router.route("/active").get(getActiveDepartments);

// Get, Update & Delete Department
router
  .route("/:departmentId")
  .get(getDepartmentById)
  .patch(updateDepartment)
  .delete(deleteDepartment);

// Toggle Department Status
router
  .route("/:departmentId/status")
  .patch(toggleDepartmentStatus);

export default router;