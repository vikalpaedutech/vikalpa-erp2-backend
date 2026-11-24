import mongoose from "mongoose";
import { HolidayCalendar } from "../../models/hr-management/holidayCalendar.models.js";
import { EmployeeHolidaySelections } from "../../models/hr-management/employeeHolidaySelections.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { UserDesignation } from "../../models/user-management/userDesignation.models.js";
import { User } from "../../models/user.models.js";
import { ApiResponse } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

const calendarKey = (name, year) => `${String(name).trim()}::${Number(year)}`;
const indiaToday = () => new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
async function isHRAdmin(userId, user) {
  if (user?.isAdmin === true) return true;
  const rows = await UserRole.find({ userId, isActive: true }).populate("roleId", "roleCode roleName").lean();
  return rows.some(({ roleId }) => [roleId?.roleCode, roleId?.roleName].filter(Boolean)
    .some(v => ["admin", "administrator", "hr", "hr-admin", "hr manager", "hr_manager", "hradmin", "hr_admin"].includes(String(v).toLowerCase())));
}
async function requireHR(req) {
  if (!(await isHRAdmin(req.user?._id, req.user))) throw new ApiError(403, "HR administrator access is required");
}
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
function cleanHoliday(body, userId) {
  const year = Number(body.year);
  const date = String(body.date || "");
  if (!String(body.calendarName || "").trim()) throw new ApiError(400, "Calendar name is required");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, "A valid calendar year is required");
  if (!validDate(date) || Number(date.slice(0, 4)) !== year) throw new ApiError(400, "Holiday date must be valid and belong to the selected year");
  const type = ["National", "Festival", "Regional", "Other"].includes(body.type) ? body.type : "Other";
  const limit = Number(body.floatingHolidayLimit ?? 2);
  if (!Number.isInteger(limit) || limit < 0 || limit > 30) throw new ApiError(400, "Floating holiday limit must be between 0 and 30");
  const selectionStartDate = String(body.selectionStartDate || "");
  const selectionEndDate = String(body.selectionEndDate || "");
  if (selectionStartDate && !validDate(selectionStartDate)) throw new ApiError(400, "Invalid selection start date");
  if (selectionEndDate && !validDate(selectionEndDate)) throw new ApiError(400, "Invalid selection end date");
  if (selectionStartDate && selectionEndDate && selectionStartDate > selectionEndDate) throw new ApiError(400, "Selection end date must be on or after start date");
  const applicableTo = body.applicableTo || {};
  const applicability = {
    allEmployees: applicableTo.allEmployees !== false,
    designations: Array.isArray(applicableTo.designations) ? [...new Set(applicableTo.designations.map(String))] : [],
    departments: Array.isArray(applicableTo.departments)
      ? [...new Set(applicableTo.departments.map(String))]
      : Array.isArray(body.applicableDepartments) ? [...new Set(body.applicableDepartments.map(String))] : [],
    employees: Array.isArray(applicableTo.employees) ? [...new Set(applicableTo.employees.map(String))] : []
  };
  const selectedIds = [...applicability.designations, ...applicability.departments, ...applicability.employees];
  if (selectedIds.some(id => !mongoose.isValidObjectId(id))) throw new ApiError(400, "Invalid designation, department or employee ID in applicability rules");
  if (!applicability.allEmployees && !selectedIds.length) throw new ApiError(400, "Select at least one designation, department or employee, or enable All Employees");
  return {
    calendarName: String(body.calendarName).trim(), year, name: String(body.name || "").trim(),
    date, type, isOptional: Boolean(body.isOptional), floatingHolidayLimit: limit,
    selectionStartDate, selectionEndDate,
    applicableTo: applicability,
    isActive: body.isActive !== false, createdBy: userId, updatedBy: userId
  };
}

async function filterHolidaysForEmployee(holidays, employeeId) {
  const assignments = await UserDesignation.find({ userId: employeeId, isActive: true })
    .populate({ path: "designationId", select: "departmentId", populate: { path: "departmentId", select: "_id" } })
    .lean();
  const designationIds = new Set(assignments.map(x => String(x.designationId?._id || x.designationId)).filter(Boolean));
  const departmentIds = new Set(assignments.map(x => {
    const designation = x.designationId;
    return designation?.departmentId?._id ? String(designation.departmentId._id) : "";
  }).filter(Boolean));
  const employee = String(employeeId);
  return holidays.filter(holiday => {
    const rule = holiday.applicableTo || {};
    if (rule.allEmployees !== false) return true;
    const allowedDesignations = (rule.designations || []).map(String);
    const allowedDepartments = (rule.departments || []).map(String);
    const allowedEmployees = (rule.employees || []).map(String);
    if (!allowedDesignations.length && !allowedDepartments.length && !allowedEmployees.length) return false;
    return allowedEmployees.includes(employee)
      || allowedDesignations.some(id => designationIds.has(id))
      || allowedDepartments.some(id => departmentIds.has(id));
  });
}

export const listHolidayCalendars = asyncHandler(async (req, res) => {
  await requireHR(req);
  const filter = {};
  if (req.query.year) filter.year = Number(req.query.year);
  if (req.query.calendarName) filter.calendarName = String(req.query.calendarName);
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
  const holidays = await HolidayCalendar.find(filter).sort({ year: 1, date: 1, name: 1 }).lean();
  res.status(200).json(new ApiResponse(200, { holidays }, "Holiday calendar fetched successfully"));
});

export const createHoliday = asyncHandler(async (req, res) => {
  await requireHR(req);
  const payload = cleanHoliday(req.body, req.user._id);
  if (!payload.name) throw new ApiError(400, "Holiday name is required");
  const holiday = await HolidayCalendar.create(payload);
  res.status(201).json(new ApiResponse(201, holiday, "Holiday created successfully"));
});

export const bulkCreateHolidays = asyncHandler(async (req, res) => {
  await requireHR(req);
  const holidays = Array.isArray(req.body.holidays) ? req.body.holidays : [];
  if (!holidays.length) throw new ApiError(400, "At least one holiday is required");
  if (holidays.length > 500) throw new ApiError(400, "A maximum of 500 holidays can be uploaded at once");
  const docs = holidays.map(item => {
    const payload = cleanHoliday({ ...req.body, ...item }, req.user._id);
    if (!payload.name) throw new ApiError(400, "Every holiday must have a name");
    return payload;
  });
  const created = await HolidayCalendar.insertMany(docs, { ordered: true });
  res.status(201).json(new ApiResponse(201, { createdCount: created.length, holidays: created }, "Holidays created successfully"));
});

export const updateHoliday = asyncHandler(async (req, res) => {
  await requireHR(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid holiday ID");
  const current = await HolidayCalendar.findById(req.params.id);
  if (!current) throw new ApiError(404, "Holiday not found");
  const payload = cleanHoliday({ ...current.toObject(), ...req.body }, req.user._id);
  if (!payload.name) throw new ApiError(400, "Holiday name is required");
  Object.assign(current, payload, { updatedBy: req.user._id });
  await current.save();
  res.status(200).json(new ApiResponse(200, current, "Holiday updated successfully"));
});

export const deleteHoliday = asyncHandler(async (req, res) => {
  await requireHR(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid holiday ID");
  const holiday = await HolidayCalendar.findById(req.params.id);
  if (!holiday) throw new ApiError(404, "Holiday not found");
  const used = await EmployeeHolidaySelections.exists({ "selectedHolidays.holidayId": holiday._id });
  if (used) throw new ApiError(409, "This holiday has employee selections. Deactivate it instead of deleting it.");
  await holiday.deleteOne();
  res.status(200).json(new ApiResponse(200, { id: req.params.id }, "Holiday deleted successfully"));
});

export const getMyHolidayCalendar = asyncHandler(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, "Invalid year");
  const allHolidays = await HolidayCalendar.find({ year, isActive: true }).sort({ date: 1 }).lean();
  const holidays = await filterHolidaysForEmployee(allHolidays, req.user._id);
  const groups = new Map();
  for (const h of holidays) {
    const key = calendarKey(h.calendarName, h.year);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  const calendars = [];
  for (const [key, items] of groups) {
    const sample = items[0];
    const selection = await EmployeeHolidaySelections.findOne({ employeeId: req.user._id, holidayCalendarId: key }).lean();
    const selectedIds = new Set((selection?.selectedHolidays || []).map(x => String(x.holidayId)));
    calendars.push({
      calendarName: sample.calendarName, year: sample.year, holidayCalendarId: key,
      floatingHolidayLimit: Math.max(...items.map(x => Number(x.floatingHolidayLimit || 0))),
      selectionStartDate: sample.selectionStartDate || "", selectionEndDate: sample.selectionEndDate || "",
      fixedHolidays: items.filter(x => !x.isOptional),
      optionalHolidays: items.filter(x => x.isOptional).map(x => ({ ...x, isSelected: selectedIds.has(String(x._id)) })),
      selection: selection || null
    });
  }
  res.status(200).json(new ApiResponse(200, { calendars }, "My holiday calendar fetched successfully"));
});

export const saveMyHolidaySelection = asyncHandler(async (req, res) => {
  const { calendarName, year: rawYear, holidayIds } = req.body || {};
  const year = Number(rawYear);
  if (!String(calendarName || "").trim() || !Number.isInteger(year) || !Array.isArray(holidayIds)) throw new ApiError(400, "Calendar, year and selected holiday IDs are required");
  if (holidayIds.some(id => !mongoose.isValidObjectId(id))) throw new ApiError(400, "Invalid holiday selection");
  const key = calendarKey(calendarName, year);
  const calendarHolidays = await HolidayCalendar.find({ calendarName: String(calendarName).trim(), year, isActive: true }).lean();
  if (!calendarHolidays.length) throw new ApiError(404, "Holiday calendar not found");
  const holidays = await filterHolidaysForEmployee(calendarHolidays, req.user._id);
  const optional = holidays.filter(h => h.isOptional);
  const limit = Math.max(...holidays.map(h => Number(h.floatingHolidayLimit || 0)));
  const uniqueIds = [...new Set(holidayIds.map(String))];
  if (uniqueIds.length > limit) throw new ApiError(400, `You can select a maximum of ${limit} floating holidays`);
  const selected = uniqueIds.map(id => optional.find(h => String(h._id) === id));
  if (selected.some(x => !x)) throw new ApiError(400, "Only active optional holidays from this calendar can be selected");
  const start = optional.map(h => h.selectionStartDate).filter(Boolean).sort()[0] || "";
  const end = optional.map(h => h.selectionEndDate).filter(Boolean).sort().slice(-1)[0] || "";
  const today = indiaToday();
  if (start && today < start) throw new ApiError(400, `Floating holiday selection opens on ${start}`);
  if (end && today > end) throw new ApiError(400, `Floating holiday selection closed on ${end}`);
  const existing = await EmployeeHolidaySelections.findOne({ employeeId: req.user._id, holidayCalendarId: key });
  const selectedHolidays = selected.map(h => ({
    holidayId: h._id, holidayName: h.name, date: h.date, selectedAt: new Date()
  }));
  const doc = existing || new EmployeeHolidaySelections({ employeeId: req.user._id, holidayCalendarId: key, calendarName: String(calendarName).trim(), year, createdBy: req.user._id });
  doc.selectedHolidays = selectedHolidays;
  doc.totalAllowed = limit;
  doc.totalSelected = selectedHolidays.length;
  doc.status = "Confirmed";
  doc.updatedBy = req.user._id;
  await doc.save();
  res.status(200).json(new ApiResponse(200, doc, "Floating holidays saved successfully"));
});

export const listEmployeeHolidaySelections = asyncHandler(async (req, res) => {
  await requireHR(req);
  const filter = {};
  if (req.query.year) filter.year = Number(req.query.year);
  if (req.query.calendarName) filter.calendarName = String(req.query.calendarName);
  const selections = await EmployeeHolidaySelections.find(filter).populate("employeeId", "name email userId").sort({ year: -1, updatedAt: -1 }).lean();
  res.status(200).json(new ApiResponse(200, { selections }, "Employee holiday selections fetched successfully"));
});


// Build date-wise holiday rows for attendance screens and exports.
// Fixed holidays are included for eligible employees; optional holidays
// are included only when the employee has confirmed that selection.
async function buildAttendanceHolidayOverlay({ userIds, fromDate, toDate }) {
  const start = String(fromDate || "");
  const end = String(toDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return [];
  }

  const holidays = await HolidayCalendar.find({
    isActive: true,
    date: { $gte: start, $lte: end }
  }).lean();
  if (!holidays.length || !userIds.length) return [];

  const ids = userIds.map(String);
  const assignments = await UserDesignation.find({
    userId: { $in: ids },
    isActive: true
  }).populate({
    path: "designationId",
    select: "departmentId",
    populate: { path: "departmentId", select: "_id" }
  }).lean();

  const assignmentMap = new Map();
  for (const assignment of assignments) {
    const userKey = String(assignment.userId);
    if (!assignmentMap.has(userKey)) assignmentMap.set(userKey, { designations: new Set(), departments: new Set() });
    const item = assignmentMap.get(userKey);
    const designationId = assignment.designationId?._id || assignment.designationId;
    if (designationId) item.designations.add(String(designationId));
    const departmentId = assignment.designationId?.departmentId?._id || assignment.designationId?.departmentId;
    if (departmentId) item.departments.add(String(departmentId));
  }

  const selections = await EmployeeHolidaySelections.find({
    employeeId: { $in: ids },
    status: "Confirmed",
    year: { $gte: Number(start.slice(0, 4)), $lte: Number(end.slice(0, 4)) }
  }).lean();
  const selectedMap = new Map();
  for (const selection of selections) {
    const userKey = String(selection.employeeId);
    if (!selectedMap.has(userKey)) selectedMap.set(userKey, new Set());
    for (const selected of selection.selectedHolidays || []) {
      selectedMap.get(userKey).add(String(selected.holidayId));
    }
  }

  const result = [];
  for (const userId of ids) {
    const assigned = assignmentMap.get(userId) || { designations: new Set(), departments: new Set() };
    const selected = selectedMap.get(userId) || new Set();
    for (const holiday of holidays) {
      const rule = holiday.applicableTo || {};
      let eligible = rule.allEmployees !== false;
      if (!eligible) {
        eligible = (rule.employees || []).some(id => String(id) === userId)
          || (rule.designations || []).some(id => assigned.designations.has(String(id)))
          || (rule.departments || []).some(id => assigned.departments.has(String(id)));
      }
      if (!eligible) continue;
      if (holiday.isOptional && !selected.has(String(holiday._id))) continue;
      result.push({
        _id: `holiday-${userId}-${holiday._id}`,
        userId,
        date: `${holiday.date}T00:00:00.000Z`,
        status: "Holiday",
        attendanceType: "Holiday",
        attendanceSource: "Holiday",
        holidayId: holiday._id,
        holidayName: holiday.name,
        holidayType: holiday.type,
        isOptionalHoliday: Boolean(holiday.isOptional),
        checkIn: null,
        checkOut: null,
        remarks: holiday.name
      });
    }
  }
  return result;
}

export const getAttendanceHolidayOverlay = asyncHandler(async (req, res) => {
  await requireHR(req);
  const { fromDate, toDate } = req.query;
  const users = await User.find({ isActive: true }).select("_id").lean();
  const holidays = await buildAttendanceHolidayOverlay({
    userIds: users.map(user => user._id),
    fromDate,
    toDate
  });
  res.status(200).json(new ApiResponse(200, { holidays }, "Attendance holiday overlay fetched successfully"));
});
