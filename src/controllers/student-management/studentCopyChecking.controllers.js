import mongoose from "mongoose";

import { StudentCopyChecking } from "../../models/student-management/studentCopyChecking.models.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";
import { Student } from "../../models/student-management/student.models.js";
import { UserAccess } from "../../models/user-management/userAccess.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";

// ============================================================
// CONSTANTS
// ============================================================

const WORK_TYPES = ["Class Work", "Home Work"];

const COPY_STATUSES = [
  "Complete",
  "Incomplete",
  "Not-brought",
];


// ============================================================
// HELPER FUNCTIONS
// ============================================================

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};


const getUserId = (req) => {
  return req.user?._id || req.user?.id;
};


const isAdminUser = (req) => {
  return (
    req.user?.isAdmin === true ||
    req.user?.roleCode === "admin" ||
    req.user?.roles?.some(
      (role) => role.roleCode === "admin"
    )
  );
};


// ============================================================
// NORMALIZE CHECK DATE
// ============================================================

const normalizeCheckDate = (checkDate) => {
  const parsedDate = new Date(checkDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  parsedDate.setHours(0, 0, 0, 0);

  return parsedDate;
};


// ============================================================
// CHECK PROGRAM + BATCH ACCESS
// ============================================================

const checkProgramBatchAccess = async ({
  userId,
  programId,
  batchId,
}) => {
  const userAccess = await UserAccess.findOne({
    userId,
  }).lean();

  if (!userAccess) {
    return false;
  }

  const programAllowed = (
    userAccess.programIds || []
  ).some(
    (id) =>
      id.toString() ===
      programId.toString()
  );

  const batchAllowed = (
    userAccess.batchIds || []
  ).some(
    (id) =>
      id.toString() ===
      batchId.toString()
  );

  return programAllowed && batchAllowed;
};


// ============================================================
// CHECK REGION ACCESS
// ============================================================

const checkRegionAccess = async ({
  userId,
  districtId,
  blockId,
  centerId,
}) => {
  const regionAccess =
    await UserRegionAccess.find({
      userId,
    }).lean();

  if (!regionAccess.length) {
    return false;
  }

  return regionAccess.some((access) => {
    // --------------------------------------------------------
    // Global access
    // --------------------------------------------------------

    if (access.scope === "global") {
      return true;
    }

    // --------------------------------------------------------
    // District access
    // --------------------------------------------------------

    if (
      access.scope === "district" &&
      access.districtId &&
      districtId &&
      access.districtId.toString() ===
        districtId.toString()
    ) {
      return true;
    }

    // --------------------------------------------------------
    // Block access
    // --------------------------------------------------------

    if (
      access.scope === "block" &&
      access.blockId &&
      blockId &&
      access.blockId.toString() ===
        blockId.toString()
    ) {
      return true;
    }

    // --------------------------------------------------------
    // Center access
    // --------------------------------------------------------

    if (
      access.scope === "center" &&
      access.centerId &&
      centerId &&
      access.centerId.toString() ===
        centerId.toString()
    ) {
      return true;
    }

    return false;
  });
};


// ============================================================
// CHECK USER ACCESS TO ENROLLMENT
// ============================================================

const checkEnrollmentAccess = async ({
  req,
  enrollment,
}) => {
  // Admin can access everything
  if (isAdminUser(req)) {
    return true;
  }

  const userId = getUserId(req);

  if (!userId) {
    return false;
  }

  // ----------------------------------------------------------
  // Program + Batch access
  // ----------------------------------------------------------

  const programBatchAllowed =
    await checkProgramBatchAccess({
      userId,
      programId: enrollment.programId,
      batchId: enrollment.batchId,
    });

  if (!programBatchAllowed) {
    return false;
  }

  // ----------------------------------------------------------
  // Region access
  // ----------------------------------------------------------

  const regionAllowed =
    await checkRegionAccess({
      userId,
      districtId: enrollment.districtId,
      blockId: enrollment.blockId,
      centerId: enrollment.centerId,
    });

  return regionAllowed;
};


// ============================================================
// CREATE COPY CHECKING
// ============================================================

export const createStudentCopyChecking = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);

    const {
      studentId,
      enrollmentId,
      subjectId,
      workType,
      checkDate,
      status,
      remarks,
    } = req.body;

    // --------------------------------------------------------
    // Required fields
    // --------------------------------------------------------

    if (
      !studentId ||
      !enrollmentId ||
      !subjectId ||
      !workType ||
      !checkDate ||
      !status
    ) {
      return res.status(400).json({
        success: false,
        message:
          "studentId, enrollmentId, subjectId, workType, checkDate and status are required",
      });
    }

    // --------------------------------------------------------
    // ObjectId validation
    // subjectId is NOT ObjectId
    // --------------------------------------------------------

    if (
      !isValidObjectId(studentId) ||
      !isValidObjectId(enrollmentId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid studentId or enrollmentId",
      });
    }

    // --------------------------------------------------------
    // Subject validation
    // --------------------------------------------------------

    if (
      typeof subjectId !== "string" ||
      !subjectId.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid subjectId",
      });
    }

    // --------------------------------------------------------
    // Work type validation
    // --------------------------------------------------------

    if (!WORK_TYPES.includes(workType)) {
      return res.status(400).json({
        success: false,
        message:
          "workType must be either Class Work or Home Work",
      });
    }

    // --------------------------------------------------------
    // Status validation
    // --------------------------------------------------------

    if (!COPY_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "status must be Complete, Incomplete or Not-brought",
      });
    }

    // --------------------------------------------------------
    // Check date validation
    // --------------------------------------------------------

    const parsedCheckDate =
      normalizeCheckDate(checkDate);

    if (!parsedCheckDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid checkDate",
      });
    }

    // --------------------------------------------------------
    // Student existence
    // --------------------------------------------------------

    const studentExists =
      await Student.exists({
        _id: studentId,
      });

    if (!studentExists) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // --------------------------------------------------------
    // Enrollment
    // --------------------------------------------------------

    const enrollment =
      await StudentEnrollment.findById(
        enrollmentId
      ).lean();

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message:
          "Student enrollment not found",
      });
    }

    // --------------------------------------------------------
    // Student ↔ Enrollment validation
    // --------------------------------------------------------

    if (
      enrollment.studentId.toString() !==
      studentId.toString()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enrollment does not belong to the given student",
      });
    }

    // --------------------------------------------------------
    // Authorization
    // --------------------------------------------------------

    const hasAccess =
      await checkEnrollmentAccess({
        req,
        enrollment,
      });

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have access to this student",
      });
    }

    // --------------------------------------------------------
    // Create record
    // --------------------------------------------------------

    const copyChecking =
      await StudentCopyChecking.create({
        studentId,
        enrollmentId,
        subjectId: subjectId.trim(),
        workType,
        checkDate: parsedCheckDate,
        status,
        checkedBy: userId,
        remarks:
          typeof remarks === "string"
            ? remarks.trim()
            : remarks,
      });

    // --------------------------------------------------------
    // Populate response
    // subjectId is a String, so DO NOT populate it
    // --------------------------------------------------------

    const populatedCopyChecking =
      await StudentCopyChecking.findById(
        copyChecking._id
      )
        .populate(
          "studentId",
          "studentSrn rollNumber name fatherName motherName"
        )
        .populate(
          "enrollmentId",
          "programId batchId districtId blockId centerId class board status"
        )
        .populate(
          "checkedBy",
          "name email"
        )
        .lean();

    return res.status(201).json({
      success: true,
      message:
        "Student copy checking created successfully",
      data: populatedCopyChecking,
    });
  } catch (error) {
    console.error(
      "createStudentCopyChecking error:",
      error
    );

    // --------------------------------------------------------
    // Duplicate record
    // --------------------------------------------------------

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Copy checking already exists for this student, subject, work type and date",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to create student copy checking",
      error: error.message,
    });
  }
};


// ============================================================
// GET COPY CHECKING RECORDS
// ============================================================

export const getStudentCopyCheckings = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);

    const {
      page = 1,
      limit = 20,
      studentId,
      enrollmentId,
      subjectId,
      workType,
      status,
      programId,
      batchId,
      centerId,
      checkDate,
    } = req.query;

    const pageNumber = Math.max(
      Number(page) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(
        Number(limit) || 20,
        1
      ),
      100
    );

    const skip =
      (pageNumber - 1) *
      limitNumber;

    const match = {};

    // --------------------------------------------------------
    // Student filter
    // --------------------------------------------------------

    if (studentId) {
      if (!isValidObjectId(studentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studentId",
        });
      }

      match.studentId = studentId;
    }

    // --------------------------------------------------------
    // Enrollment filter
    // --------------------------------------------------------

    if (enrollmentId) {
      if (!isValidObjectId(enrollmentId)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid enrollmentId",
        });
      }

      match.enrollmentId =
        enrollmentId;
    }

    // --------------------------------------------------------
    // Subject filter
    // subjectId is String
    // --------------------------------------------------------

    if (subjectId) {
      if (
        typeof subjectId !== "string" ||
        !subjectId.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid subjectId",
        });
      }

      match.subjectId =
        subjectId.trim();
    }

    // --------------------------------------------------------
    // Work type filter
    // --------------------------------------------------------

    if (workType) {
      if (!WORK_TYPES.includes(workType)) {
        return res.status(400).json({
          success: false,
          message:
            "workType must be either Class Work or Home Work",
        });
      }

      match.workType = workType;
    }

    // --------------------------------------------------------
    // Status filter
    // --------------------------------------------------------

    if (status) {
      if (!COPY_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid copy checking status",
        });
      }

      match.status = status;
    }

    // --------------------------------------------------------
    // Check date filter
    // --------------------------------------------------------

    if (checkDate) {
      const startDate =
        normalizeCheckDate(checkDate);

      if (!startDate) {
        return res.status(400).json({
          success: false,
          message: "Invalid checkDate",
        });
      }

      const endDate =
        new Date(startDate);

      endDate.setDate(
        endDate.getDate() + 1
      );

      match.checkDate = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // --------------------------------------------------------
    // Non-admin access
    // --------------------------------------------------------

    if (!isAdminUser(req)) {
      const userAccess =
        await UserAccess.findOne({
          userId,
        }).lean();

      if (!userAccess) {
        return res.status(200).json({
          success: true,
          data: {
            copyCheckings: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage:
                pageNumber > 1,
            },
          },
        });
      }

      const programIds =
        userAccess.programIds || [];

      const batchIds =
        userAccess.batchIds || [];

      // ------------------------------------------------------
      // Program filter
      // ------------------------------------------------------

      if (programId) {
        if (!isValidObjectId(programId)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid programId",
          });
        }

        const hasProgramAccess =
          programIds.some(
            (id) =>
              id.toString() ===
              programId.toString()
          );

        if (!hasProgramAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this program",
          });
        }
      }

      // ------------------------------------------------------
      // Batch filter
      // ------------------------------------------------------

      if (batchId) {
        if (!isValidObjectId(batchId)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid batchId",
          });
        }

        const hasBatchAccess =
          batchIds.some(
            (id) =>
              id.toString() ===
              batchId.toString()
          );

        if (!hasBatchAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this batch",
          });
        }
      }

      // ------------------------------------------------------
      // Center filter
      // ------------------------------------------------------

      if (centerId) {
        if (!isValidObjectId(centerId)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid centerId",
          });
        }
      }

      // ------------------------------------------------------
      // Enrollment query
      // ------------------------------------------------------

      const enrollmentMatch = {
        programId: {
          $in: programIds,
        },
        batchId: {
          $in: batchIds,
        },
      };

      if (programId) {
        enrollmentMatch.programId =
          programId;
      }

      if (batchId) {
        enrollmentMatch.batchId =
          batchId;
      }

      if (enrollmentId) {
        enrollmentMatch._id =
          enrollmentId;
      }

      if (centerId) {
        enrollmentMatch.centerId =
          centerId;
      }

      // ------------------------------------------------------
      // Region access
      // ------------------------------------------------------

      const regionAccess =
        await UserRegionAccess.find({
          userId,
        }).lean();

      if (!regionAccess.length) {
        return res.status(200).json({
          success: true,
          data: {
            copyCheckings: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage:
                pageNumber > 1,
            },
          },
        });
      }

      const hasGlobalAccess =
        regionAccess.some(
          (access) =>
            access.scope === "global"
        );

      if (!hasGlobalAccess) {
        const districtIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "district" &&
                access.districtId
            )
            .map(
              (access) =>
                access.districtId
            );

        const blockIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "block" &&
                access.blockId
            )
            .map(
              (access) =>
                access.blockId
            );

        const centerIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "center" &&
                access.centerId
            )
            .map(
              (access) =>
                access.centerId
            );

        const regionConditions = [];

        if (districtIds.length) {
          regionConditions.push({
            districtId: {
              $in: districtIds,
            },
          });
        }

        if (blockIds.length) {
          regionConditions.push({
            blockId: {
              $in: blockIds,
            },
          });
        }

        if (centerIds.length) {
          regionConditions.push({
            centerId: {
              $in: centerIds,
            },
          });
        }

        if (!regionConditions.length) {
          return res.status(200).json({
            success: true,
            data: {
              copyCheckings: [],
              pagination: {
                page: pageNumber,
                limit: limitNumber,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage:
                  pageNumber > 1,
              },
            },
          });
        }

        enrollmentMatch.$or =
          regionConditions;
      }

      // ------------------------------------------------------
      // Get accessible enrollment IDs
      // ------------------------------------------------------

      const accessibleEnrollmentIds =
        await StudentEnrollment.distinct(
          "_id",
          enrollmentMatch
        );

      if (
        !accessibleEnrollmentIds.length
      ) {
        return res.status(200).json({
          success: true,
          data: {
            copyCheckings: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage:
                pageNumber > 1,
            },
          },
        });
      }

      match.enrollmentId = {
        $in: accessibleEnrollmentIds,
      };
    }

    // --------------------------------------------------------
    // Admin filters
    // --------------------------------------------------------

    if (isAdminUser(req)) {
      const adminEnrollmentMatch = {};

      if (programId) {
        if (!isValidObjectId(programId)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid programId",
          });
        }

        adminEnrollmentMatch.programId =
          programId;
      }

      if (batchId) {
        if (!isValidObjectId(batchId)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid batchId",
          });
        }

        adminEnrollmentMatch.batchId =
          batchId;
      }

      if (centerId) {
        if (!isValidObjectId(centerId)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid centerId",
          });
        }

        adminEnrollmentMatch.centerId =
          centerId;
      }

      if (enrollmentId) {
        adminEnrollmentMatch._id =
          enrollmentId;
      }

      if (
        Object.keys(
          adminEnrollmentMatch
        ).length
      ) {
        const adminEnrollmentIds =
          await StudentEnrollment.distinct(
            "_id",
            adminEnrollmentMatch
          );

        match.enrollmentId = {
          $in: adminEnrollmentIds,
        };
      }
    }

    // --------------------------------------------------------
    // Query
    // --------------------------------------------------------

    const [
      total,
      copyCheckings,
    ] = await Promise.all([
      StudentCopyChecking.countDocuments(
        match
      ),

      StudentCopyChecking.find(match)
        .populate(
          "studentId",
          "studentSrn rollNumber name fatherName motherName"
        )
        .populate(
          "enrollmentId",
          "programId batchId districtId blockId centerId class board status"
        )
        .populate(
          "checkedBy",
          "name email"
        )
        .sort({
          checkDate: -1,
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
    ]);

    const totalPages =
      Math.ceil(
        total / limitNumber
      );

    return res.status(200).json({
      success: true,
      data: {
        copyCheckings,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages,
          hasNextPage:
            pageNumber < totalPages,
          hasPreviousPage:
            pageNumber > 1,
        },
      },
    });
  } catch (error) {
    console.error(
      "getStudentCopyCheckings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch student copy checking records",
      error: error.message,
    });
  }
};


// ============================================================
// GET COPY CHECKING BY ID
// ============================================================

export const getStudentCopyCheckingById =
  async (req, res) => {
    try {
      const { checkingId } =
        req.params;

      if (!isValidObjectId(checkingId)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid checkingId",
        });
      }

      const copyChecking =
        await StudentCopyChecking.findById(
          checkingId
        )
          .populate(
            "studentId",
            "studentSrn rollNumber name fatherName motherName"
          )
          .populate(
            "enrollmentId",
            "programId batchId districtId blockId centerId class board status"
          )
          .populate(
            "checkedBy",
            "name email"
          )
          .lean();

      if (!copyChecking) {
        return res.status(404).json({
          success: false,
          message:
            "Student copy checking record not found",
        });
      }

      // ------------------------------------------------------
      // Authorization
      // ------------------------------------------------------

      if (!isAdminUser(req)) {
        const enrollment =
          await StudentEnrollment.findById(
            copyChecking.enrollmentId?._id ||
              copyChecking.enrollmentId
          ).lean();

        if (!enrollment) {
          return res.status(404).json({
            success: false,
            message:
              "Student enrollment not found",
          });
        }

        const hasAccess =
          await checkEnrollmentAccess({
            req,
            enrollment,
          });

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this student",
          });
        }
      }

      return res.status(200).json({
        success: true,
        data: copyChecking,
      });
    } catch (error) {
      console.error(
        "getStudentCopyCheckingById error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch student copy checking record",
        error: error.message,
      });
    }
  };


// ============================================================
// UPDATE COPY CHECKING
// ============================================================

export const updateStudentCopyChecking =
  async (req, res) => {
    try {
      const userId = getUserId(req);

      const { checkingId } =
        req.params;

      const {
        workType,
        checkDate,
        status,
        remarks,
        subjectId,
      } = req.body;

      // ------------------------------------------------------
      // Checking ID validation
      // ------------------------------------------------------

      if (!isValidObjectId(checkingId)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid checkingId",
        });
      }

      // ------------------------------------------------------
      // Existing record
      // ------------------------------------------------------

      const existingRecord =
        await StudentCopyChecking.findById(
          checkingId
        ).lean();

      if (!existingRecord) {
        return res.status(404).json({
          success: false,
          message:
            "Student copy checking record not found",
        });
      }

      // ------------------------------------------------------
      // Enrollment
      // ------------------------------------------------------

      const enrollment =
        await StudentEnrollment.findById(
          existingRecord.enrollmentId
        ).lean();

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message:
            "Student enrollment not found",
        });
      }

      // ------------------------------------------------------
      // Authorization
      // ------------------------------------------------------

      const hasAccess =
        await checkEnrollmentAccess({
          req,
          enrollment,
        });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message:
            "You do not have access to this student",
        });
      }

      // ------------------------------------------------------
      // Validate subjectId
      // ------------------------------------------------------

      if (subjectId !== undefined) {
        if (
          typeof subjectId !== "string" ||
          !subjectId.trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid subjectId",
          });
        }
      }

      // ------------------------------------------------------
      // Validate workType
      // ------------------------------------------------------

      if (workType !== undefined) {
        if (!WORK_TYPES.includes(workType)) {
          return res.status(400).json({
            success: false,
            message:
              "workType must be either Class Work or Home Work",
          });
        }
      }

      // ------------------------------------------------------
      // Validate status
      // ------------------------------------------------------

      if (status !== undefined) {
        if (!COPY_STATUSES.includes(status)) {
          return res.status(400).json({
            success: false,
            message:
              "status must be Complete, Incomplete or Not-brought",
          });
        }
      }

      // ------------------------------------------------------
      // Validate checkDate
      // ------------------------------------------------------

      let parsedCheckDate = null;

      if (checkDate !== undefined) {
        parsedCheckDate =
          normalizeCheckDate(checkDate);

        if (!parsedCheckDate) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid checkDate",
          });
        }
      }

      // ------------------------------------------------------
      // Update data
      // ------------------------------------------------------

      const updateData = {};

      if (subjectId !== undefined) {
        updateData.subjectId =
          subjectId.trim();
      }

      if (workType !== undefined) {
        updateData.workType =
          workType;
      }

      if (parsedCheckDate) {
        updateData.checkDate =
          parsedCheckDate;
      }

      if (status !== undefined) {
        updateData.status =
          status;
      }

      if (remarks !== undefined) {
        updateData.remarks =
          typeof remarks === "string"
            ? remarks.trim()
            : remarks;
      }

      if (
        !Object.keys(updateData).length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "No valid fields provided for update",
        });
      }

      // ------------------------------------------------------
      // Update
      // ------------------------------------------------------

      const updatedRecord =
        await StudentCopyChecking.findByIdAndUpdate(
          checkingId,
          {
            $set: {
              ...updateData,
              checkedBy: userId,
            },
          },
          {
            new: true,
            runValidators: true,
          }
        )
          .populate(
            "studentId",
            "studentSrn rollNumber name fatherName motherName"
          )
          .populate(
            "enrollmentId",
            "programId batchId districtId blockId centerId class board status"
          )
          .populate(
            "checkedBy",
            "name email"
          )
          .lean();

      return res.status(200).json({
        success: true,
        message:
          "Student copy checking updated successfully",
        data: updatedRecord,
      });
    } catch (error) {
      console.error(
        "updateStudentCopyChecking error:",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "Copy checking already exists for this student, subject, work type and date",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Failed to update student copy checking",
        error: error.message,
      });
    }
  };


// ============================================================
// DELETE COPY CHECKING
// ============================================================

export const deleteStudentCopyChecking =
  async (req, res) => {
    try {
      const { checkingId } =
        req.params;

      if (!isValidObjectId(checkingId)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid checkingId",
        });
      }

      // ------------------------------------------------------
      // Existing record
      // ------------------------------------------------------

      const existingRecord =
        await StudentCopyChecking.findById(
          checkingId
        ).lean();

      if (!existingRecord) {
        return res.status(404).json({
          success: false,
          message:
            "Student copy checking record not found",
        });
      }

      // ------------------------------------------------------
      // Enrollment
      // ------------------------------------------------------

      const enrollment =
        await StudentEnrollment.findById(
          existingRecord.enrollmentId
        ).lean();

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message:
            "Student enrollment not found",
        });
      }

      // ------------------------------------------------------
      // Authorization
      // ------------------------------------------------------

      const hasAccess =
        await checkEnrollmentAccess({
          req,
          enrollment,
        });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message:
            "You do not have access to this student",
        });
      }

      // ------------------------------------------------------
      // Delete
      // ------------------------------------------------------

      await StudentCopyChecking.findByIdAndDelete(
        checkingId
      );

      return res.status(200).json({
        success: true,
        message:
          "Student copy checking deleted successfully",
      });
    } catch (error) {
      console.error(
        "deleteStudentCopyChecking error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete student copy checking",
        error: error.message,
      });
    }
  };


// ============================================================
// CREATE / UPDATE BULK COPY CHECKING
// ============================================================

export const createBulkStudentCopyChecking =
  async (req, res) => {
    try {
      const userId = getUserId(req);

      const {
        checkDate,
        records,
      } = req.body;

      // ------------------------------------------------------
      // Required fields
      // ------------------------------------------------------

      if (
        !checkDate ||
        !Array.isArray(records) ||
        !records.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "checkDate and records are required",
        });
      }

      // ------------------------------------------------------
      // Check date validation
      // ------------------------------------------------------

      const parsedCheckDate =
        normalizeCheckDate(checkDate);

      if (!parsedCheckDate) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid checkDate",
        });
      }

      // ------------------------------------------------------
      // Validate records
      // ------------------------------------------------------

      for (const record of records) {
        if (
          !record.studentId ||
          !record.enrollmentId ||
          !record.subjectId ||
          !record.workType ||
          !record.status
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Each record must contain studentId, enrollmentId, subjectId, workType and status",
          });
        }

        // ----------------------------------------------------
        // ObjectId validation
        // subjectId is String
        // ----------------------------------------------------

        if (
          !isValidObjectId(
            record.studentId
          ) ||
          !isValidObjectId(
            record.enrollmentId
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid studentId or enrollmentId",
          });
        }

        // ----------------------------------------------------
        // Subject validation
        // ----------------------------------------------------

        if (
          typeof record.subjectId !==
            "string" ||
          !record.subjectId.trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid subjectId",
          });
        }

        // ----------------------------------------------------
        // Work type validation
        // ----------------------------------------------------

        if (
          !WORK_TYPES.includes(
            record.workType
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "workType must be either Class Work or Home Work",
          });
        }

        // ----------------------------------------------------
        // Status validation
        // ----------------------------------------------------

        if (
          !COPY_STATUSES.includes(
            record.status
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "status must be Complete, Incomplete or Not-brought",
          });
        }
      }

      // ------------------------------------------------------
      // Fetch enrollments
      // ------------------------------------------------------

      const enrollmentIds =
        records.map(
          (record) =>
            record.enrollmentId
        );

      const enrollments =
        await StudentEnrollment.find({
          _id: {
            $in: enrollmentIds,
          },
        }).lean();

      const enrollmentMap =
        new Map(
          enrollments.map(
            (enrollment) => [
              enrollment._id.toString(),
              enrollment,
            ]
          )
        );

      // ------------------------------------------------------
      // Authorization
      // ------------------------------------------------------

      for (const record of records) {
        const enrollment =
          enrollmentMap.get(
            record.enrollmentId.toString()
          );

        if (!enrollment) {
          return res.status(404).json({
            success: false,
            message:
              "Student enrollment not found",
          });
        }

        // ----------------------------------------------------
        // Student ↔ Enrollment
        // ----------------------------------------------------

        if (
          enrollment.studentId.toString() !==
          record.studentId.toString()
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Enrollment does not belong to the given student",
          });
        }

        // ----------------------------------------------------
        // Program + Batch + Region access
        // ----------------------------------------------------

        const hasAccess =
          await checkEnrollmentAccess({
            req,
            enrollment,
          });

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to one or more selected students",
          });
        }
      }

      // ------------------------------------------------------
      // CREATE / UPDATE
      // ------------------------------------------------------

      let created = 0;
      let updated = 0;

      for (const record of records) {
        const filter = {
          studentId:
            record.studentId,

          enrollmentId:
            record.enrollmentId,

          subjectId:
            record.subjectId.trim(),

          workType:
            record.workType,

          checkDate:
            parsedCheckDate,
        };

        const existingRecord =
          await StudentCopyChecking.findOne(
            filter
          );

        // ----------------------------------------------------
        // Update existing
        // ----------------------------------------------------

        if (existingRecord) {
          existingRecord.status =
            record.status;

          existingRecord.remarks =
            typeof record.remarks ===
            "string"
              ? record.remarks.trim()
              : record.remarks;

          existingRecord.checkedBy =
            userId;

          await existingRecord.save();

          updated++;
        }

        // ----------------------------------------------------
        // Create new
        // ----------------------------------------------------

        else {
          await StudentCopyChecking.create({
            studentId:
              record.studentId,

            enrollmentId:
              record.enrollmentId,

            subjectId:
              record.subjectId.trim(),

            workType:
              record.workType,

            checkDate:
              parsedCheckDate,

            status:
              record.status,

            checkedBy:
              userId,

            remarks:
              typeof record.remarks ===
              "string"
                ? record.remarks.trim()
                : record.remarks,
          });

          created++;
        }
      }

      return res.status(200).json({
        success: true,
        message:
          "Student copy checking saved successfully",
        data: {
          created,
          updated,
          total:
            created + updated,
        },
      });
    } catch (error) {
      console.error(
        "createBulkStudentCopyChecking error:",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "One or more copy checking records already exist",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Failed to save bulk student copy checking",
        error: error.message,
      });
    }
  };











  // ============================================================
// GET STUDENTS FOR COPY CHECKING
// ============================================================

export const getStudentCopyCheckingStudents = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);

    const {
      search,
      programId,
      batchId,
      districtId,
      blockId,
      centerId,
      page = 1,
      limit = 100,
    } = req.query;

    const pageNumber = Math.max(
      Number(page) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(Number(limit) || 100, 1),
      100
    );

    const skip =
      (pageNumber - 1) * limitNumber;

    // ========================================================
    // BASIC FILTER VALIDATION
    // ========================================================

    if (programId && !isValidObjectId(programId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid programId",
      });
    }

    if (batchId && !isValidObjectId(batchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batchId",
      });
    }

    if (districtId && !isValidObjectId(districtId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid districtId",
      });
    }

    if (blockId && !isValidObjectId(blockId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blockId",
      });
    }

    if (centerId && !isValidObjectId(centerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid centerId",
      });
    }

    // ========================================================
    // ADMIN
    // ========================================================

    let enrollmentMatch = {};

    if (isAdminUser(req)) {
      if (programId) {
        enrollmentMatch.programId = programId;
      }

      if (batchId) {
        enrollmentMatch.batchId = batchId;
      }

      if (districtId) {
        enrollmentMatch.districtId = districtId;
      }

      if (blockId) {
        enrollmentMatch.blockId = blockId;
      }

      if (centerId) {
        enrollmentMatch.centerId = centerId;
      }
    }

    // ========================================================
    // NON ADMIN ACCESS
    // ========================================================

    else {
      // ------------------------------------------------------
      // Program + Batch access
      // ------------------------------------------------------

      const userAccess =
        await UserAccess.findOne({
          userId,
        }).lean();

      if (!userAccess) {
        return res.status(200).json({
          success: true,
          data: {
            students: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage:
                pageNumber > 1,
            },
          },
        });
      }

      const programIds =
        userAccess.programIds || [];

      const batchIds =
        userAccess.batchIds || [];

      // ------------------------------------------------------
      // Selected program must be accessible
      // ------------------------------------------------------

      if (programId) {
        const hasProgramAccess =
          programIds.some(
            (id) =>
              id.toString() ===
              programId.toString()
          );

        if (!hasProgramAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this program",
          });
        }

        enrollmentMatch.programId =
          programId;
      } else {
        enrollmentMatch.programId = {
          $in: programIds,
        };
      }

      // ------------------------------------------------------
      // Selected batch must be accessible
      // ------------------------------------------------------

      if (batchId) {
        const hasBatchAccess =
          batchIds.some(
            (id) =>
              id.toString() ===
              batchId.toString()
          );

        if (!hasBatchAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this batch",
          });
        }

        enrollmentMatch.batchId =
          batchId;
      } else {
        enrollmentMatch.batchId = {
          $in: batchIds,
        };
      }

      // ------------------------------------------------------
      // Region access
      // ------------------------------------------------------

      const regionAccess =
        await UserRegionAccess.find({
          userId,
        }).lean();

      if (!regionAccess.length) {
        return res.status(200).json({
          success: true,
          data: {
            students: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage:
                pageNumber > 1,
            },
          },
        });
      }

      // ------------------------------------------------------
      // Global access
      // ------------------------------------------------------

      const hasGlobalAccess =
        regionAccess.some(
          (access) =>
            access.scope === "global"
        );

      if (hasGlobalAccess) {
        if (districtId) {
          enrollmentMatch.districtId =
            districtId;
        }

        if (blockId) {
          enrollmentMatch.blockId =
            blockId;
        }

        if (centerId) {
          enrollmentMatch.centerId =
            centerId;
        }
      }

      // ------------------------------------------------------
      // Non-global region access
      // ------------------------------------------------------

      else {
        const districtIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "district" &&
                access.districtId
            )
            .map(
              (access) =>
                access.districtId
            );

        const blockIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "block" &&
                access.blockId
            )
            .map(
              (access) =>
                access.blockId
            );

        const centerIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "center" &&
                access.centerId
            )
            .map(
              (access) =>
                access.centerId
            );

        const regionConditions = [];

        // ----------------------------------------------------
        // District
        // ----------------------------------------------------

        if (districtIds.length) {
          regionConditions.push({
            districtId: {
              $in: districtIds,
            },
          });
        }

        // ----------------------------------------------------
        // Block
        // ----------------------------------------------------

        if (blockIds.length) {
          regionConditions.push({
            blockId: {
              $in: blockIds,
            },
          });
        }

        // ----------------------------------------------------
        // Center
        // ----------------------------------------------------

        if (centerIds.length) {
          regionConditions.push({
            centerId: {
              $in: centerIds,
            },
          });
        }

        // ----------------------------------------------------
        // No region access
        // ----------------------------------------------------

        if (!regionConditions.length) {
          return res.status(200).json({
            success: true,
            data: {
              students: [],
              pagination: {
                page: pageNumber,
                limit: limitNumber,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage:
                  pageNumber > 1,
              },
            },
          });
        }

        // ----------------------------------------------------
        // If user selected a district
        // verify it against region access
        // ----------------------------------------------------

        if (districtId) {
          const districtAllowed =
            districtIds.some(
              (id) =>
                id.toString() ===
                districtId.toString()
            );

          if (
            !districtAllowed &&
            !blockIds.length &&
            !centerIds.length
          ) {
            return res.status(403).json({
              success: false,
              message:
                "You do not have access to this district",
            });
          }
        }

        // ----------------------------------------------------
        // If user selected a center
        // verify it against region access
        // ----------------------------------------------------

        if (centerId) {
          const centerAllowed =
            centerIds.some(
              (id) =>
                id.toString() ===
                centerId.toString()
            );

          if (!centerAllowed) {
            // Center can still be accessible
            // through district/block scope.
            const centerEnrollment =
              await StudentEnrollment.exists({
                centerId,
                $or: regionConditions,
              });

            if (!centerEnrollment) {
              return res.status(403).json({
                success: false,
                message:
                  "You do not have access to this center",
              });
            }
          }
        }

        // ----------------------------------------------------
        // Apply selected region filters
        // while retaining access scope.
        // ----------------------------------------------------

        const selectedRegionConditions = [];

        if (districtId) {
          selectedRegionConditions.push({
            districtId,
          });
        }

        if (blockId) {
          selectedRegionConditions.push({
            blockId,
          });
        }

        if (centerId) {
          selectedRegionConditions.push({
            centerId,
          });
        }

        if (
          selectedRegionConditions.length
        ) {
          enrollmentMatch.$and = [
            {
              $or: regionConditions,
            },
            {
              $and:
                selectedRegionConditions,
            },
          ];
        } else {
          enrollmentMatch.$or =
            regionConditions;
        }
      }
    }

    // ========================================================
    // SEARCH
    // ========================================================

    const studentMatch = {};

    if (search?.trim()) {
      const searchRegex =
        new RegExp(
          search.trim(),
          "i"
        );

      studentMatch.$or = [
        {
          studentSrn:
            searchRegex,
        },
        {
          rollNumber:
            searchRegex,
        },
        {
          name:
            searchRegex,
        },
        {
          fatherName:
            searchRegex,
        },
        {
          motherName:
            searchRegex,
        },
        {
          personalContact:
            searchRegex,
        },
        {
          parentContact:
            searchRegex,
        },
      ];
    }

    // ========================================================
    // GET ENROLLMENTS
    // ========================================================

    const enrollmentStudentIds =
      await StudentEnrollment.distinct(
        "studentId",
        enrollmentMatch
      );

    if (!enrollmentStudentIds.length) {
      return res.status(200).json({
        success: true,
        data: {
          students: [],
          pagination: {
            page: pageNumber,
            limit: limitNumber,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage:
              pageNumber > 1,
          },
        },
      });
    }

    studentMatch._id = {
      $in: enrollmentStudentIds,
    };

    // ========================================================
    // GET STUDENTS
    // ========================================================

    const [
      total,
      students,
    ] = await Promise.all([
      Student.countDocuments(
        studentMatch
      ),

      Student.find(studentMatch)
        .sort({
          name: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
    ]);

    // ========================================================
    // GET ENROLLMENTS FOR RETURNED STUDENTS
    // ========================================================

    const studentIds =
      students.map(
        (student) =>
          student._id
      );

    const enrollments =
      await StudentEnrollment.find({
        ...enrollmentMatch,
        studentId: {
          $in: studentIds,
        },
      })
        .populate(
          "programId",
          "programName programCode description isActive"
        )
        .populate(
          "batchId",
          "programId batchName startYear endYear isActive"
        )
        .populate(
          "districtId",
          "districtId districtName"
        )
        .populate(
          "blockId",
          "blockId blockName districtId"
        )
        .populate(
          "centerId",
          "centerCode centerName districtId blockId isCenterAvailable availableClasses availableBoard"
        )
        .lean();

    // ========================================================
    // MAP ENROLLMENTS
    // ========================================================

    const enrollmentMap =
      new Map();

    for (const enrollment of enrollments) {
      const studentKey =
        enrollment.studentId.toString();

      if (
        !enrollmentMap.has(
          studentKey
        )
      ) {
        enrollmentMap.set(
          studentKey,
          []
        );
      }

      enrollmentMap
        .get(studentKey)
        .push(enrollment);
    }

    // ========================================================
    // FORMAT STUDENTS
    // ========================================================

    const formattedStudents =
      students.map(
        (student) => ({
          ...student,

          enrollments:
            enrollmentMap.get(
              student._id.toString()
            ) || [],
        })
      );

    // ========================================================
    // PAGINATION
    // ========================================================

    const totalPages =
      Math.ceil(
        total / limitNumber
      );

    return res.status(200).json({
      success: true,
      data: {
        students:
          formattedStudents,

        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages,

          hasNextPage:
            pageNumber <
            totalPages,

          hasPreviousPage:
            pageNumber > 1,
        },
      },
    });
  } catch (error) {
    console.error(
      "getStudentCopyCheckingStudents error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch students for copy checking",
      error: error.message,
    });
  }
};