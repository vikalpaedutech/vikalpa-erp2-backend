import mongoose from "mongoose";

import { StudentMark } from "../../models/student-management/studentMark.models.js";
import { Exam } from "../../models/academic-management/exam.models.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";
import { Student } from "../../models/student-management/student.models.js";
import { UserAccess } from "../../models/user-management/userAccess.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";


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
    req.user?.roles?.some((role) => role.roleCode === "admin")
  );
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

  const programAllowed = (userAccess.programIds || []).some(
    (id) => id.toString() === programId.toString()
  );

  const batchAllowed = (userAccess.batchIds || []).some(
    (id) => id.toString() === batchId.toString()
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
  const regionAccess = await UserRegionAccess.find({
    userId,
  }).lean();

  if (!regionAccess.length) {
    return false;
  }

  return regionAccess.some((access) => {
    if (access.scope === "global") {
      return true;
    }

    if (
      access.scope === "district" &&
      access.districtId &&
      districtId &&
      access.districtId.toString() === districtId.toString()
    ) {
      return true;
    }

    if (
      access.scope === "block" &&
      access.blockId &&
      blockId &&
      access.blockId.toString() === blockId.toString()
    ) {
      return true;
    }

    if (
      access.scope === "center" &&
      access.centerId &&
      centerId &&
      access.centerId.toString() === centerId.toString()
    ) {
      return true;
    }

    return false;
  });
};


// ============================================================
// CREATE STUDENT MARK
// ============================================================

export const createStudentMark = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      examId,
      enrollmentId,
      studentId,
      obtainedMarks,
      attachments = [],
    } = req.body;


    // --------------------------------------------------------
    // Required fields
    // --------------------------------------------------------

    if (!examId || !enrollmentId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "examId, enrollmentId and studentId are required",
      });
    }

    if (obtainedMarks === undefined || obtainedMarks === null) {
      return res.status(400).json({
        success: false,
        message: "obtainedMarks is required",
      });
    }

    // --------------------------------------------------------
    // ObjectId validation
    // --------------------------------------------------------

    if (
      !isValidObjectId(examId) ||
      !isValidObjectId(enrollmentId) ||
      !isValidObjectId(studentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid examId, enrollmentId or studentId",
      });
    }

    // --------------------------------------------------------
    // Marks validation
    // --------------------------------------------------------

    if (typeof obtainedMarks !== "number" || Number.isNaN(obtainedMarks)) {
      return res.status(400).json({
        success: false,
        message: "obtainedMarks must be a valid number",
      });
    }

    if (obtainedMarks < 0) {
      return res.status(400).json({
        success: false,
        message: "obtainedMarks cannot be negative",
      });
    }

    // --------------------------------------------------------
    // Get exam
    // --------------------------------------------------------

    const exam = await Exam.findById(examId).lean();

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    if (!exam.isActive) {
      return res.status(400).json({
        success: false,
        message: "This exam is inactive",
      });
    }

    // --------------------------------------------------------
    // Maximum marks validation
    // --------------------------------------------------------

    if (obtainedMarks > exam.maximumMarks) {
      return res.status(400).json({
        success: false,
        message: `Obtained marks cannot be greater than maximum marks (${exam.maximumMarks})`,
      });
    }

    // --------------------------------------------------------
    // Get enrollment
    // --------------------------------------------------------

    const enrollment = await StudentEnrollment.findById(
      enrollmentId
    ).lean();

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Student enrollment not found",
      });
    }

    // --------------------------------------------------------
    // Verify enrollment belongs to student
    // --------------------------------------------------------

    if (enrollment.studentId.toString() !== studentId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Enrollment does not belong to the given student",
      });
    }

    // --------------------------------------------------------
    // Verify enrollment belongs to exam
    // --------------------------------------------------------

    if (
      enrollment.programId.toString() !== exam.programId.toString() ||
      enrollment.batchId.toString() !== exam.batchId.toString()
    ) {
      return res.status(400).json({
        success: false,
        message: "Student enrollment does not belong to this exam",
      });
    }

    // --------------------------------------------------------
    // Student existence
    // --------------------------------------------------------

    const studentExists = await Student.exists({
      _id: studentId,
    });

    if (!studentExists) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // --------------------------------------------------------
    // Authorization
    // --------------------------------------------------------

    if (!isAdminUser(req)) {
      const programBatchAllowed = await checkProgramBatchAccess({
        userId,
        programId: enrollment.programId,
        batchId: enrollment.batchId,
      });

      if (!programBatchAllowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this program or batch",
        });
      }

      const regionAllowed = await checkRegionAccess({
        userId,
        districtId: enrollment.districtId,
        blockId: enrollment.blockId,
        centerId: enrollment.centerId,
      });

      if (!regionAllowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this student's region",
        });
      }
    }

    // --------------------------------------------------------
    // Duplicate check
    // --------------------------------------------------------

    const existingMark = await StudentMark.findOne({
      examId,
      studentId,
    }).lean();

    if (existingMark) {
      return res.status(409).json({
        success: false,
        message: "Marks for this student have already been entered for this exam",
      });
    }

    // --------------------------------------------------------
    // Create marks
    // --------------------------------------------------------

    const studentMark = await StudentMark.create({
      examId,
      enrollmentId,
      studentId,
      obtainedMarks,
      attachments,
      filledBy: userId,
    });

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    const populatedMark = await StudentMark.findById(
      studentMark._id
    )
      .populate("examId", "examName examCode examDate subject maximumMarks")
      .populate(
        "studentId",
        "studentSrn rollNumber name fatherName motherName"
      )
      .populate(
        "enrollmentId",
        "programId batchId districtId blockId centerId class board status"
      )
      .populate("filledBy", "name email")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Student marks created successfully",
      data: populatedMark,
    });
  } catch (error) {
    // --------------------------------------------------------
    // Duplicate index safety
    // --------------------------------------------------------

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Marks for this student have already been entered for this exam",
      });
    }

    console.error("createStudentMark error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create student marks",
      error: error.message,
    });
  }
};


// ============================================================
// GET STUDENT MARKS
// ============================================================

export const getStudentMarks = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      page = 1,
      limit = 20,
      examId,
      studentId,
      enrollmentId,
      programId,
      batchId,
      status,
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);

    const limitNumber = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip = (pageNumber - 1) * limitNumber;

    const match = {};

    // --------------------------------------------------------
    // Basic filters
    // --------------------------------------------------------

    if (examId) {
      if (!isValidObjectId(examId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid examId",
        });
      }

      match.examId = examId;
    }

    if (studentId) {
      if (!isValidObjectId(studentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studentId",
        });
      }

      match.studentId = studentId;
    }

    if (enrollmentId) {
      if (!isValidObjectId(enrollmentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid enrollmentId",
        });
      }

      match.enrollmentId = enrollmentId;
    }

    // --------------------------------------------------------
    // For non-admin users
    // --------------------------------------------------------

    if (!isAdminUser(req)) {
      const userAccess = await UserAccess.findOne({
        userId,
      }).lean();

      if (!userAccess) {
        return res.status(200).json({
          success: true,
          data: {
            marks: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage: pageNumber > 1,
            },
          },
        });
      }

      const programIds = userAccess.programIds || [];
      const batchIds = userAccess.batchIds || [];

      if (programId) {
        const hasProgramAccess = programIds.some(
          (id) => id.toString() === programId.toString()
        );

        if (!hasProgramAccess) {
          return res.status(403).json({
            success: false,
            message: "You do not have access to this program",
          });
        }
      }

      if (batchId) {
        const hasBatchAccess = batchIds.some(
          (id) => id.toString() === batchId.toString()
        );

        if (!hasBatchAccess) {
          return res.status(403).json({
            success: false,
            message: "You do not have access to this batch",
          });
        }
      }

      // ------------------------------------------------------
      // Find accessible enrollments
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
        enrollmentMatch.programId = programId;
      }

      if (batchId) {
        enrollmentMatch.batchId = batchId;
      }

      if (enrollmentId) {
        enrollmentMatch._id = enrollmentId;
      }

      // ------------------------------------------------------
      // Enrollment Status Filter
      // ------------------------------------------------------

      if (status) {
        enrollmentMatch.status = status;
      }

      // ------------------------------------------------------
      // Region access
      // ------------------------------------------------------

      const regionAccess = await UserRegionAccess.find({
        userId,
      }).lean();

      if (!regionAccess.length) {
        return res.status(200).json({
          success: true,
          data: {
            marks: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage: pageNumber > 1,
            },
          },
        });
      }

      const hasGlobalAccess = regionAccess.some(
        (access) => access.scope === "global"
      );

      if (!hasGlobalAccess) {
        const districtIds = regionAccess
          .filter(
            (access) =>
              access.scope === "district" && access.districtId
          )
          .map((access) => access.districtId);

        const blockIds = regionAccess
          .filter(
            (access) =>
              access.scope === "block" && access.blockId
          )
          .map((access) => access.blockId);

        const centerIds = regionAccess
          .filter(
            (access) =>
              access.scope === "center" && access.centerId
          )
          .map((access) => access.centerId);

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
              marks: [],
              pagination: {
                page: pageNumber,
                limit: limitNumber,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: pageNumber > 1,
              },
            },
          });
        }

        enrollmentMatch.$or = regionConditions;
      }

      const accessibleEnrollmentIds =
        await StudentEnrollment.distinct(
          "_id",
          enrollmentMatch
        );

      if (!accessibleEnrollmentIds.length) {
        return res.status(200).json({
          success: true,
          data: {
            marks: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage: pageNumber > 1,
            },
          },
        });
      }

      match.enrollmentId = {
        $in: accessibleEnrollmentIds,
      };
    }

    // --------------------------------------------------------
    // Admin Status Filter
    // --------------------------------------------------------

    if (isAdminUser(req) && status) {
      const enrollmentIds = await StudentEnrollment.distinct(
        "_id",
        {
          status,
        }
      );

      match.enrollmentId = {
        $in: enrollmentIds,
      };
    }

    // --------------------------------------------------------
    // Query
    // --------------------------------------------------------

    const [total, marks] = await Promise.all([
      StudentMark.countDocuments(match),

      StudentMark.find(match)
        .populate(
          "examId",
          "examName examCode examDate subject maximumMarks programId batchId"
        )
        .populate(
          "studentId",
          "studentSrn rollNumber name fatherName motherName"
        )
        .populate(
          "enrollmentId",
          "programId batchId districtId blockId centerId class board status"
        )
        .populate("filledBy", "name email")
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limitNumber);

    return res.status(200).json({
      success: true,
      data: {
        marks,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
        },
      },
    });
  } catch (error) {
    console.error("getStudentMarks error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch student marks",
      error: error.message,
    });
  }
};


// ============================================================
// GET MARKS BY ID
// ============================================================

export const getStudentMarkById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { markId } = req.params;

    if (!isValidObjectId(markId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid markId",
      });
    }

    const mark = await StudentMark.findById(markId)
      .populate(
        "examId",
        "examName examCode examDate subject maximumMarks programId batchId"
      )
      .populate(
        "studentId",
        "studentSrn rollNumber name fatherName motherName"
      )
      .populate(
        "enrollmentId",
        "programId batchId districtId blockId centerId class board status"
      )
      .populate("filledBy", "name email")
      .lean();

    if (!mark) {
      return res.status(404).json({
        success: false,
        message: "Student marks not found",
      });
    }

    // --------------------------------------------------------
    // Authorization
    // --------------------------------------------------------

    if (!isAdminUser(req)) {
      const enrollment = await StudentEnrollment.findById(
        mark.enrollmentId._id
      ).lean();

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message: "Student enrollment not found",
        });
      }

      const programBatchAllowed = await checkProgramBatchAccess({
        userId,
        programId: enrollment.programId,
        batchId: enrollment.batchId,
      });

      if (!programBatchAllowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this student",
        });
      }

      const regionAllowed = await checkRegionAccess({
        userId,
        districtId: enrollment.districtId,
        blockId: enrollment.blockId,
        centerId: enrollment.centerId,
      });

      if (!regionAllowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this student's region",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: mark,
    });
  } catch (error) {
    console.error("getStudentMarkById error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch student marks",
      error: error.message,
    });
  }
};


// ============================================================
// UPDATE STUDENT MARK
// ============================================================

export const updateStudentMark = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { markId } = req.params;

    const {
      obtainedMarks,
      attachments,
    } = req.body;

    if (!isValidObjectId(markId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid markId",
      });
    }

    const mark = await StudentMark.findById(markId).lean();

    if (!mark) {
      return res.status(404).json({
        success: false,
        message: "Student marks not found",
      });
    }

    // --------------------------------------------------------
    // Get enrollment
    // --------------------------------------------------------

    const enrollment = await StudentEnrollment.findById(
      mark.enrollmentId
    ).lean();

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Student enrollment not found",
      });
    }

    // --------------------------------------------------------
    // Authorization
    // --------------------------------------------------------

    if (!isAdminUser(req)) {
      const programBatchAllowed = await checkProgramBatchAccess({
        userId,
        programId: enrollment.programId,
        batchId: enrollment.batchId,
      });

      if (!programBatchAllowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this student",
        });
      }

      const regionAllowed = await checkRegionAccess({
        userId,
        districtId: enrollment.districtId,
        blockId: enrollment.blockId,
        centerId: enrollment.centerId,
      });

      if (!regionAllowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this student's region",
        });
      }
    }

    // --------------------------------------------------------
    // Get exam
    // --------------------------------------------------------

    const exam = await Exam.findById(mark.examId).lean();

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // --------------------------------------------------------
    // Blank marks = remove this student's marks for this exam
    // --------------------------------------------------------

    if (obtainedMarks === "" || obtainedMarks === null) {
      await StudentMark.findByIdAndDelete(markId);

      return res.status(200).json({
        success: true,
        message: "Student marks removed successfully",
        data: null,
      });
    }

    // --------------------------------------------------------
    // Validate obtained marks
    // --------------------------------------------------------

    if (obtainedMarks !== undefined) {
      if (
        typeof obtainedMarks !== "number" ||
        Number.isNaN(obtainedMarks)
      ) {
        return res.status(400).json({
          success: false,
          message: "obtainedMarks must be a valid number",
        });
      }

      if (obtainedMarks < 0) {
        return res.status(400).json({
          success: false,
          message: "obtainedMarks cannot be negative",
        });
      }

      if (obtainedMarks > exam.maximumMarks) {
        return res.status(400).json({
          success: false,
          message: `Obtained marks cannot be greater than maximum marks (${exam.maximumMarks})`,
        });
      }
    }

    // --------------------------------------------------------
    // Update allowed fields only
    // --------------------------------------------------------

    const updateData = {};

    if (obtainedMarks !== undefined) {
      updateData.obtainedMarks = obtainedMarks;
    }

    if (attachments !== undefined) {
      if (!Array.isArray(attachments)) {
        return res.status(400).json({
          success: false,
          message: "attachments must be an array",
        });
      }

      updateData.attachments = attachments;
    }

    if (!Object.keys(updateData).length) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    updateData.filledBy = userId;

    const updatedMark = await StudentMark.findByIdAndUpdate(
      markId,
      {
        $set: updateData,
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate(
        "examId",
        "examName examCode examDate subject maximumMarks"
      )
      .populate(
        "studentId",
        "studentSrn rollNumber name fatherName motherName"
      )
      .populate(
        "enrollmentId",
        "programId batchId districtId blockId centerId class board status"
      )
      .populate("filledBy", "name email")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Student marks updated successfully",
      data: updatedMark,
    });
  } catch (error) {
    console.error("updateStudentMark error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update student marks",
      error: error.message,
    });
  }
};


// ============================================================
// DELETE STUDENT MARK
// ============================================================

export const deleteStudentMark = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { markId } = req.params;

    if (!isValidObjectId(markId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid markId",
      });
    }

    const mark = await StudentMark.findById(markId).lean();

    if (!mark) {
      return res.status(404).json({
        success: false,
        message: "Student marks not found",
      });
    }

    // --------------------------------------------------------
    // Authorization
    // --------------------------------------------------------

    if (!isAdminUser(req)) {
      const enrollment = await StudentEnrollment.findById(
        mark.enrollmentId
      ).lean();

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message: "Student enrollment not found",
        });
      }

      const programBatchAllowed = await checkProgramBatchAccess({
        userId,
        programId: enrollment.programId,
        batchId: enrollment.batchId,
      });

      if (!programBatchAllowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this student",
        });
      }

      const regionAllowed = await checkRegionAccess({
        userId,
        districtId: enrollment.districtId,
        blockId: enrollment.blockId,
        centerId: enrollment.centerId,
      });

      if (!regionAllowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this student's region",
        });
      }
    }

    // --------------------------------------------------------
    // Delete
    // --------------------------------------------------------

    await StudentMark.findByIdAndDelete(markId);

    return res.status(200).json({
      success: true,
      message: "Student marks deleted successfully",
    });
  } catch (error) {
    console.error("deleteStudentMark error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete student marks",
      error: error.message,
    });
  }
};
