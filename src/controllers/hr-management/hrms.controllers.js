import mongoose from "mongoose";
import { HRRecord, HR_MODULES } from "../../models/hr-management/hrRecord.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { ApiResponse } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

const SELF_SERVICE_MODULES = new Set(["expense", "helpdesk", "goal", "timesheet", "travel", "tax-declaration", "survey", "recognition"]);
const PUBLIC_READ_MODULES = new Set(["announcement", "policy", "training"]);
const ADMIN_ONLY_MODULES = new Set(["employee", "onboarding", "offboarding", "recruitment", "payroll", "asset", "loan", "benefit", "workflow", "compensation", "gratuity", "background-check", "disciplinary"]);

async function isAdmin(userId, user) {
  if (user?.isAdmin === true) return true;
  const rows = await UserRole.find({ userId, isActive: true }).populate("roleId", "roleCode roleName").lean();
  return rows.some(({ roleId }) => [roleId?.roleCode, roleId?.roleName].filter(Boolean).some((v) => ["admin", "administrator"].includes(String(v).toLowerCase())));
}
function validModule(module) {
  if (!HR_MODULES.includes(module)) throw new ApiError(400, `Unsupported HR module. Allowed modules: ${HR_MODULES.join(", ")}`);
}
function cleanPayload(body = {}) {
  const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : {};
  return {
    title: String(body.title || "").trim(), description: String(body.description || "").trim(),
    status: String(body.status || "Open").trim(), priority: ["Low", "Normal", "High", "Urgent"].includes(body.priority) ? body.priority : "Normal",
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    amount: body.amount === "" || body.amount == null ? null : Number(body.amount),
    employeeId: body.employeeId && mongoose.isValidObjectId(body.employeeId) ? body.employeeId : null, fields
  };
}

export const getHRMSMetadata = asyncHandler(async (req, res) => {
  const admin = await isAdmin(req.user._id, req.user);
  const modules = HR_MODULES.map((key) => ({ key, label: key.split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(" "), access: ADMIN_ONLY_MODULES.has(key) ? "admin" : SELF_SERVICE_MODULES.has(key) ? "self-service" : "managed" }));
  const match = admin ? { isArchived: false } : { isArchived: false, $or: [{ ownerId: new mongoose.Types.ObjectId(req.user._id) }, { employeeId: new mongoose.Types.ObjectId(req.user._id) }, { module: { $in: [...PUBLIC_READ_MODULES] } }] };
  const counts = await HRRecord.aggregate([
    { $match: match },
    { $group: { _id: "$module", count: { $sum: 1 }, pending: { $sum: { $cond: [{ $in: ["$status", ["Open", "Pending", "In Progress", "Submitted"]] }, 1, 0] } } } }
  ]);
  res.status(200).json(new ApiResponse(200, { modules, counts, isAdmin: admin }, "HRMS metadata fetched successfully"));
});

export const listHRRecords = asyncHandler(async (req, res) => {
  const module = String(req.query.module || ""); if (module) validModule(module);
  const admin = await isAdmin(req.user._id, req.user);
  if (module && ADMIN_ONLY_MODULES.has(module) && !admin) throw new ApiError(403, "Admin access required for this HR module");
  const filter = { isArchived: false }; if (module) filter.module = module;
  if (!admin) filter.$or = [{ ownerId: req.user._id }, { employeeId: req.user._id }, { module: { $in: [...PUBLIC_READ_MODULES] } }];
  if (req.query.status) filter.status = String(req.query.status);
  const search = String(req.query.search || "").trim().slice(0, 100);
  if (search) { const searchClause = { title: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }; if (filter.$or) filter.$and = [{ $or: filter.$or }, searchClause], delete filter.$or; else filter.$or = [searchClause]; }
  const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || "50", 10)));
  const [records, total] = await Promise.all([HRRecord.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).populate("ownerId", "name email userId").populate("employeeId", "name email userId").lean(), HRRecord.countDocuments(filter)]);
  res.status(200).json(new ApiResponse(200, { records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }, "HR records fetched successfully"));
});

export const createHRRecord = asyncHandler(async (req, res) => {
  const module = String(req.body.module || ""); validModule(module);
  const admin = await isAdmin(req.user._id, req.user);
  if (ADMIN_ONLY_MODULES.has(module) && !admin) throw new ApiError(403, "Admin access required for this HR module");
  if (!admin && !SELF_SERVICE_MODULES.has(module)) throw new ApiError(403, "You cannot create records in this HR module");
  const payload = cleanPayload(req.body); if (!payload.title) throw new ApiError(400, "Title is required");
  if (!admin && payload.employeeId && String(payload.employeeId) !== String(req.user._id)) throw new ApiError(403, "You can only submit records for yourself");
  if (payload.amount !== null && (!Number.isFinite(payload.amount) || payload.amount < 0)) throw new ApiError(400, "Amount must be a valid non-negative number");
  if (payload.dueDate && Number.isNaN(payload.dueDate.getTime())) throw new ApiError(400, "Due date is invalid");
  const record = await HRRecord.create({ ...payload, module, ownerId: req.user._id, employeeId: payload.employeeId || req.user._id, createdBy: req.user._id, updatedBy: req.user._id, history: [{ action: "Created", by: req.user._id, details: `Created ${module} record` }] });
  res.status(201).json(new ApiResponse(201, record, "HR record created successfully"));
});

export const updateHRRecord = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid record ID");
  const record = await HRRecord.findById(req.params.id); if (!record || record.isArchived) throw new ApiError(404, "HR record not found");
  const admin = await isAdmin(req.user._id, req.user); const isOwner = String(record.ownerId) === String(req.user._id) || String(record.employeeId || "") === String(req.user._id);
  if (ADMIN_ONLY_MODULES.has(record.module) && !admin) throw new ApiError(403, "Admin access required");
  if (!admin && !isOwner) throw new ApiError(403, "You can only update your own HR records");
  if (!admin && !SELF_SERVICE_MODULES.has(record.module)) throw new ApiError(403, "You cannot update this HR record");
  const before = record.status;
  if (!admin && req.body.status !== undefined && !["Submitted", "Cancelled"].includes(String(req.body.status))) throw new ApiError(403, "Only HR administrators can approve, reject or otherwise change workflow status");
  const payload = cleanPayload({ ...record.toObject(), ...req.body, fields: req.body.fields ? { ...record.fields, ...req.body.fields } : record.fields });
  if (payload.title) record.title = payload.title;
  if (req.body.description !== undefined) record.description = payload.description;
  if (req.body.status !== undefined) record.status = payload.status;
  if (req.body.priority !== undefined) record.priority = payload.priority;
  if (req.body.dueDate !== undefined) record.dueDate = payload.dueDate;
  if (req.body.amount !== undefined) record.amount = payload.amount;
  if (req.body.employeeId !== undefined && admin) record.employeeId = payload.employeeId;
  if (req.body.fields && typeof req.body.fields === "object" && !Array.isArray(req.body.fields)) record.fields = { ...record.fields, ...req.body.fields };
  record.updatedBy = req.user._id; record.history.push({ action: before !== record.status ? "Status changed" : "Updated", by: req.user._id, details: before !== record.status ? `${before} → ${record.status}` : "Record details updated" });
  await record.save();

  // Automation: when a recruitment record reaches an accepted/hired stage,
  // create one onboarding workspace record and link it back to the recruitment item.
  if (record.module === "recruitment" && before !== record.status &&
      ["hired", "offer accepted", "offer-accepted"].includes(String(record.status).toLowerCase())) {
    const linkedId = String(record._id);
    const alreadyCreated = await HRRecord.findOne({
      module: "onboarding", isArchived: false, "fields.recruitmentRecordId": linkedId
    }).select("_id").lean();
    if (!alreadyCreated) {
      const fields = record.fields && typeof record.fields === "object" ? record.fields : {};
      await HRRecord.create({
        module: "onboarding",
        title: `Onboarding — ${fields.candidateName || record.title}`,
        description: "Automatically created after recruitment reached an accepted/hired status. Complete joining checklist and verify required documents.",
        status: "Open", priority: "Normal",
        employeeId: record.employeeId || null,
        ownerId: req.user._id, createdBy: req.user._id, updatedBy: req.user._id,
        dueDate: fields.joiningDate ? new Date(fields.joiningDate) : null,
        fields: {
          employeeEmail: fields.candidateEmail || fields.employeeEmail || "",
          joiningDate: fields.joiningDate || "",
          department: fields.department || "",
          checklist: ["Collect joining documents", "Complete HR induction", "Assign equipment", "Confirm system access"],
          recruitmentRecordId: linkedId,
          automationSource: "recruitment-stage"
        },
        history: [{ action: "Automatically created", by: req.user._id, details: `Created from recruitment record ${linkedId}` }]
      });
    }
  }
  res.status(200).json(new ApiResponse(200, record, "HR record updated successfully"));
});

export const addHRRecordComment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid record ID");
  const message = String(req.body.message || "").trim(); if (!message) throw new ApiError(400, "Comment is required");
  const record = await HRRecord.findById(req.params.id); if (!record || record.isArchived) throw new ApiError(404, "HR record not found");
  const admin = await isAdmin(req.user._id, req.user);
  if (!admin && String(record.ownerId) !== String(req.user._id) && String(record.employeeId || "") !== String(req.user._id) && !PUBLIC_READ_MODULES.has(record.module)) throw new ApiError(403, "You cannot comment on this record");
  record.comments.push({ userId: req.user._id, message }); record.history.push({ action: "Comment added", by: req.user._id, details: message.slice(0, 200) }); record.updatedBy = req.user._id;
  await record.save(); res.status(201).json(new ApiResponse(201, record, "Comment added successfully"));
});

export const archiveHRRecord = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid record ID");
  if (!(await isAdmin(req.user._id, req.user))) throw new ApiError(403, "Admin access required to archive HR records");
  const record = await HRRecord.findById(req.params.id); if (!record) throw new ApiError(404, "HR record not found");
  record.isArchived = true; record.updatedBy = req.user._id; record.history.push({ action: "Archived", by: req.user._id, details: "Record archived" }); await record.save();
  res.status(200).json(new ApiResponse(200, { id: record._id, archived: true }, "HR record archived successfully"));
});
