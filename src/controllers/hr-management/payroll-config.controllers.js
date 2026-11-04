import mongoose from "mongoose";
import { SalaryComponent } from "../../models/hr-management/salaryComponent.models.js";
import { SalaryStructure } from "../../models/hr-management/salaryStructure.models.js";
import { EmployeeCompensation } from "../../models/hr-management/employeeCompensation.models.js";
import { PayrollRun } from "../../models/hr-management/payrollRun.models.js";
import { Employee } from "../../models/hr-management/employee.models.js";
import { EmploymentHistory } from "../../models/hr-management/employmentHistory.models.js";
import { User } from "../../models/user.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { ApiResponse } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

async function requireHR(req) {
  if (req.user?.isAdmin === true) return;
  const roles = await UserRole.find({ userId: req.user._id, isActive: true }).populate("roleId", "roleCode roleName").lean();
  const allowed = roles.some(({ roleId }) => [roleId?.roleCode, roleId?.roleName].filter(Boolean)
    .some(v => ["admin", "administrator", "hr", "hr-admin", "hr manager", "hr_manager", "hradmin", "hr_admin", "finance"].includes(String(v).toLowerCase())));
  if (!allowed) throw new ApiError(403, "HR/Finance administrator access is required");
}

export const listSalaryComponents = asyncHandler(async (req, res) => {
  await requireHR(req);
  const rows = await SalaryComponent.find(req.query.isActive === undefined ? {} : { isActive: req.query.isActive === "true" }).sort({ componentType: 1, name: 1 }).lean();
  res.status(200).json(new ApiResponse(200, rows, "Salary components fetched"));
});
export const createSalaryComponent = asyncHandler(async (req, res) => {
  await requireHR(req);
  const { name, code, componentType } = req.body;
  if (!name || !code || !componentType) throw new ApiError(400, "name, code and componentType are required");
  const row = await SalaryComponent.create({ ...req.body, code: String(code).toUpperCase(), createdBy: req.user._id, updatedBy: req.user._id });
  res.status(201).json(new ApiResponse(201, row, "Salary component created"));
});
export const updateSalaryComponent = asyncHandler(async (req, res) => {
  await requireHR(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid component ID");
  const row = await SalaryComponent.findById(req.params.id);
  if (!row) throw new ApiError(404, "Salary component not found");
  for (const key of ["name","componentType","calculationType","defaultAmount","percentageOf","isStatutory","isTaxable","isActive"]) if (req.body[key] !== undefined) row[key] = req.body[key];
  if (req.body.code !== undefined) row.code = String(req.body.code).toUpperCase();
  row.updatedBy = req.user._id;
  await row.save();
  res.status(200).json(new ApiResponse(200, row, "Salary component updated"));
});

export const listSalaryStructures = asyncHandler(async (req, res) => {
  await requireHR(req);
  const rows = await SalaryStructure.find(req.query.isActive === undefined ? {} : { isActive: req.query.isActive === "true" }).populate("components.componentId", "name code componentType").sort({ name: 1 }).lean();
  res.status(200).json(new ApiResponse(200, rows, "Salary structures fetched"));
});
export const createSalaryStructure = asyncHandler(async (req, res) => {
  await requireHR(req);
  if (!req.body.name) throw new ApiError(400, "Salary structure name is required");
  const components = Array.isArray(req.body.components) ? req.body.components : [];
  for (const item of components) if (!mongoose.isValidObjectId(item.componentId)) throw new ApiError(400, "Every salary structure component needs a valid componentId");
  if (components.length) {
    const uniqueIds = [...new Set(components.map(x => String(x.componentId)))];
    const count = await SalaryComponent.countDocuments({ _id: { $in: uniqueIds } });
    if (count !== uniqueIds.length) throw new ApiError(400, "One or more salary components do not exist");
  }
  const row = await SalaryStructure.create({ ...req.body, components, createdBy: req.user._id, updatedBy: req.user._id });
  res.status(201).json(new ApiResponse(201, row, "Salary structure created"));
});
export const updateSalaryStructure = asyncHandler(async (req, res) => {
  await requireHR(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid structure ID");
  const row = await SalaryStructure.findById(req.params.id);
  if (!row) throw new ApiError(404, "Salary structure not found");
  for (const key of ["name","description","currency","components","isActive"]) if (req.body[key] !== undefined) row[key] = req.body[key];
  row.updatedBy = req.user._id;
  await row.save();
  res.status(200).json(new ApiResponse(200, row, "Salary structure updated"));
});

export const listEmployeeCompensations = asyncHandler(async (req, res) => {
  await requireHR(req);
  const filter = {};
  if (req.query.employeeId) filter.employeeId = req.query.employeeId;
  if (req.query.status) filter.status = req.query.status;
  const rows = await EmployeeCompensation.find(filter).populate("employeeId", "name email userId").populate("salaryStructureId", "name").sort({ effectiveFrom: -1 }).lean();
  res.status(200).json(new ApiResponse(200, rows, "Employee compensations fetched"));
});
export const assignEmployeeCompensation = asyncHandler(async (req, res) => {
  await requireHR(req);
  const { employeeId, annualCTC, monthlyGross, effectiveFrom, salaryStructureId, reason = "" } = req.body;
  if (!mongoose.isValidObjectId(employeeId) || !(await User.exists({ _id: employeeId }))) throw new ApiError(400, "Valid ERP employee userId is required");
  if (!Number.isFinite(Number(annualCTC)) || Number(annualCTC) < 0 || !Number.isFinite(Number(monthlyGross)) || Number(monthlyGross) < 0 || !effectiveFrom) throw new ApiError(400, "annualCTC, monthlyGross and effectiveFrom are required");
  if (salaryStructureId && (!mongoose.isValidObjectId(salaryStructureId) || !(await SalaryStructure.exists({ _id: salaryStructureId, isActive: true })))) throw new ApiError(400, "Invalid or inactive salaryStructureId");
  const effectiveDate = new Date(effectiveFrom);
  if (Number.isNaN(effectiveDate.getTime())) throw new ApiError(400, "Invalid effectiveFrom date");
  const employeeProfile = await Employee.findOne({ userId: employeeId }).select("_id").lean();
  const session = await mongoose.startSession();
  let row = null;
  let previous = null;
  try {
    await session.withTransaction(async () => {
      previous = await EmployeeCompensation.findOne({ employeeId, status: "ACTIVE" }).sort({ effectiveFrom: -1 }).session(session);
      if (previous && effectiveDate <= previous.effectiveFrom) throw new ApiError(400, "New compensation must have a later effective date than the current compensation");
      const history = previous ? [...previous.revisionHistory, {
        salaryStructureId: previous.salaryStructureId,
        annualCTC: previous.annualCTC,
        monthlyGross: previous.monthlyGross,
        effectiveFrom: previous.effectiveFrom,
        reason: "Previous compensation snapshot",
        createdBy: req.user._id
      }] : [];
      row = new EmployeeCompensation({
        employeeId, employeeProfileId: employeeProfile?._id || null, salaryStructureId: salaryStructureId || null,
        annualCTC: Number(annualCTC), monthlyGross: Number(monthlyGross),
        effectiveFrom: effectiveDate, status: "ACTIVE", notes: reason,
        revisionHistory: history, createdBy: req.user._id, updatedBy: req.user._id
      });
      await row.save({ session });
      if (previous) {
        previous.status = "SUPERSEDED";
        previous.effectiveTo = new Date(effectiveDate.getTime() - 1);
        await previous.save({ session });
      }
      if (employeeProfile) {
        await EmploymentHistory.create([{
          employeeId: employeeProfile._id, changeType: "SALARY_REVISION", effectiveDate,
          previousValues: previous ? { annualCTC: previous.annualCTC, monthlyGross: previous.monthlyGross, salaryStructureId: previous.salaryStructureId } : {},
          newValues: { annualCTC: Number(annualCTC), monthlyGross: Number(monthlyGross), salaryStructureId: salaryStructureId || null },
          reason: reason || (previous ? "Compensation revision" : "Initial compensation assignment"),
          approvedBy: req.user._id, createdBy: req.user._id
        }], { session });
      }
    });
  } finally {
    await session.endSession();
  }
  res.status(201).json(new ApiResponse(201, row, "Employee compensation assigned"));
});

export const listPayrollRuns = asyncHandler(async (req, res) => {
  await requireHR(req);
  const filter = { isArchived: false };
  if (req.query.period) filter.period = String(req.query.period);
  const rows = await PayrollRun.find(filter).sort({ period: -1 }).lean();
  res.status(200).json(new ApiResponse(200, rows, "Payroll runs fetched"));
});
