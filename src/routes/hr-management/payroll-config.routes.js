import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import {
  listSalaryComponents, createSalaryComponent, updateSalaryComponent,
  listSalaryStructures, createSalaryStructure, updateSalaryStructure,
  listEmployeeCompensations, assignEmployeeCompensation, listPayrollRuns
} from "../../controllers/hr-management/payroll-config.controllers.js";
const router = Router();
router.use(verifyJWT);
router.get("/components", listSalaryComponents);
router.post("/components", createSalaryComponent);
router.patch("/components/:id", updateSalaryComponent);
router.get("/structures", listSalaryStructures);
router.post("/structures", createSalaryStructure);
router.patch("/structures/:id", updateSalaryStructure);
router.get("/compensations", listEmployeeCompensations);
router.post("/compensations", assignEmployeeCompensation);
router.get("/runs", listPayrollRuns);
export default router;
