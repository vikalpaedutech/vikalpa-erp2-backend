import mongoose from "mongoose";
import XLSX from "xlsx";

import { Student } from "../../models/student-management/student.models.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";

import { ApiError } from "../../utils/api-error.js";

import { StudentLog } from "../../models/student-management/studentLogs.mdoels.js";
import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";

// -----------------------------
// Date handling
// -----------------------------
const parseDate = (value) => {
  if (!value) return undefined;

  // Already a JavaScript Date
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      throw new ApiError(400, "Invalid date value");
    }

    return value;
  }

  const dateString = String(value).trim();

  // =====================================================
  // YYYY-MM-DD
  // =====================================================

  let match = dateString.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (match) {
    const [, year, month, day] = match;

    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day)
      )
    );

    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) {
      return date;
    }
  }

  // =====================================================
  // DD-MM-YYYY / DD-MM-YY
  // =====================================================

  match = dateString.match(
    /^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/
  );

  if (match) {
    let [, day, month, year] = match;

    if (year.length === 2) {
      year =
        Number(year) <= 30
          ? `20${year}`
          : `19${year}`;
    }

    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day)
      )
    );

    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) {
      return date;
    }
  }

  // =====================================================
  // DD/MM/YYYY / DD/MM/YY
  // MM/DD/YYYY / MM/DD/YY
  // =====================================================

  match = dateString.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/
  );

  if (match) {
    let [, first, second, year] = match;

    if (year.length === 2) {
      year =
        Number(year) <= 30
          ? `20${year}`
          : `19${year}`;
    }

    let day;
    let month;

    // =================================================
    // Determine whether it is DD/MM or MM/DD
    // =================================================

    if (Number(first) > 12) {
      // Example: 18/02/2011
      // 18 cannot be a month, so DD/MM
      day = Number(first);
      month = Number(second);
    } else if (Number(second) > 12) {
      // Example: 02/18/2011
      // 18 cannot be a month, so MM/DD
      month = Number(first);
      day = Number(second);
    } else {
      // Ambiguous case.
      // Default to DD/MM because this is the
      // standard format used in the ERP template.
      day = Number(first);
      month = Number(second);
    }

    const date = new Date(
      Date.UTC(
        Number(year),
        month - 1,
        day
      )
    );

    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date;
    }
  }

  // =====================================================
  // Invalid date
  // =====================================================

  throw new ApiError(
    400,
    `Invalid date format: ${dateString}. Supported formats: DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD`
  );
};


// =====================================================
// ONBOARD STUDENT
// =====================================================

/**
 * Onboard a new student
 */
const onboardStudent = async (studentData) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      student,
      enrollment,
    } = studentData;

    // -----------------------------
    // 1. Basic validation
    // -----------------------------

    if (!student) {
      throw new ApiError(
        400,
        "Student details are required"
      );
    }

    if (!enrollment) {
      throw new ApiError(
        400,
        "Student enrollment details are required"
      );
    }

    // -----------------------------
    // 2. Check duplicate SRN
    // -----------------------------

    const existingStudent = await Student.findOne({
      studentSrn: student.studentSrn,
    }).session(session);

    if (existingStudent) {
      throw new ApiError(
        409,
        "Student with this SRN already exists"
      );
    }

    // -----------------------------
    // 3. Create Student
    // -----------------------------

    const [createdStudent] = await Student.create(
      [
        {
          ...student,
        },
      ],
      { session }
    );

    // -----------------------------
    // 4. Create Enrollment
    // -----------------------------

    const [createdEnrollment] =
      await StudentEnrollment.create(
        [
          {
            ...enrollment,
            studentId: createdStudent._id,
          },
        ],
        { session }
      );

    // -----------------------------
    // 5. Commit transaction
    // -----------------------------

    await session.commitTransaction();

    return {
      student: createdStudent,
      enrollment: createdEnrollment,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};



// =====================================================
// BULK ONBOARD STUDENTS
// =====================================================

/**
 * Bulk onboard students from CSV / Excel file
 */
const bulkOnboardStudents = async (file) => {
  if (!file) {
    throw new ApiError(
      400,
      "CSV or Excel file is required"
    );
  }

  // -----------------------------
  // 1. Read uploaded file
  // -----------------------------

  const workbook = XLSX.read(file.buffer, {
    type: "buffer",
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new ApiError(
      400,
      "The uploaded file does not contain any worksheet"
    );
  }

  const worksheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(
    worksheet,
    {
      defval: "",
      raw: false,
    }
  );

  if (!rows.length) {
    throw new ApiError(
      400,
      "The uploaded file contains no student records"
    );
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const studentDocuments = [];
    const enrollmentDocuments = [];

    const srns = new Set();

    // -----------------------------
    // 2. Prepare documents
    // -----------------------------

    for (
      let index = 0;
      index < rows.length;
      index++
    ) {
      const row = rows[index];

      const rowNumber = index + 2;

      // -----------------------------
      // Basic validation
      // -----------------------------

      if (!row.studentSrn) {
        throw new ApiError(
          400,
          `studentSrn is required at row ${rowNumber}`
        );
      }

      if (!row.programId) {
        throw new ApiError(
          400,
          `programId is required at row ${rowNumber}`
        );
      }

      if (!row.batchId) {
        throw new ApiError(
          400,
          `batchId is required at row ${rowNumber}`
        );
      }

      // -----------------------------
      // Duplicate SRN inside file
      // -----------------------------

      if (srns.has(row.studentSrn)) {
        throw new ApiError(
          409,
          `Duplicate studentSrn found in uploaded file at row ${rowNumber}: ${row.studentSrn}`
        );
      }

      srns.add(row.studentSrn);

      const studentId =
        new mongoose.Types.ObjectId();

      // -----------------------------
      // Student document
      // -----------------------------

      studentDocuments.push({
        _id: studentId,

        studentSrn: row.studentSrn,
        rollNumber:
          row.rollNumber || undefined,

        name: row.name,

        fatherName:
          row.fatherName || undefined,

        motherName:
          row.motherName || undefined,

        personalContact:
          row.personalContact || undefined,

        parentContact:
          row.parentContact || undefined,

        otherContact:
          row.otherContact || undefined,

        dob: parseDate(row.dob),

        gender:
          row.gender || undefined,

        category:
          row.category || undefined,

        address:
          row.address || undefined,

        profileImage:
          row.profileImage || undefined,

        isActive:
          row.isActive === ""
            ? true
            : row.isActive === "true",
      });

      // -----------------------------
      // Enrollment document
      // -----------------------------

      enrollmentDocuments.push({
        studentId,

        programId: row.programId,

        batchId: row.batchId,

        districtId:
          row.districtId || undefined,

        blockId:
          row.blockId || undefined,

        centerId:
          row.centerId || undefined,

        class: row.class
          ? Number(row.class)
          : undefined,

        board:
          row.board || undefined,

        enrollmentDate:
          parseDate(row.enrollmentDate),

        status:
          row.status || undefined,

        // SLC current state
        slcSubmitted:
          row.slcSubmitted === ""
            ? false
            : row.slcSubmitted === "true",

        slcSubmittedAt:
          parseDate(row.slcSubmittedAt),
      });
    }

    // -----------------------------
    // 3. Check existing SRNs
    // -----------------------------

    const existingStudents =
      await Student.find({
        studentSrn: {
          $in: [...srns],
        },
      })
        .select("studentSrn")
        .session(session);

    if (existingStudents.length) {
      const duplicateSrns =
        existingStudents.map(
          (student) => student.studentSrn
        );

      throw new ApiError(
        409,
        `These student SRNs already exist: ${duplicateSrns.join(
          ", "
        )}`
      );
    }

    // -----------------------------
    // 4. Insert Students
    // -----------------------------

    await Student.insertMany(
      studentDocuments,
      {
        session,
      }
    );

    // -----------------------------
    // 5. Insert Enrollments
    // -----------------------------

    await StudentEnrollment.insertMany(
      enrollmentDocuments,
      {
        session,
      }
    );

    // -----------------------------
    // 6. Commit transaction
    // -----------------------------

    await session.commitTransaction();

    return {
      totalRecords: rows.length,
      studentsCreated:
        studentDocuments.length,
      enrollmentsCreated:
        enrollmentDocuments.length,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};




/**
 * Request to add a new student.
 */
const requestStudentAdd = async (
  studentData,
  requestedBy
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      student,
      enrollment,
      requestReason,
    } = studentData;

    // -----------------------------
    // 1. Basic validation
    // -----------------------------

    if (!student) {
      throw new ApiError(
        400,
        "Student details are required"
      );
    }

    if (!enrollment) {
      throw new ApiError(
        400,
        "Student enrollment details are required"
      );
    }

    if (!requestReason?.trim()) {
      throw new ApiError(
        400,
        "Request reason is required"
      );
    }

    // -----------------------------
    // 2. Check duplicate SRN
    // -----------------------------

    const existingStudent = await Student.findOne({
      studentSrn: student.studentSrn,
    }).session(session);

    if (existingStudent) {
      throw new ApiError(
        409,
        "Student with this SRN already exists"
      );
    }

    // -----------------------------
    // 3. Create Student
    // -----------------------------

    const [createdStudent] = await Student.create(
      [
        {
          ...student,
          isActive: false,
        },
      ],
      { session }
    );

    // -----------------------------
    // 4. Create Enrollment
    // -----------------------------

    const [createdEnrollment] =
      await StudentEnrollment.create(
        [
          {
            ...enrollment,
            studentId: createdStudent._id,
            status: "add-request",
          },
        ],
        { session }
      );

    // -----------------------------
    // 5. Create Student Log
    // -----------------------------

    const [createdLog] = await StudentLog.create(
      [
        {
          studentId: createdStudent._id,
          enrollmentId: createdEnrollment._id,

          requestType: "add-student",
          status: "pending",

          requestedBy,
          requestedAt: new Date(),

          reason: requestReason.trim(),
        },
      ],
      { session }
    );

    // -----------------------------
    // 6. Commit transaction
    // -----------------------------

    await session.commitTransaction();

    return {
      student: createdStudent,
      enrollment: createdEnrollment,
      log: createdLog,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};





/**
 * Request removal of a student from the current enrollment.
 */
const requestStudentRemove = async ({
  studentId,
  requestReason,
  requestedBy,
}) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // -----------------------------
    // 1. Basic validation
    // -----------------------------

    if (!studentId) {
      throw new ApiError(
        400,
        "Student ID is required"
      );
    }

    if (
      !mongoose.Types.ObjectId.isValid(studentId)
    ) {
      throw new ApiError(
        400,
        "Invalid student ID"
      );
    }

    if (!requestReason?.trim()) {
      throw new ApiError(
        400,
        "Request reason is required"
      );
    }

    // -----------------------------
    // 2. Check student
    // -----------------------------

    const student = await Student.findById(
      studentId
    ).session(session);

    if (!student) {
      throw new ApiError(
        404,
        "Student not found"
      );
    }

    // -----------------------------
    // 3. Find current enrollment
    // -----------------------------

    const enrollment =
      await StudentEnrollment.findOne({
        studentId,
        status: {
          $in: ["active", "provisional"],
        },
      }).session(session);

    if (!enrollment) {
      throw new ApiError(
        400,
        "No active enrollment found for this student"
      );
    }

    // -----------------------------
    // 4. Update enrollment status
    // -----------------------------

    enrollment.status = "remove-request";

    await enrollment.save({
      session,
    });

    // -----------------------------
    // 5. Create Student Log
    // -----------------------------

    const [createdLog] = await StudentLog.create(
      [
        {
          studentId: student._id,
          enrollmentId: enrollment._id,

          requestType: "remove-student",
          status: "pending",

          requestedBy,
          requestedAt: new Date(),

          reason: requestReason.trim(),
        },
      ],
      { session }
    );

    // -----------------------------
    // 6. Commit transaction
    // -----------------------------

    await session.commitTransaction();

    return {
      student,
      enrollment,
      log: createdLog,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};




/**
 * Request SLC for a student.
 */
const requestStudentSLC = async ({
  studentId,
  requestReason,
  requestedBy,
}) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // -----------------------------
    // 1. Basic validation
    // -----------------------------

    if (!studentId) {
      throw new ApiError(
        400,
        "Student ID is required"
      );
    }

    if (
      !mongoose.Types.ObjectId.isValid(studentId)
    ) {
      throw new ApiError(
        400,
        "Invalid student ID"
      );
    }

    if (!requestReason?.trim()) {
      throw new ApiError(
        400,
        "Request reason is required"
      );
    }

    // -----------------------------
    // 2. Check student
    // -----------------------------

    const student = await Student.findById(
      studentId
    ).session(session);

    if (!student) {
      throw new ApiError(
        404,
        "Student not found"
      );
    }

    // -----------------------------
    // 3. Find active enrollment
    // -----------------------------

    const enrollment =
      await StudentEnrollment.findOne({
        studentId,
        status: "active",
      }).session(session);

    if (!enrollment) {
      throw new ApiError(
        400,
        "No active enrollment found for this student"
      );
    }

    // -----------------------------
    // 4. Update enrollment status
    // -----------------------------

    enrollment.status = "requested-slc";

    await enrollment.save({
      session,
    });

    // -----------------------------
    // 5. Create Student Log
    // -----------------------------

    const [createdLog] = await StudentLog.create(
      [
        {
          studentId: student._id,
          enrollmentId: enrollment._id,

          requestType: "slc-request",
          status: "pending",

          requestedBy,
          requestedAt: new Date(),

          reason: requestReason.trim(),
        },
      ],
      { session }
    );

    // -----------------------------
    // 6. Commit transaction
    // -----------------------------

    await session.commitTransaction();

    return {
      student,
      enrollment,
      log: createdLog,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};







const requestStudentTransfer = async (transferData, requestedBy) => {
  const {
    studentId,
    transferTo,
    requestReason,
  } = transferData;

  if (!studentId) {
    throw new ApiError(400, "Student ID is required");
  }

  if (!requestedBy) {
    throw new ApiError(401, "Requested by user is required");
  }

  if (!transferTo) {
    throw new ApiError(400, "Transfer destination is required");
  }

  if (!requestReason) {
    throw new ApiError(400, "Request reason is required");
  }

  const {
    districtId,
    blockId,
    centerId,
  } = transferTo;

  if (!districtId || !blockId || !centerId) {
    throw new ApiError(
      400,
      "District, block and center are required for transfer"
    );
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Check student exists
    const student = await Student.findById(studentId).session(session);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    // Find current active/provisional enrollment
    const enrollment = await StudentEnrollment.findOne({
      studentId,
      status: {
        $in: ["active", "provisional"],
      },
    }).session(session);

    if (!enrollment) {
      throw new ApiError(
        404,
        "No active enrollment found for this student"
      );
    }

    // Make sure destination block belongs to destination district
    const block = await Block.findOne({
      _id: blockId,
      districtId,
    }).session(session);

    if (!block) {
      throw new ApiError(
        400,
        "Selected block does not belong to the selected district"
      );
    }

    // Make sure destination center belongs to destination block
    const center = await Center.findOne({
      _id: centerId,
      blockId,
    }).session(session);

    if (!center) {
      throw new ApiError(
        400,
        "Selected center does not belong to the selected block"
      );
    }

    // Create transfer request log
    const [log] = await StudentLog.create(
      [
        {
          studentId,
          enrollmentId: enrollment._id,

          requestType: "transfer-student",
          status: "pending",

          requestedBy,
          requestedAt: new Date(),

          reason: requestReason,

          transferTo: {
            districtId,
            blockId,
            centerId,
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return {
      student,
      enrollment,
      log,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};









// FILE PATH: C:\Users\shubh\OneDrive\Desktop\vikalpaerpv2\backend\src\services\student-management\student.services.js
 const getStudents = async (query = {}) => {
  const {
    search,
    page = 1,
    limit = 20,

    programId,
    batchId,
    districtId,
    blockId,
    centerId,
    class: studentClass,
    board,
    status,

    isActive,
    gender,
    category,
  } = query;

  const currentPage = Math.max(Number(page) || 1, 1);

  const currentLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip = (currentPage - 1) * currentLimit;

  /*
   * ---------------------------------------------------------
   * 1. Build Student filters
   * ---------------------------------------------------------
   */

  const studentMatch = {};

  if (search?.trim()) {
    const searchRegex = new RegExp(
      search.trim(),
      "i"
    );

    studentMatch.$or = [
      { studentSrn: searchRegex },
      { rollNumber: searchRegex },
      { name: searchRegex },
      { fatherName: searchRegex },
      { motherName: searchRegex },
      { personalContact: searchRegex },
      { parentContact: searchRegex },
    ];
  }

  if (isActive !== undefined && isActive !== "") {
    studentMatch.isActive =
      isActive === "true";
  }

  if (gender) {
    studentMatch.gender = gender;
  }

  if (category) {
    studentMatch.category = category;
  }

  /*
   * ---------------------------------------------------------
   * 2. Build Enrollment filters
   * ---------------------------------------------------------
   */

  const enrollmentMatch = {};

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

  if (studentClass !== undefined && studentClass !== "") {
    enrollmentMatch.class = Number(studentClass);
  }

  if (board) {
    enrollmentMatch.board = board;
  }

  if (status) {
    enrollmentMatch.status = status;
  }

  /*
   * ---------------------------------------------------------
   * 3. If enrollment filters exist:
   *
   *    Search StudentEnrollment FIRST.
   *
   *    We do NOT lookup enrollment for every student.
   * ---------------------------------------------------------
   */

  let enrollmentStudentIds = null;

  if (Object.keys(enrollmentMatch).length > 0) {
    enrollmentStudentIds =
      await StudentEnrollment.distinct(
        "studentId",
        enrollmentMatch
      );

    /*
     * No enrollment matched.
     * We can immediately return without touching
     * the Student collection.
     */

    if (enrollmentStudentIds.length === 0) {
      return {
        students: [],
        pagination: {
          page: currentPage,
          limit: currentLimit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage:
            currentPage > 1,
        },
      };
    }

    /*
     * Restrict Student query to only students
     * having matching enrollments.
     */

    studentMatch._id = {
      $in: enrollmentStudentIds,
    };
  }

  /*
   * ---------------------------------------------------------
   * 4. Count + fetch students
   *
   *    Both operations can run in parallel.
   * ---------------------------------------------------------
   */

  const [total, students] =
    await Promise.all([
      Student.countDocuments(studentMatch),

      Student.find(studentMatch)
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(currentLimit)
        .lean(),
    ]);

  /*
   * ---------------------------------------------------------
   * 5. If no students on this page, return immediately.
   * ---------------------------------------------------------
   */

  if (students.length === 0) {
    const totalPages =
      Math.ceil(total / currentLimit);

    return {
      students: [],
      pagination: {
        page: currentPage,
        limit: currentLimit,
        total,
        totalPages,
        hasNextPage:
          currentPage < totalPages,
        hasPreviousPage:
          currentPage > 1,
      },
    };
  }

  /*
   * ---------------------------------------------------------
   * 6. Fetch enrollments ONLY for current page students.
   *
   *    IMPORTANT:
   *    We don't fetch enrollments for all students.
   * ---------------------------------------------------------
   */

  const studentIds = students.map(
    (student) => student._id
  );

  const enrollments =
    await StudentEnrollment.find({
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

  /*
   * ---------------------------------------------------------
   * 7. Attach enrollments to their students.
   * ---------------------------------------------------------
   */

  const enrollmentMap = new Map();

  for (const enrollment of enrollments) {
    const studentId =
      enrollment.studentId.toString();

    if (!enrollmentMap.has(studentId)) {
      enrollmentMap.set(studentId, []);
    }

    enrollmentMap
      .get(studentId)
      .push(enrollment);
  }

  const formattedStudents =
    students.map((student) => ({
      ...student,

      enrollments:
        enrollmentMap.get(
          student._id.toString()
        ) || [],
    }));

  /*
   * ---------------------------------------------------------
   * 8. Pagination
   * ---------------------------------------------------------
   */

  const totalPages =
    Math.ceil(total / currentLimit);

  return {
    students: formattedStudents,

    pagination: {
      page: currentPage,
      limit: currentLimit,
      total,
      totalPages,

      hasNextPage:
        currentPage < totalPages,

      hasPreviousPage:
        currentPage > 1,
    },
  };
};





const getStudentById = async (studentId) => {
  if (!studentId) {
    throw new ApiError(400, "Student ID is required");
  }

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new ApiError(400, "Invalid student ID");
  }

  const student = await Student.findById(studentId)
    .select("-__v")
    .lean();

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  const enrollments = await StudentEnrollment.find({
    studentId: student._id,
  })
    .populate("programId", "programName programCode")
    .populate("batchId", "batchName startYear endYear")
    .populate("districtId", "districtName")
    .populate("blockId", "blockName")
    .populate(
      "centerId",
      "centerName centerCode"
    )
    .select("-__v")
    .sort({ createdAt: -1 })
    .lean();

  return {
    student,
    enrollments,
  };
};




const getStudentEnrollments = async (studentId) => {
  if (!studentId) {
    throw new ApiError(400, "Student ID is required");
  }

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new ApiError(400, "Invalid student ID");
  }

  const student = await Student.findById(studentId)
    .select("_id studentSrn name rollNumber isActive")
    .lean();

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  const enrollments = await StudentEnrollment.find({
    studentId,
  })
    .populate("programId", "programName programCode")
    .populate("batchId", "batchName startYear endYear")
    .populate("districtId", "districtName")
    .populate("blockId", "blockName")
    .populate("centerId", "centerName centerCode")
    .sort({ createdAt: -1 })
    .lean();

  return {
    student,
    enrollments,
  };
};


// =====================================================
// EXPORTS
// =====================================================

export {
  onboardStudent,
  bulkOnboardStudents,
  requestStudentAdd,
  requestStudentRemove,
  requestStudentSLC,
  requestStudentTransfer,
  getStudents,
getStudentById,
getStudentEnrollments
};