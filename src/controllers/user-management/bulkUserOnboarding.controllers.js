import mongoose from "mongoose";
import XLSX from "xlsx";

import { User } from "../../models/user.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { UserDesignation } from "../../models/user-management/userDesignation.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";
import { UserAccess } from "../../models/user-management/userAccess.models.js";

import { Role } from "../../models/permissions-management/role.models.js";
import { Department } from "../../models/program-management/department.models.js";
import { Designation } from "../../models/program-management/designation.models.js";
import { District } from "../../models/region-management/district.models.js";
import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";
import { Program } from "../../models/program-management/prgroam.models.js";
import { Batch } from "../../models/program-management/batch.models.js";

const SCOPES = ["global", "district", "block", "center"];

const clean = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const normalizeCode = (value) => clean(value).toUpperCase();

const parseBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === "") return defaultValue;

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "active"].includes(normalized)) return true;
  if (["false", "0", "no", "inactive"].includes(normalized)) return false;

  throw new Error("isActive must be true/false at the supplied row.");
};

const parseIdList = (value) =>
  [...new Set(
    clean(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const ensureObjectIds = (ids, label, rowNumber) => {
  for (const id of ids) {
    if (!isValidObjectId(id)) {
      throw new Error(`Invalid ${label} at row ${rowNumber}: ${id}`);
    }
  }
};

const isAdminUser = async (userId) => {
  const records = await UserRole.find({ userId, isActive: true })
    .populate({ path: "roleId", select: "roleCode isActive" })
    .lean();

  return records.some(
    (record) =>
      record.roleId?.isActive &&
      String(record.roleId.roleCode || "").trim().toLowerCase() === "admin"
  );
};

const requireAdmin = async (req) => {
  const userId = req.user?._id;

  if (!userId) {
    const error = new Error("Unauthorized user.");
    error.statusCode = 401;
    throw error;
  }

  if (!(await isAdminUser(userId))) {
    const error = new Error("Only Admin can perform bulk user onboarding.");
    error.statusCode = 403;
    throw error;
  }

  return userId;
};

const resolveByIdOrCode = async ({
  model,
  id,
  code,
  idField = "_id",
  codeField,
  label,
  session,
  extraFilter = {},
}) => {
  const normalizedId = clean(id);
  const normalizedCode = clean(code);

  if (normalizedId) {
    if (!isValidObjectId(normalizedId)) {
      throw new Error(`Invalid ${label} ID: ${normalizedId}`);
    }

    const document = await model
      .findOne({ [idField]: normalizedId, ...extraFilter })
      .session(session);

    if (!document) throw new Error(`${label} not found: ${normalizedId}`);
    return document;
  }

  if (normalizedCode) {
    const escaped = normalizedCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const document = await model
      .findOne({
        [codeField]: { $regex: `^${escaped}$`, $options: "i" },
        ...extraFilter,
      })
      .session(session);

    if (!document) throw new Error(`${label} not found for code: ${normalizedCode}`);
    return document;
  }

  throw new Error(`${label} is required.`);
};

const validateRegionAccess = async ({ scope, row, session, rowNumber }) => {
  const normalizedScope = clean(scope).toLowerCase();

  if (!SCOPES.includes(normalizedScope)) {
    throw new Error(
      `Invalid regionScope at row ${rowNumber}. Use global, district, block or center.`
    );
  }

  if (normalizedScope === "global") {
    return [
      {
        scope: "global",
        districtId: null,
        blockId: null,
        centerId: null,
      },
    ];
  }

  if (normalizedScope === "district") {
    const districtIds = parseIdList(row.districtId);
    if (!districtIds.length) {
      throw new Error(`districtId is required for district scope at row ${rowNumber}.`);
    }

    ensureObjectIds(districtIds, "districtId", rowNumber);

    const districts = await District.find({ _id: { $in: districtIds } })
      .select("_id")
      .session(session)
      .lean();

    if (districts.length !== districtIds.length) {
      const found = new Set(districts.map((item) => String(item._id)));
      const missing = districtIds.filter((id) => !found.has(String(id)));
      throw new Error(`District not found at row ${rowNumber}: ${missing.join(", ")}`);
    }

    return districtIds.map((districtId) => ({
      scope: "district",
      districtId: new mongoose.Types.ObjectId(districtId),
      blockId: null,
      centerId: null,
    }));
  }

  if (normalizedScope === "block") {
    const blockIds = parseIdList(row.blockId);
    if (!blockIds.length) {
      throw new Error(`blockId is required for block scope at row ${rowNumber}.`);
    }

    ensureObjectIds(blockIds, "blockId", rowNumber);

    const blocks = await Block.find({ _id: { $in: blockIds } })
      .select("_id districtId")
      .session(session)
      .lean();

    if (blocks.length !== blockIds.length) {
      const found = new Set(blocks.map((item) => String(item._id)));
      const missing = blockIds.filter((id) => !found.has(String(id)));
      throw new Error(`Block not found at row ${rowNumber}: ${missing.join(", ")}`);
    }

    return blocks.map((block) => ({
      scope: "block",
      districtId: block.districtId || null,
      blockId: block._id,
      centerId: null,
    }));
  }

  const centerIds = parseIdList(row.centerId);
  if (!centerIds.length) {
    throw new Error(`centerId is required for center scope at row ${rowNumber}.`);
  }

  ensureObjectIds(centerIds, "centerId", rowNumber);

  const centers = await Center.find({ _id: { $in: centerIds } })
    .select("_id districtId blockId")
    .session(session)
    .lean();

  if (centers.length !== centerIds.length) {
    const found = new Set(centers.map((item) => String(item._id)));
    const missing = centerIds.filter((id) => !found.has(String(id)));
    throw new Error(`Center not found at row ${rowNumber}: ${missing.join(", ")}`);
  }

  return centers.map((center) => ({
    scope: "center",
    districtId: center.districtId || null,
    blockId: center.blockId || null,
    centerId: center._id,
  }));
};

const validateProgramBatchAccess = async ({ row, session, rowNumber }) => {
  const programIds = parseIdList(row.programIds);
  const batchIds = parseIdList(row.batchIds);

  ensureObjectIds(programIds, "programIds", rowNumber);
  ensureObjectIds(batchIds, "batchIds", rowNumber);

  if (programIds.length) {
    const programs = await Program.find({ _id: { $in: programIds } })
      .select("_id")
      .session(session)
      .lean();

    if (programs.length !== programIds.length) {
      const found = new Set(programs.map((item) => String(item._id)));
      const missing = programIds.filter((id) => !found.has(String(id)));
      throw new Error(`One or more programIds are invalid at row ${rowNumber}: ${missing.join(", ")}`);
    }
  }

  if (batchIds.length) {
    const batches = await Batch.find({ _id: { $in: batchIds } })
      .select("_id programId")
      .session(session)
      .lean();

    if (batches.length !== batchIds.length) {
      const found = new Set(batches.map((item) => String(item._id)));
      const missing = batchIds.filter((id) => !found.has(String(id)));
      throw new Error(`One or more batchIds are invalid at row ${rowNumber}: ${missing.join(", ")}`);
    }
  }

  return { programIds, batchIds };
};

const makeTemplateColumns = (regionScope) => {
  const base = [
    "userId",
    "name",
    "email",
    "contact",
    "password",
    "roleCode",
    "designationCode",
    "regionScope",
  ];

  if (regionScope === "district") base.push("districtId");
  if (regionScope === "block") base.push("blockId");
  if (regionScope === "center") base.push("centerId");

  base.push("programIds", "batchIds", "isActive");
  return base;
};

const makeTemplateRows = ({ roleCode, designationCode, regionScope, userCount }) => {
  const columns = makeTemplateColumns(regionScope);
  const rows = [];

  for (let index = 0; index < userCount; index += 1) {
    const row = {};
    for (const column of columns) row[column] = "";

    row.userId = `USER_${String(index + 1).padStart(3, "0")}`;
    row.name = "";
    row.email = "";
    row.contact = "";
    row.password = "";
    row.roleCode = normalizeCode(roleCode);
    row.designationCode = normalizeCode(designationCode);
    row.regionScope = regionScope;
    row.programIds = "";
    row.batchIds = "";
    row.isActive = "true";

    rows.push(row);
  }

  return { columns, rows };
};

const normalizeUserCount = (value) => {
  const userCount = Number(value);
  if (!Number.isInteger(userCount) || userCount < 1 || userCount > 500) {
    const error = new Error("userCount must be an integer between 1 and 500.");
    error.statusCode = 400;
    throw error;
  }
  return userCount;
};

const validateTemplateQuery = ({ roleCode, designationCode, regionScope, userCount }) => {
  const normalizedRole = normalizeCode(roleCode);
  const normalizedDesignation = normalizeCode(designationCode);
  const normalizedScope = clean(regionScope).toLowerCase();

  if (!normalizedRole) {
    const error = new Error("roleCode is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!normalizedDesignation) {
    const error = new Error("designationCode is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!SCOPES.includes(normalizedScope)) {
    const error = new Error("regionScope must be global, district, block or center.");
    error.statusCode = 400;
    throw error;
  }

  return {
    roleCode: normalizedRole,
    designationCode: normalizedDesignation,
    regionScope: normalizedScope,
    userCount: normalizeUserCount(userCount),
  };
};

export const downloadBulkUserOnboardingTemplate = async (req, res) => {
  try {
    await requireAdmin(req);

    const query = validateTemplateQuery(req.query);

    // Be tolerant of legacy/imported databases where roleCode casing may differ.
    const escapedRoleCode = query.roleCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const role = await Role.findOne({
      roleCode: { $regex: `^${escapedRoleCode}$`, $options: "i" },
      isActive: true,
    }).lean();

    if (!role) {
      const error = new Error(`Active role not found: ${query.roleCode}`);
      error.statusCode = 404;
      throw error;
    }

    const escapedDesignationCode = query.designationCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const designation = await Designation.findOne({
      designationCode: { $regex: `^${escapedDesignationCode}$`, $options: "i" },
      isActive: true,
    }).lean();

    if (!designation) {
      const error = new Error(`Active designation not found: ${query.designationCode}`);
      error.statusCode = 404;
      throw error;
    }

    const department = await Department.findById(designation.departmentId)
      .select("_id departmentCode departmentName")
      .lean();

    if (!department) {
      const error = new Error(`Department not found for designation: ${query.designationCode}`);
      error.statusCode = 404;
      throw error;
    }

    const { columns, rows } = makeTemplateRows(query);
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
    worksheet["!cols"] = columns.map((column) => ({ wch: Math.max(16, column.length + 3) }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

    const instructions = [
      ["Selected Role", role.roleCode],
      ["Selected Designation", designation.designationCode],
      ["Designation Name", designation.designation],
      ["Department Code", department.departmentCode],
      ["Department Name", department.departmentName],
      ["Region Scope", query.regionScope],
      ["User Count", query.userCount],
      ["Multiple IDs", "Use comma-separated MongoDB ObjectIds in the applicable region column."],
      ["District Scope", "Fill districtId only."],
      ["Block Scope", "Fill blockId only. District is derived automatically from each block."],
      ["Center Scope", "Fill centerId only. District and block are derived automatically from each center."],
      ["Global Scope", "No region ID column is required."],
      ["Department", "Do not enter departmentCode in the template. It is derived from designationCode."],
      ["Designation", "Every bulk-onboarded designation is assigned as the primary designation."],
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Instruction", "Value"], ...instructions]),
      "Instructions"
    );

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bulk-user-onboarding-${query.regionScope}-${query.userCount}.xlsx"`
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("DOWNLOAD BULK USER TEMPLATE ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to download bulk user onboarding template.",
    });
  }
};

export const downloadBulkUserOnboardingRequirements = async (req, res) => {
  try {
    await requireAdmin(req);

    const [centers, departments, designations, programs, batches] =
      await Promise.all([
        // Region sheet is intentionally CENTER-based.
        // Only available centers are listed, and district/block are derived
        // from the center's own districtId/blockId relationships.
        Center.aggregate([
          {
            $match: {
              isCenterAvailable: true,
            },
          },
          {
            $lookup: {
              from: "districts",
              localField: "districtId",
              foreignField: "_id",
              as: "district",
            },
          },
          {
            $lookup: {
              from: "blocks",
              localField: "blockId",
              foreignField: "_id",
              as: "block",
            },
          },
          {
            $unwind: {
              path: "$district",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $unwind: {
              path: "$block",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 1,
              centerCode: 1,
              centerName: 1,
              districtId: 1,
              blockId: 1,
              districtName: "$district.districtName",
              blockName: "$block.blockName",
            },
          },
          {
            $sort: {
              districtName: 1,
              blockName: 1,
              centerName: 1,
            },
          },
        ]),
        Department.find({})
          .select("_id departmentName departmentCode isActive")
          .sort({ departmentName: 1 })
          .lean(),
        Designation.find({})
          .select("_id designation departmentId designationCode isActive")
          .populate("departmentId", "departmentName departmentCode")
          .sort({ designation: 1 })
          .lean(),
        Program.find({})
          .select("_id programName programCode description isActive")
          .sort({ programName: 1 })
          .lean(),
        Batch.find({})
          .select("_id batchName startYear endYear isActive programId")
          .populate("programId", "programName programCode")
          .sort({ batchName: 1 })
          .lean(),
      ]);

    const workbook = XLSX.utils.book_new();

    // -------------------------------------------------------------
    // 1. SCOPE
    // -------------------------------------------------------------
    const scopeRows = [
      ["scope", "What it means", "Template region column", "Multiple IDs"],
      ["global", "User has global region access.", "None", "Not applicable"],
      [
        "district",
        "Access to one or more districts.",
        "districtId",
        "Comma-separated ObjectIds allowed",
      ],
      [
        "block",
        "Access to one or more blocks. District is derived from each block.",
        "blockId",
        "Comma-separated ObjectIds allowed",
      ],
      [
        "center",
        "Access to one or more available centers. District and block are derived from each center.",
        "centerId",
        "Comma-separated ObjectIds allowed",
      ],
    ];

    const scopeSheet = XLSX.utils.aoa_to_sheet(scopeRows);
    scopeSheet["!cols"] = [
      { wch: 16 },
      { wch: 72 },
      { wch: 24 },
      { wch: 32 },
    ];
    XLSX.utils.book_append_sheet(workbook, scopeSheet, "Scope");

    // -------------------------------------------------------------
    // 2. REGION
    // -------------------------------------------------------------
    // IMPORTANT:
    // One row = one AVAILABLE CENTER.
    // We do NOT create separate district/block rows here because the
    // onboarding template asks for center IDs and derives parent region
    // information from the selected center.
    const regionRows = [
      [
        "districtId",
        "blockId",
        "centerId",
        "districtName",
        "blockName",
        "centerCode",
        "centerName",
      ],
    ];

    for (const center of centers) {
      regionRows.push([
        center.districtId ? String(center.districtId) : "",
        center.blockId ? String(center.blockId) : "",
        center._id ? String(center._id) : "",
        center.districtName || "",
        center.blockName || "",
        center.centerCode || "",
        center.centerName || "",
      ]);
    }

    const regionSheet = XLSX.utils.aoa_to_sheet(regionRows);
    regionSheet["!cols"] = [
      { wch: 28 },
      { wch: 28 },
      { wch: 28 },
      { wch: 24 },
      { wch: 28 },
      { wch: 16 },
      { wch: 42 },
    ];
    XLSX.utils.book_append_sheet(workbook, regionSheet, "Region");

    // -------------------------------------------------------------
    // 3. DEPARTMENT / DESIGNATION
    // -------------------------------------------------------------
    const departmentRows = [
      [
        "departmentId",
        "departmentName",
        "departmentCode",
        "departmentActive",
        "designationId",
        "designation",
        "designationCode",
        "designationActive",
      ],
    ];

    const departmentsWithDesignation = new Set();

    for (const designation of designations) {
      const department = designation.departmentId;

      if (department?._id) {
        departmentsWithDesignation.add(String(department._id));
      }

      departmentRows.push([
        department?._id ? String(department._id) : "",
        department?.departmentName || "",
        department?.departmentCode || "",
        department?.isActive ?? "",
        String(designation._id),
        designation.designation || "",
        designation.designationCode || "",
        designation.isActive ?? "",
      ]);
    }

    for (const department of departments) {
      if (!departmentsWithDesignation.has(String(department._id))) {
        departmentRows.push([
          String(department._id),
          department.departmentName || "",
          department.departmentCode || "",
          department.isActive ?? "",
          "",
          "",
          "",
          "",
        ]);
      }
    }

    const departmentSheet = XLSX.utils.aoa_to_sheet(departmentRows);
    departmentSheet["!cols"] = [
      { wch: 28 },
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 28 },
      { wch: 30 },
      { wch: 22 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, departmentSheet, "Department");

    // -------------------------------------------------------------
    // 4. BATCHES
    // -------------------------------------------------------------
    const batchRows = [
      [
        "programId",
        "programName",
        "programCode",
        "programDescription",
        "programActive",
        "batchId",
        "batchName",
        "startYear",
        "endYear",
        "batchActive",
      ],
    ];

    const programsWithBatches = new Set();

    for (const batch of batches) {
      const program = batch.programId;

      if (program?._id) {
        programsWithBatches.add(String(program._id));
      }

      batchRows.push([
        program?._id ? String(program._id) : "",
        program?.programName || "",
        program?.programCode || "",
        program?.description || "",
        program?.isActive ?? "",
        String(batch._id),
        batch.batchName || "",
        batch.startYear ?? "",
        batch.endYear ?? "",
        batch.isActive ?? "",
      ]);
    }

    for (const program of programs) {
      if (!programsWithBatches.has(String(program._id))) {
        batchRows.push([
          String(program._id),
          program.programName || "",
          program.programCode || "",
          program.description || "",
          program.isActive ?? "",
          "",
          "",
          "",
          "",
          "",
        ]);
      }
    }

    const batchSheet = XLSX.utils.aoa_to_sheet(batchRows);
    batchSheet["!cols"] = [
      { wch: 28 },
      { wch: 30 },
      { wch: 20 },
      { wch: 45 },
      { wch: 18 },
      { wch: 28 },
      { wch: 28 },
      { wch: 12 },
      { wch: 12 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(workbook, batchSheet, "Batches");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="bulk-user-onboarding-requirements.xlsx"'
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("DOWNLOAD BULK USER REQUIREMENTS ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message || "Failed to download bulk user onboarding requirements.",
    });
  }
};

export const bulkOnboardUsers = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const onboardedBy = await requireAdmin(req);

    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "CSV or Excel file is required." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return res.status(400).json({ success: false, message: "Uploaded file contains no worksheet." });
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
      raw: false,
    });

    if (!rows.length) {
      return res.status(400).json({ success: false, message: "Uploaded file contains no user records." });
    }

    if (rows.length > 500) {
      return res.status(400).json({ success: false, message: "Maximum 500 users can be onboarded in one file." });
    }

    await session.startTransaction();

    const userDocuments = [];
    const roleDocuments = [];
    const designationDocuments = [];
    const regionDocuments = [];
    const accessDocuments = [];
    const fileUserIds = new Set();
    const fileEmails = new Set();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;

      const userId = clean(row.userId);
      const name = clean(row.name);
      const email = clean(row.email).toLowerCase();
      const contact = clean(row.contact);
      const password = clean(row.password);

      if (!userId || !name || !email || !password) {
        throw new Error(`userId, name, email and password are required at row ${rowNumber}.`);
      }

      if (fileUserIds.has(userId)) throw new Error(`Duplicate userId in uploaded file at row ${rowNumber}: ${userId}`);
      if (fileEmails.has(email)) throw new Error(`Duplicate email in uploaded file at row ${rowNumber}: ${email}`);
      fileUserIds.add(userId);
      fileEmails.add(email);

      const existingUser = await User.findOne({ $or: [{ userId }, { email }] }).session(session);
      if (existingUser) throw new Error(`User already exists at row ${rowNumber}: ${userId} / ${email}`);

      const role = await resolveByIdOrCode({
        model: Role,
        id: clean(row.roleId),
        code: clean(row.roleCode),
        codeField: "roleCode",
        label: "Role",
        session,
        extraFilter: { isActive: true },
      });

      // Department is intentionally NOT required in the template.
      // It is derived from the selected designation.
      const designation = await resolveByIdOrCode({
        model: Designation,
        id: clean(row.designationId),
        code: normalizeCode(row.designationCode),
        codeField: "designationCode",
        label: "Designation",
        session,
        extraFilter: { isActive: true },
      });

      const department = await Department.findOne({
        _id: designation.departmentId,
        isActive: true,
      }).session(session);

      if (!department) {
        throw new Error(`Department for designation ${designation.designationCode} is inactive or missing at row ${rowNumber}.`);
      }

      const isActive = parseBoolean(row.isActive, true);
      const regionAccess = await validateRegionAccess({
        scope: row.regionScope,
        row,
        session,
        rowNumber,
      });

      const { programIds, batchIds } = await validateProgramBatchAccess({ row, session, rowNumber });

      const createdUsers = await User.create([
        {
          userId,
          name,
          email,
          contact: contact || undefined,
          password,
          isActive,
          isEmailVerified: true,
        },
      ], { session });

      const createdUser = createdUsers[0];
      userDocuments.push(createdUser);

      roleDocuments.push({ userId: createdUser._id, roleId: role._id, isActive: true });
      designationDocuments.push({
        userId: createdUser._id,
        designationId: designation._id,
        isPrimary: true,
        isActive: true,
      });

      for (const access of regionAccess) {
        regionDocuments.push({ userId: createdUser._id, ...access });
      }

      if (programIds.length || batchIds.length) {
        accessDocuments.push({ userId: createdUser._id, programIds, batchIds });
      }
    }

    await UserRole.insertMany(roleDocuments, { session });
    await UserDesignation.insertMany(designationDocuments, { session });
    await UserRegionAccess.insertMany(regionDocuments, { session });
    if (accessDocuments.length) await UserAccess.insertMany(accessDocuments, { session });

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: "Bulk users onboarded successfully.",
      data: {
        totalRecords: rows.length,
        usersCreated: userDocuments.length,
        rolesAssigned: roleDocuments.length,
        designationsAssigned: designationDocuments.length,
        regionAccessAssigned: regionDocuments.length,
        programBatchAccessAssigned: accessDocuments.length,
        onboardedBy,
      },
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();

    console.error("BULK USER ONBOARDING ERROR:", error);
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to bulk onboard users.",
    });
  } finally {
    await session.endSession();
  }
};
