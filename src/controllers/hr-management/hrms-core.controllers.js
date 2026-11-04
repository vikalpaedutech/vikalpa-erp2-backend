import mongoose from "mongoose";
import { Employee } from "../../models/hr-management/employee.models.js";
import { EmployeeDocument } from "../../models/hr-management/employeeDocument.models.js";
import { EmployeeContact } from "../../models/hr-management/employeeContact.models.js";
import { EmploymentHistory } from "../../models/hr-management/employmentHistory.models.js";
import { Department } from "../../models/program-management/department.models.js";
import { Designation } from "../../models/program-management/designation.models.js";
import { User } from "../../models/user.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { ApiResponse } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

async function hasHRAccess(userId, user) {
  if (user?.isAdmin === true) return true;
  const rows = await UserRole.find({ userId, isActive: true }).populate("roleId", "roleCode roleName").lean();
  return rows.some(({ roleId }) => [roleId?.roleCode, roleId?.roleName].filter(Boolean)
    .some(v => ["admin", "administrator", "hr", "hr-admin", "hr manager", "hr_manager", "hradmin", "hr_admin"].includes(String(v).toLowerCase())));
}
async function requireHR(req) {
  if (!(await hasHRAccess(req.user?._id, req.user))) throw new ApiError(403, "HR administrator access is required");
}
function validId(id, label = "ID") {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${label}`);
}
function cleanAddress(value = {}) {
  return {
    line1: String(value.line1 || "").trim(), line2: String(value.line2 || "").trim(),
    city: String(value.city || "").trim(), state: String(value.state || "").trim(),
    postalCode: String(value.postalCode || "").trim(), country: String(value.country || "India").trim()
  };
}

export const listEmployees = asyncHandler(async (req, res) => {
  await requireHR(req);
  const filter = {};
  if (req.query.status) filter.employmentStatus = String(req.query.status);
  if (req.query.departmentId) { validId(req.query.departmentId, "departmentId"); filter.departmentId = req.query.departmentId; }
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
  const search = String(req.query.search || "").trim().slice(0, 100);
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = await User.find({ $or: [{ name: rx }, { email: rx }, { userId: rx }] }).select("_id").lean();
    filter.$or = [{ firstName: rx }, { lastName: rx }, { employeeCode: rx }, { personalEmail: rx }, { userId: { $in: users.map(x => x._id) } }];
  }
  const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || "50", 10)));
  const [employees, total] = await Promise.all([
    Employee.find(filter).populate("userId", "name email userId isActive").populate("departmentId", "departmentName departmentCode").populate("designationId", "designation designationCode").populate("reportingManagerId", "name email userId").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Employee.countDocuments(filter)
  ]);
  res.status(200).json(new ApiResponse(200, { employees, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }, "Employees fetched successfully"));
});

export const createEmployee = asyncHandler(async (req, res) => {
  await requireHR(req);
  const body = req.body || {};
  if (!String(body.employeeCode || "").trim() || !String(body.firstName || "").trim()) throw new ApiError(400, "employeeCode and firstName are required");
  let linkedUser = null;
  if (body.userId) {
    validId(body.userId, "userId");
    linkedUser = await User.findById(body.userId).select("_id isActive");
    if (!linkedUser || linkedUser.isActive === false) throw new ApiError(404, "Active ERP user not found");
    const linked = await Employee.findOne({ userId: body.userId });
    if (linked) throw new ApiError(409, "This ERP user is already linked to an employee profile");
  }
  if (body.departmentId) { validId(body.departmentId, "departmentId"); if (!(await Department.exists({ _id: body.departmentId }))) throw new ApiError(404, "Department not found"); }
  if (body.designationId) { validId(body.designationId, "designationId"); if (!(await Designation.exists({ _id: body.designationId }))) throw new ApiError(404, "Designation not found"); }
  if (body.reportingManagerId) { validId(body.reportingManagerId, "reportingManagerId"); if (!(await User.exists({ _id: body.reportingManagerId }))) throw new ApiError(404, "Reporting manager not found"); }
  const employee = await Employee.create({
    userId: body.userId || null, employeeCode: body.employeeCode, firstName: body.firstName, lastName: body.lastName || "",
    dateOfBirth: body.dateOfBirth || null, gender: body.gender || "", maritalStatus: body.maritalStatus || "",
    personalEmail: body.personalEmail || "", personalPhone: body.personalPhone || "",
    profileImage: body.profileImage || {}, currentAddress: cleanAddress(body.currentAddress), permanentAddress: cleanAddress(body.permanentAddress),
    departmentId: body.departmentId || null, designationId: body.designationId || null, reportingManagerId: body.reportingManagerId || null,
    workLocation: body.workLocation || "", employmentType: body.employmentType || "Full-time",
    employmentStatus: body.employmentStatus || (body.dateOfJoining ? "Active" : "Pre-boarding"),
    dateOfJoining: body.dateOfJoining || null, probationEndDate: body.probationEndDate || null,
    confirmationDate: body.confirmationDate || null, employeeCategory: body.employeeCategory || "", notes: body.notes || "",
    createdBy: req.user._id, updatedBy: req.user._id
  });
  await EmploymentHistory.create({
    employeeId: employee._id, changeType: "JOINING", effectiveDate: employee.dateOfJoining || new Date(),
    previousValues: {}, newValues: { employeeCode: employee.employeeCode, employmentStatus: employee.employmentStatus, departmentId: employee.departmentId, designationId: employee.designationId },
    reason: "Employee profile created", createdBy: req.user._id
  });
  res.status(201).json(new ApiResponse(201, employee, "Employee profile created successfully"));
});

export const getEmployee = asyncHandler(async (req, res) => {
  await requireHR(req); validId(req.params.id, "employee ID");
  const employee = await Employee.findById(req.params.id).populate("userId", "name email userId isActive").populate("departmentId", "departmentName departmentCode").populate("designationId", "designation designationCode").populate("reportingManagerId", "name email userId").lean();
  if (!employee) throw new ApiError(404, "Employee not found");
  const [documents, contacts, history] = await Promise.all([
    EmployeeDocument.find({ employeeId: employee._id }).sort({ createdAt: -1 }).lean(),
    EmployeeContact.find({ employeeId: employee._id }).sort({ isPrimary: -1, createdAt: -1 }).lean(),
    EmploymentHistory.find({ employeeId: employee._id }).populate("createdBy", "name").populate("approvedBy", "name").sort({ effectiveDate: -1 }).lean()
  ]);
  res.status(200).json(new ApiResponse(200, { employee, documents, contacts, history }, "Employee profile fetched successfully"));
});

export const updateEmployee = asyncHandler(async (req, res) => {
  await requireHR(req); validId(req.params.id, "employee ID");
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw new ApiError(404, "Employee not found");
  const allowed = ["userId","firstName","lastName","dateOfBirth","gender","maritalStatus","personalEmail","personalPhone","profileImage","currentAddress","permanentAddress","departmentId","designationId","reportingManagerId","workLocation","employmentType","employmentStatus","dateOfJoining","probationEndDate","confirmationDate","dateOfExit","employeeCategory","notes","isActive"];
  const previous = {};
  const next = {};
  for (const key of allowed) if (req.body[key] !== undefined) {
    previous[key] = employee[key];
    next[key] = req.body[key];
    if (key === "userId" && req.body[key]) {
      validId(req.body[key], "userId");
      const linkedUser = await User.findById(req.body[key]).select("_id isActive");
      if (!linkedUser || linkedUser.isActive === false) throw new ApiError(404, "Active ERP user not found");
      const duplicate = await Employee.findOne({ userId: req.body[key], _id: { $ne: employee._id } });
      if (duplicate) throw new ApiError(409, "This ERP user is already linked to another employee profile");
    }
    if (["departmentId","designationId","reportingManagerId"].includes(key) && req.body[key]) validId(req.body[key], key);
    employee[key] = ["currentAddress","permanentAddress"].includes(key) ? cleanAddress(req.body[key]) : req.body[key];
  }
  employee.updatedBy = req.user._id;
  await employee.save();
  const changed = Object.keys(next);
  if (changed.length) {
    const movementFields = ["departmentId","designationId","reportingManagerId","workLocation","employmentStatus"];
    const movement = changed.some(k => movementFields.includes(k));
    await EmploymentHistory.create({
      employeeId: employee._id,
      changeType: next.employmentStatus === "Exited" ? "EXIT" : next.employmentStatus === "Notice Period" ? "RESIGNATION" : next.designationId ? "PROMOTION" : next.departmentId ? "DEPARTMENT_TRANSFER" : next.workLocation ? "LOCATION_TRANSFER" : next.reportingManagerId ? "REPORTING_CHANGE" : "OTHER",
      effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : new Date(),
      previousValues: previous, newValues: next, reason: String(req.body.changeReason || (movement ? "Employee profile updated" : "Employee details updated")),
      approvedBy: req.user._id, createdBy: req.user._id
    });
  }
  res.status(200).json(new ApiResponse(200, employee, "Employee updated successfully"));
});

export const addEmployeeDocument = asyncHandler(async (req, res) => {
  await requireHR(req); validId(req.params.id, "employee ID");
  if (!(await Employee.exists({ _id: req.params.id }))) throw new ApiError(404, "Employee not found");
  const { documentType, documentName, documentNumber, file, issueDate, expiryDate, remarks } = req.body;
  if (!documentType || !documentName) throw new ApiError(400, "documentType and documentName are required");
  const document = await EmployeeDocument.create({ employeeId: req.params.id, documentType, documentName, documentNumber, file, issueDate, expiryDate, remarks, uploadedBy: req.user._id });
  res.status(201).json(new ApiResponse(201, document, "Employee document added successfully"));
});

export const addEmployeeContact = asyncHandler(async (req, res) => {
  await requireHR(req); validId(req.params.id, "employee ID");
  if (!(await Employee.exists({ _id: req.params.id }))) throw new ApiError(404, "Employee not found");
  const contact = await EmployeeContact.create({ ...req.body, employeeId: req.params.id });
  res.status(201).json(new ApiResponse(201, contact, "Employee contact added successfully"));
});

export const addEmploymentHistory = asyncHandler(async (req, res) => {
  await requireHR(req); validId(req.params.id, "employee ID");
  if (!(await Employee.exists({ _id: req.params.id }))) throw new ApiError(404, "Employee not found");
  const { changeType, effectiveDate, previousValues = {}, newValues = {}, reason = "" } = req.body;
  if (!changeType || !effectiveDate) throw new ApiError(400, "changeType and effectiveDate are required");
  const row = await EmploymentHistory.create({ employeeId: req.params.id, changeType, effectiveDate, previousValues, newValues, reason, approvedBy: req.user._id, createdBy: req.user._id });
  res.status(201).json(new ApiResponse(201, row, "Employment history entry created"));
});
