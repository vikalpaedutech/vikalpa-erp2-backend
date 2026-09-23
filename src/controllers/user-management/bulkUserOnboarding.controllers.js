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

const isAdminUser = async (userId) => {
  const records = await UserRole.find({
    userId,
    isActive: true,
  })
    .populate({
      path: "roleId",
      select: "roleCode isActive",
    })
    .lean();

  return records.some(
    (record) =>
      record.roleId?.isActive &&
      String(record.roleId.roleCode || "")
        .trim()
        .toLowerCase() === "admin"
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
    const error = new Error(
      "Only Admin can perform bulk user onboarding."
    );
    error.statusCode = 403;
    throw error;
  }

  return userId;
};

const clean = (value) =>
  value === undefined || value === null
    ? ""
    : String(value).trim();

const normalizeCode = (value) =>
  clean(value).toUpperCase();

const parseBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "active"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "inactive"].includes(normalized)) {
    return false;
  }

  throw new Error(
    "isActive must be true/false at the supplied row."
  );
};

const parseIdList = (value) =>
  clean(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

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
    if (!mongoose.Types.ObjectId.isValid(normalizedId)) {
      throw new Error(
        `Invalid ${label} ID: ${normalizedId}`
      );
    }

    const document = await model
      .findOne({
        [idField]: normalizedId,
        ...extraFilter,
      })
      .session(session);

    if (!document) {
      throw new Error(
        `${label} not found: ${normalizedId}`
      );
    }

    return document;
  }

  if (normalizedCode) {
    const document = await model
      .findOne({
        [codeField]: {
          $regex: `^${normalizedCode.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}$`,
          $options: "i",
        },
        ...extraFilter,
      })
      .session(session);

    if (!document) {
      throw new Error(
        `${label} not found for code: ${normalizedCode}`
      );
    }

    return document;
  }

  throw new Error(`${label} is required.`);
};
const validateRegion = async ({
  scope,
  districtId,
  blockId,
  centerId,
  session,
  rowNumber,
}) => {
  const normalizedScope = clean(scope).toLowerCase();

  if (
    !["global", "district", "block", "center"].includes(
      normalizedScope
    )
  ) {
    throw new Error(
      `Invalid regionScope at row ${rowNumber}. Use global, district, block or center.`
    );
  }

  if (normalizedScope === "global") {
    return {
      scope: "global",
      districtId: null,
      blockId: null,
      centerId: null,
    };
  }

  if (normalizedScope === "district") {
    if (!districtId) {
      throw new Error(
        `districtId is required for district scope at row ${rowNumber}.`
      );
    }

    const district = await District.findById(
      districtId
    ).session(session);

    if (!district) {
      throw new Error(
        `District not found at row ${rowNumber}: ${districtId}`
      );
    }

    return {
      scope: "district",
      districtId: district._id,
      blockId: null,
      centerId: null,
    };
  }

  if (normalizedScope === "block") {
    if (!blockId) {
      throw new Error(
        `blockId is required for block scope at row ${rowNumber}.`
      );
    }

    const block = await Block.findById(
      blockId
    ).session(session);

    if (!block) {
      throw new Error(
        `Block not found at row ${rowNumber}: ${blockId}`
      );
    }

    if (
      districtId &&
      String(block.districtId) !== String(districtId)
    ) {
      throw new Error(
        `blockId does not belong to districtId at row ${rowNumber}.`
      );
    }

    return {
      scope: "block",
      districtId: block.districtId || null,
      blockId: block._id,
      centerId: null,
    };
  }

  if (!centerId) {
    throw new Error(
      `centerId is required for center scope at row ${rowNumber}.`
    );
  }

  const center = await Center.findById(
    centerId
  ).session(session);

  if (!center) {
    throw new Error(
      `Center not found at row ${rowNumber}: ${centerId}`
    );
  }

  if (
    blockId &&
    String(center.blockId) !== String(blockId)
  ) {
    throw new Error(
      `centerId does not belong to blockId at row ${rowNumber}.`
    );
  }

  if (
    districtId &&
    String(center.districtId) !== String(districtId)
  ) {
    throw new Error(
      `centerId does not belong to districtId at row ${rowNumber}.`
    );
  }

  return {
    scope: "center",
    districtId: center.districtId || null,
    blockId: center.blockId || null,
    centerId: center._id,
  };
};

export const downloadBulkUserOnboardingTemplate = async (
  req,
  res
) => {
  try {
    await requireAdmin(req);

    const [roles, departments, districts] =
      await Promise.all([
        Role.find({ isActive: true })
          .select("roleCode")
          .sort({ roleName: 1 })
          .limit(2)
          .lean(),

        Department.find({ isActive: true })
          .select("departmentCode _id")
          .sort({ departmentName: 1 })
          .limit(1)
          .lean(),

        District.find({})
          .select("_id")
          .sort({ districtName: 1 })
          .limit(1)
          .lean(),
      ]);

    const templateDepartment =
      departments[0] || null;

    const designations = templateDepartment
      ? await Designation.find({
          isActive: true,
          departmentId: templateDepartment._id,
        })
          .select("designationCode")
          .sort({ designation: 1 })
          .limit(2)
          .lean()
      : [];

    const now = Date.now();

    const defaultRoleOne =
      roles[0]?.roleCode || "CC";

    const defaultRoleTwo =
      roles[1]?.roleCode || defaultRoleOne;

    const defaultDesignationOne =
      designations[0]?.designationCode || "";

    const defaultDesignationTwo =
      designations[1]?.designationCode ||
      defaultDesignationOne;

    const defaultDepartmentCode =
      templateDepartment?.departmentCode || "";

    const defaultDistrictId =
      districts[0]?._id
        ? String(districts[0]._id)
        : "";

    const rows = [
      {
        userId: `bulk_test_${now}_01`,
        name: "Bulk Test User 1",
        email: `bulk.test.${now}.01@example.com`,
        contact: "9999990001",
        password: "Temp@12345",
        roleCode: normalizeCode(defaultRoleOne),
        departmentCode: normalizeCode(
          defaultDepartmentCode
        ),
        designationCode: normalizeCode(
          defaultDesignationOne
        ),
        regionScope: defaultDistrictId
          ? "district"
          : "global",
        districtId: defaultDistrictId,
        blockId: "",
        centerId: "",
        programIds: "",
        batchIds: "",
        isActive: "true",
      },
      {
        userId: `bulk_test_${now}_02`,
        name: "Bulk Test User 2",
        email: `bulk.test.${now}.02@example.com`,
        contact: "9999990002",
        password: "Temp@12345",
        roleCode: normalizeCode(defaultRoleTwo),
        departmentCode: normalizeCode(
          defaultDepartmentCode
        ),
        designationCode: normalizeCode(
          defaultDesignationTwo
        ),
        regionScope: defaultDistrictId
          ? "district"
          : "global",
        districtId: defaultDistrictId,
        blockId: "",
        centerId: "",
        programIds: "",
        batchIds: "",
        isActive: "true",
      },
    ];

    const workbook = XLSX.utils.book_new();

    const worksheet =
      XLSX.utils.json_to_sheet(rows);

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Users"
    );

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
      'attachment; filename="bulk-user-onboarding-template.xlsx"'
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error(
      "DOWNLOAD BULK USER TEMPLATE ERROR:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to download bulk user onboarding template.",
    });
  }
};

export const bulkOnboardUsers = async (
  req,
  res
) => {
  const session = await mongoose.startSession();

  try {
    const onboardedBy = await requireAdmin(req);

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message:
          "CSV or Excel file is required.",
      });
    }

    const workbook = XLSX.read(
      req.file.buffer,
      {
        type: "buffer",
      }
    );

    const sheetName =
      workbook.SheetNames[0];

    if (!sheetName) {
      return res.status(400).json({
        success: false,
        message:
          "Uploaded file contains no worksheet.",
      });
    }

    const rows =
      XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        {
          defval: "",
          raw: false,
        }
      );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message:
          "Uploaded file contains no user records.",
      });
    }

    if (rows.length > 500) {
      return res.status(400).json({
        success: false,
        message:
          "Maximum 500 users can be onboarded in one file.",
      });
    }

    await session.startTransaction();

    const userDocuments = [];
    const roleDocuments = [];
    const designationDocuments = [];
    const regionDocuments = [];
    const accessDocuments = [];

    const fileUserIds = new Set();
    const fileEmails = new Set();

    for (
      let index = 0;
      index < rows.length;
      index += 1
    ) {
      const row = rows[index];

      const rowNumber = index + 2;

      const userId = clean(row.userId);
      const name = clean(row.name);
      const email =
        clean(row.email).toLowerCase();
      const contact = clean(row.contact);
      const password = clean(row.password);

      if (
        !userId ||
        !name ||
        !email ||
        !password
      ) {
        throw new Error(
          `userId, name, email and password are required at row ${rowNumber}.`
        );
      }

      if (fileUserIds.has(userId)) {
        throw new Error(
          `Duplicate userId in uploaded file at row ${rowNumber}: ${userId}`
        );
      }

      if (fileEmails.has(email)) {
        throw new Error(
          `Duplicate email in uploaded file at row ${rowNumber}: ${email}`
        );
      }

      fileUserIds.add(userId);
      fileEmails.add(email);

      const existingUser =
        await User.findOne({
          $or: [
            { userId },
            { email },
          ],
        }).session(session);

      if (existingUser) {
        throw new Error(
          `User already exists at row ${rowNumber}: ${userId} / ${email}`
        );
      }

      /*
       * ============================
       * ROLE
       * ============================
       *
       * Excel:
       * cc / CC / Cc
       *
       * All are normalized to:
       * CC
       */
      const role = await resolveByIdOrCode({
  model: Role,
  id: clean(row.roleId),
  code: clean(row.roleCode),
  codeField: "roleCode",
  label: "Role",
  session,
  extraFilter: {
    isActive: true,
  },
});

      /*
       * ============================
       * DEPARTMENT
       * ============================
       */
      const department =
        await resolveByIdOrCode({
          model: Department,
          id: clean(row.departmentId),
          code: normalizeCode(
            row.departmentCode
          ),
          codeField: "departmentCode",
          label: "Department",
          session,
          extraFilter: {
            isActive: true,
          },
        });

      /*
       * ============================
       * DESIGNATION
       * ============================
       */
      const designation =
        await resolveByIdOrCode({
          model: Designation,
          id: clean(row.designationId),
          code: normalizeCode(
            row.designationCode
          ),
          codeField: "designationCode",
          label: "Designation",
          session,
          extraFilter: {
            isActive: true,
            departmentId:
              department._id,
          },
        });

      /*
       * ============================
       * ACTIVE STATUS
       * ============================
       */
      const isActive = parseBoolean(
        row.isActive,
        true
      );

      /*
       * ============================
       * REGION
       * ============================
       */
      const region =
        await validateRegion({
          scope: row.regionScope,
          districtId: clean(
            row.districtId
          ),
          blockId: clean(
            row.blockId
          ),
          centerId: clean(
            row.centerId
          ),
          session,
          rowNumber,
        });

      /*
       * ============================
       * USER
       * ============================
       */
      const user = await User.create(
        [
          {
            userId,
            name,
            email,
            contact:
              contact || undefined,
            password,
            isActive,
            isEmailVerified: true,
          },
        ],
        {
          session,
        }
      );

      const createdUser =
        user[0];

      userDocuments.push(
        createdUser
      );

      /*
       * ============================
       * USER ROLE
       * ============================
       */
      roleDocuments.push({
        userId:
          createdUser._id,
        roleId: role._id,
        isActive: true,
      });

      /*
       * ============================
       * USER DESIGNATION
       * ============================
       */
      designationDocuments.push({
        userId:
          createdUser._id,
        designationId:
          designation._id,
        isPrimary: true,
        isActive: true,
      });

      /*
       * ============================
       * USER REGION ACCESS
       * ============================
       */
      regionDocuments.push({
        userId:
          createdUser._id,
        scope:
          region.scope,
        districtId:
          region.districtId,
        blockId:
          region.blockId,
        centerId:
          region.centerId,
      });

      /*
       * ============================
       * PROGRAM / BATCH ACCESS
       * ============================
       */
      const programIds =
        parseIdList(
          row.programIds
        );

      const batchIds =
        parseIdList(
          row.batchIds
        );

      for (const id of [
        ...programIds,
        ...batchIds,
      ]) {
        if (
          !mongoose.Types.ObjectId.isValid(
            id
          )
        ) {
          throw new Error(
            `Invalid programIds/batchIds value at row ${rowNumber}: ${id}`
          );
        }
      }

      /*
       * Validate programs
       */
      if (programIds.length) {
        const programs =
          await Program.find({
            _id: {
              $in: programIds,
            },
          })
            .select("_id")
            .session(session);

        if (
          programs.length !==
          programIds.length
        ) {
          throw new Error(
            `One or more programIds are invalid at row ${rowNumber}.`
          );
        }
      }

      /*
       * Validate batches
       */
      if (batchIds.length) {
        const batches =
          await Batch.find({
            _id: {
              $in: batchIds,
            },
          })
            .select("_id")
            .session(session);

        if (
          batches.length !==
          batchIds.length
        ) {
          throw new Error(
            `One or more batchIds are invalid at row ${rowNumber}.`
          );
        }
      }

      /*
       * Save UserAccess only when
       * program/batch access is supplied.
       */
      if (
        programIds.length ||
        batchIds.length
      ) {
        accessDocuments.push({
          userId:
            createdUser._id,
          programIds,
          batchIds,
        });
      }
    }

    /*
     * ============================
     * INSERT RELATED DOCUMENTS
     * ============================
     */
    await UserRole.insertMany(
      roleDocuments,
      {
        session,
      }
    );

    await UserDesignation.insertMany(
      designationDocuments,
      {
        session,
      }
    );

    await UserRegionAccess.insertMany(
      regionDocuments,
      {
        session,
      }
    );

    if (accessDocuments.length) {
      await UserAccess.insertMany(
        accessDocuments,
        {
          session,
        }
      );
    }

    /*
     * ============================
     * COMMIT TRANSACTION
     * ============================
     */
    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message:
        "Bulk users onboarded successfully.",
      data: {
        totalRecords:
          rows.length,
        usersCreated:
          userDocuments.length,
        rolesAssigned:
          roleDocuments.length,
        designationsAssigned:
          designationDocuments.length,
        regionAccessAssigned:
          regionDocuments.length,
        programBatchAccessAssigned:
          accessDocuments.length,
        onboardedBy,
      },
    });
  } catch (error) {
    if (
      session.inTransaction()
    ) {
      await session.abortTransaction();
    }

    console.error(
      "BULK USER ONBOARDING ERROR:",
      error
    );

    return res.status(
      error.statusCode || 400
    ).json({
      success: false,
      message:
        error.message ||
        "Failed to bulk onboard users.",
    });
  } finally {
    await session.endSession();
  }
};