import mongoose from "mongoose";

import { Student } from "../../models/student-management/student.models.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";
import { StudentAttendance } from "../../models/student-management/studentAttendance.models.js";
import { ApiError } from "../../utils/api-error.js";
import { UserAccess } from "../../models/user-management/userAccess.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";


import {
  getCallingUserAccess,
  hasProgramAccess,
  hasBatchAccess,
  hasRegionAccess,
} from "../../utils/calling-access.utils.js";

// ============================================================
// MARK ATTENDANCE - SINGLE STUDENT
// ============================================================

const markAttendance = async (attendanceData, markedBy) => {
  const {
    enrollmentId,
    date,
    status = "Present",
    remarks,
  } = attendanceData;

  // ----------------------------------------------------------
  // Basic validation
  // ----------------------------------------------------------

  if (!enrollmentId) {
    throw new ApiError(400, "Enrollment ID is required");
  }

  if (!date) {
    throw new ApiError(400, "Attendance date is required");
  }

  if (!markedBy) {
    throw new ApiError(401, "User authentication required");
  }

  if (!mongoose.Types.ObjectId.isValid(enrollmentId)) {
    throw new ApiError(400, "Invalid enrollment ID");
  }

  if (!mongoose.Types.ObjectId.isValid(markedBy)) {
    throw new ApiError(401, "Invalid user");
  }

  // ----------------------------------------------------------
  // Validate date
  // ----------------------------------------------------------

  const attendanceDate = new Date(date);

  if (isNaN(attendanceDate.getTime())) {
    throw new ApiError(400, "Invalid attendance date");
  }

  // ----------------------------------------------------------
  // Validate status
  // ----------------------------------------------------------

  if (!["Present", "Absent"].includes(status)) {
    throw new ApiError(
      400,
      "Attendance status must be Present or Absent"
    );
  }

  // ----------------------------------------------------------
  // Find enrollment
  // ----------------------------------------------------------

  const enrollment = await StudentEnrollment.findById(
    enrollmentId
  );

  if (!enrollment) {
    throw new ApiError(404, "Student enrollment not found");
  }

  // ----------------------------------------------------------
  // Check whether student exists
  // ----------------------------------------------------------

  const student = await Student.findById(enrollment.studentId);

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  // ----------------------------------------------------------
  // Validate enrollment status
  // ----------------------------------------------------------

  const allowedStatuses = [
    "active",
    "provisional",
  ];

  if (!allowedStatuses.includes(enrollment.status)) {
    throw new ApiError(
      400,
      `Attendance cannot be marked for enrollment with status "${enrollment.status}"`
    );
  }

  // ----------------------------------------------------------
  // Normalize date
  //
  // Attendance should represent a calendar day,
  // not a particular time.
  // ----------------------------------------------------------

  const startOfDay = new Date(attendanceDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(attendanceDate);
  endOfDay.setHours(23, 59, 59, 999);

  // ----------------------------------------------------------
  // If Absent:
  //
  // Current business rule:
  // No attendance document = Absent
  //
  // Therefore if someone changes Present -> Absent,
  // delete the existing attendance document.
  // ----------------------------------------------------------

  if (status === "Absent") {
    const deletedAttendance =
      await StudentAttendance.findOneAndDelete({
        enrollmentId: enrollment._id,
        date: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      });

    return {
      studentId: student._id,
      enrollmentId: enrollment._id,
      date: startOfDay,
      status: "Absent",
      attendance: null,
      deleted: Boolean(deletedAttendance),
    };
  }

  // ----------------------------------------------------------
  // Present
  //
  // If already present, update it instead of creating
  // duplicate attendance.
  // ----------------------------------------------------------

  const attendance =
    await StudentAttendance.findOneAndUpdate(
      {
        enrollmentId: enrollment._id,
        date: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      },
      {
        $set: {
          studentId: student._id,
          enrollmentId: enrollment._id,
          date: startOfDay,
          status: "Present",
          markedBy,
          remarks: remarks?.trim() || undefined,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

  return {
    studentId: student._id,
    enrollmentId: enrollment._id,
    date: startOfDay,
    status: "Present",
    attendance,
  };
};


// ============================================================
// BULK MARK ATTENDANCE - PRESENT
// ============================================================

const bulkMarkAttendance = async (
  attendanceData,
  markedBy
) => {
  const {
    date,
    enrollmentIds,
    remarks,
  } = attendanceData;

  // ----------------------------------------------------------
  // Basic validation
  // ----------------------------------------------------------

  if (!date) {
    throw new ApiError(400, "Attendance date is required");
  }

  if (
    !Array.isArray(enrollmentIds) ||
    enrollmentIds.length === 0
  ) {
    throw new ApiError(
      400,
      "At least one enrollment ID is required"
    );
  }

  if (!markedBy) {
    throw new ApiError(401, "User authentication required");
  }

  if (!mongoose.Types.ObjectId.isValid(markedBy)) {
    throw new ApiError(401, "Invalid user");
  }

  // ----------------------------------------------------------
  // Validate date
  // ----------------------------------------------------------

  const attendanceDate = new Date(date);

  if (isNaN(attendanceDate.getTime())) {
    throw new ApiError(400, "Invalid attendance date");
  }

  const startOfDay = new Date(attendanceDate);
  startOfDay.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // Remove duplicate enrollment IDs
  // ----------------------------------------------------------

  const uniqueEnrollmentIds = [
    ...new Set(
      enrollmentIds.map((id) => String(id))
    ),
  ];

  // ----------------------------------------------------------
  // Validate ObjectIds
  // ----------------------------------------------------------

  const invalidIds = uniqueEnrollmentIds.filter(
    (id) => !mongoose.Types.ObjectId.isValid(id)
  );

  if (invalidIds.length > 0) {
    throw new ApiError(
      400,
      "One or more enrollment IDs are invalid"
    );
  }

  const objectIds = uniqueEnrollmentIds.map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  // ----------------------------------------------------------
  // Find enrollments
  // ----------------------------------------------------------

  const enrollments = await StudentEnrollment.find({
    _id: { $in: objectIds },
  }).lean();

  if (enrollments.length !== objectIds.length) {
    const foundIds = new Set(
      enrollments.map((enrollment) =>
        enrollment._id.toString()
      )
    );

    const missingIds = uniqueEnrollmentIds.filter(
      (id) => !foundIds.has(id)
    );

    throw new ApiError(
      404,
      `Enrollment not found: ${missingIds.join(", ")}`
    );
  }

  // ----------------------------------------------------------
  // Validate enrollment status
  // ----------------------------------------------------------

  const allowedStatuses = [
    "active",
    "provisional",
  ];

  const invalidEnrollments = enrollments.filter(
    (enrollment) =>
      !allowedStatuses.includes(enrollment.status)
  );

  if (invalidEnrollments.length > 0) {
    throw new ApiError(
      400,
      "Attendance can only be marked for active or provisional enrollments"
    );
  }

  // ----------------------------------------------------------
  // Prepare attendance operations
  // ----------------------------------------------------------

  const operations = enrollments.map((enrollment) => ({
    updateOne: {
      filter: {
        enrollmentId: enrollment._id,
        date: startOfDay,
      },

      update: {
        $set: {
          studentId: enrollment.studentId,
          enrollmentId: enrollment._id,
          date: startOfDay,
          status: "Present",
          markedBy,
          remarks: remarks?.trim() || undefined,
        },
      },

      upsert: true,
    },
  }));

  // ----------------------------------------------------------
  // Bulk write
  // ----------------------------------------------------------

  const result =
    await StudentAttendance.bulkWrite(
      operations,
      {
        ordered: false,
      }
    );

  return {
    date: startOfDay,
    requested: uniqueEnrollmentIds.length,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    created: result.upsertedCount,
    totalPresent:
      result.matchedCount +
      result.modifiedCount +
      result.upsertedCount,
  };
};


// ============================================================
// GET ATTENDANCE
// ============================================================

const getAttendance = async (queryParams = {}) => {
  const {
    date,
    programId,
    batchId,
    districtId,
    blockId,
    centerId,
    class: studentClass,
    status,
  } = queryParams;



  // ----------------------------------------------------------
  // Date is required
  // ----------------------------------------------------------

  if (!date) {
    throw new ApiError(
      400,
      "Attendance date is required"
    );
  }

  const attendanceDate = new Date(date);

  if (isNaN(attendanceDate.getTime())) {
    throw new ApiError(
      400,
      "Invalid attendance date"
    );
  }

  const startOfDay = new Date(attendanceDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(attendanceDate);
  endOfDay.setHours(23, 59, 59, 999);

  // ----------------------------------------------------------
  // Validate ObjectId filters
  // ----------------------------------------------------------

  const objectIdFilters = {
    programId,
    batchId,
    districtId,
    blockId,
    centerId,
  };

  for (const [field, value] of Object.entries(
    objectIdFilters
  )) {
    if (
      value &&
      !mongoose.Types.ObjectId.isValid(value)
    ) {
      throw new ApiError(
        400,
        `Invalid ${field}`
      );
    }
  }

  // ----------------------------------------------------------
  // Build enrollment filters
  // ----------------------------------------------------------

  const enrollmentMatch = {

    //only active students will be allowed to get attendance data
    status: "active",

  };

  if (programId) {
    enrollmentMatch.programId =
      new mongoose.Types.ObjectId(programId);
  }

  if (batchId) {
    enrollmentMatch.batchId =
      new mongoose.Types.ObjectId(batchId);
  }

  if (districtId) {
    enrollmentMatch.districtId =
      new mongoose.Types.ObjectId(districtId);
  }

  if (blockId) {
    enrollmentMatch.blockId =
      new mongoose.Types.ObjectId(blockId);
  }

  if (centerId) {
    enrollmentMatch.centerId =
      new mongoose.Types.ObjectId(centerId);
  }

  if (studentClass !== undefined) {
    const classNumber = Number(studentClass);

    if (Number.isNaN(classNumber)) {
      throw new ApiError(
        400,
        "class must be a number"
      );
    }

    enrollmentMatch.class = classNumber;
  }

  // ----------------------------------------------------------
  // Get matching enrollments
  // ----------------------------------------------------------

  const enrollments =
    await StudentEnrollment.find(
      enrollmentMatch
    )
      .populate(
        "studentId",
        "studentSrn rollNumber name fatherName motherName isActive"
      )
      .populate(
        "programId",
        "programName programCode"
      )
      .populate(
        "batchId",
        "batchName startYear endYear"
      )
      .populate(
        "districtId",
        "districtName"
      )
      .populate(
        "blockId",
        "blockName"
      )
      .populate(
        "centerId",
        "centerName centerCode"
      )
      .sort({
        class: 1,
        "studentId.rollNumber": 1,
      })
      .lean();

  // ----------------------------------------------------------
  // Get attendance records for this date
  // ----------------------------------------------------------

  const enrollmentIds =
    enrollments.map(
      (enrollment) => enrollment._id
    );

  const attendanceRecords =
    enrollmentIds.length
      ? await StudentAttendance.find({
          enrollmentId: {
            $in: enrollmentIds,
          },
          date: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        })
          .populate(
            "markedBy",
            "name userId"
          )
          .lean()
      : [];

  // ----------------------------------------------------------
  // Map attendance by enrollment ID
  // ----------------------------------------------------------

  const attendanceMap = new Map();

  attendanceRecords.forEach((attendance) => {
    attendanceMap.set(
      attendance.enrollmentId.toString(),
      attendance
    );
  });

  // ----------------------------------------------------------
  // Prepare response
  // ----------------------------------------------------------

  const students = enrollments.map(
    (enrollment) => {
      const attendance =
        attendanceMap.get(
          enrollment._id.toString()
        );

      const currentStatus = attendance
        ? attendance.status
        : "Absent";

      return {
        studentId: enrollment.studentId?._id,
        enrollmentId: enrollment._id,

        student: enrollment.studentId,

        program: enrollment.programId,
        batch: enrollment.batchId,

        district: enrollment.districtId,
        block: enrollment.blockId,
        center: enrollment.centerId,

        class: enrollment.class,
        board: enrollment.board,
        enrollmentStatus: enrollment.status,

        attendance: {
          attendanceId:
            attendance?._id || null,

          date: startOfDay,

          status: currentStatus,

          markedBy:
            attendance?.markedBy || null,

          remarks:
            attendance?.remarks || null,
        },
      };
    }
  );

  // ----------------------------------------------------------
  // Optional attendance status filter
  //
  // Since no record = Absent, filtering is done AFTER
  // determining the effective attendance status.
  // ----------------------------------------------------------

  let filteredStudents = students;

  if (status) {
    const allowedAttendanceStatuses = [
      "Present",
      "Absent",
    ];

    if (
      !allowedAttendanceStatuses.includes(status)
    ) {
      throw new ApiError(
        400,
        "Attendance status must be Present or Absent"
      );
    }

    filteredStudents = students.filter(
      (student) =>
        student.attendance.status === status
    );
  }

  // ----------------------------------------------------------
  // Summary
  // ----------------------------------------------------------

  const present = students.filter(
    (student) =>
      student.attendance.status === "Present"
  ).length;

  const absent = students.length - present;

  const total = students.length;

  return {
    date: startOfDay,

    filters: {
      programId: programId || null,
      batchId: batchId || null,
      districtId: districtId || null,
      blockId: blockId || null,
      centerId: centerId || null,
      class:
        studentClass !== undefined
          ? Number(studentClass)
          : null,
      status: status || null,
    },

    summary: {
      total,
      present,
      absent,
      attendancePercentage:
        total > 0
          ? Number(
              ((present / total) * 100).toFixed(2)
            )
          : 0,
    },

    students: filteredStudents,
  };
};






const normalizeDate = (date) => {
  const parsedDate = new Date(date);

  if (isNaN(parsedDate.getTime())) {
    throw new ApiError(400, "Invalid date");
  }

  parsedDate.setHours(0, 0, 0, 0);

  return parsedDate;
};


const getDateRange = (fromDate, toDate) => {
  const startDate = normalizeDate(fromDate);
  const endDate = normalizeDate(toDate);

  if (startDate > endDate) {
    throw new ApiError(400, "fromDate cannot be greater than toDate");
  }

  const dates = [];

  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    startDate,
    endDate,
    dates,
  };
};


// ============================================================
// 1. GET INDIVIDUAL STUDENT DATE-WISE ATTENDANCE
// ============================================================

const getStudentAttendance = async ({
  studentId,
  programId,
  batchId,
  fromDate,
  toDate,
}) => {
  if (!studentId) {
    throw new ApiError(400, "studentId is required");
  }

  if (!programId) {
    throw new ApiError(400, "programId is required");
  }

  if (!batchId) {
    throw new ApiError(400, "batchId is required");
  }

  if (!fromDate || !toDate) {
    throw new ApiError(400, "fromDate and toDate are required");
  }

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new ApiError(400, "Invalid studentId");
  }

  if (!mongoose.Types.ObjectId.isValid(programId)) {
    throw new ApiError(400, "Invalid programId");
  }

  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new ApiError(400, "Invalid batchId");
  }

  const { startDate, endDate, dates } = getDateRange(
    fromDate,
    toDate
  );

  const student = await Student.findById(studentId).lean();

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  if (!student.isActive) {
    throw new ApiError(400, "Student is not active");
  }

  const enrollment = await StudentEnrollment.findOne({
    studentId,
    programId,
    batchId,
  })
    .populate("programId", "programName programCode")
    .populate("batchId", "batchName startYear endYear")
    .populate("districtId", "districtName")
    .populate("blockId", "blockName")
    .populate("centerId", "centerName")
    .lean();

  if (!enrollment) {
    throw new ApiError(
      404,
      "Student enrollment not found for this program and batch"
    );
  }

  const attendanceRecords = await StudentAttendance.find({
    enrollmentId: enrollment._id,
    date: {
      $gte: startDate,
      $lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1),
    },
  })
    .select("date status remarks markedBy")
    .lean();

  const attendanceMap = new Map();

  attendanceRecords.forEach((record) => {
    const key = new Date(record.date).toISOString().split("T")[0];

    attendanceMap.set(key, record);
  });

  const attendance = dates.map((date) => {
    const key = date.toISOString().split("T")[0];

    const record = attendanceMap.get(key);

    return {
      date: key,
      status: record?.status || "Absent",
      remarks: record?.remarks || null,
    };
  });

  return {
    student: {
      _id: student._id,
      studentSrn: student.studentSrn,
      rollNumber: student.rollNumber,
      name: student.name,
      fatherName: student.fatherName,
      motherName: student.motherName,
    },

    enrollment: {
      _id: enrollment._id,
      class: enrollment.class,
      board: enrollment.board,
      status: enrollment.status,

      program: enrollment.programId,
      batch: enrollment.batchId,

      district: enrollment.districtId,
      block: enrollment.blockId,
      center: enrollment.centerId,
    },

    dateRange: {
      fromDate,
      toDate,
      totalDays: dates.length,
    },

    attendance,
  };
};


// ============================================================
// 2. GET INDIVIDUAL STUDENT ATTENDANCE SUMMARY
// ============================================================

const getStudentAttendanceSummary = async ({
  studentId,
  programId,
  batchId,
  fromDate,
  toDate,
}) => {
  if (!studentId) {
    throw new ApiError(400, "studentId is required");
  }

  if (!programId) {
    throw new ApiError(400, "programId is required");
  }

  if (!batchId) {
    throw new ApiError(400, "batchId is required");
  }

  if (!fromDate || !toDate) {
    throw new ApiError(400, "fromDate and toDate are required");
  }

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new ApiError(400, "Invalid studentId");
  }

  if (!mongoose.Types.ObjectId.isValid(programId)) {
    throw new ApiError(400, "Invalid programId");
  }

  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new ApiError(400, "Invalid batchId");
  }

  const { startDate, endDate, dates } = getDateRange(
    fromDate,
    toDate
  );

  const student = await Student.findById(studentId).lean();

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  if (!student.isActive) {
    throw new ApiError(400, "Student is not active");
  }

  const enrollment = await StudentEnrollment.findOne({
    studentId,
    programId,
    batchId,
  })
    .populate("programId", "programName programCode")
    .populate("batchId", "batchName startYear endYear")
    .lean();

  if (!enrollment) {
    throw new ApiError(
      404,
      "Student enrollment not found for this program and batch"
    );
  }

  const attendanceRecords = await StudentAttendance.find({
    enrollmentId: enrollment._id,
    date: {
      $gte: startDate,
      $lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1),
    },
    status: "Present",
  })
    .select("date status")
    .lean();

  const present = attendanceRecords.length;

  const totalDays = dates.length;

  const absent = totalDays - present;

  const attendancePercentage =
    totalDays > 0
      ? Number(((present / totalDays) * 100).toFixed(2))
      : 0;

  return {
    student: {
      _id: student._id,
      studentSrn: student.studentSrn,
      name: student.name,
      fatherName: student.fatherName,
    },

    program: enrollment.programId,

    batch: enrollment.batchId,

    dateRange: {
      fromDate,
      toDate,
      totalDays,
    },

    summary: {
      totalDays,
      present,
      absent,
      attendancePercentage,
    },
  };
};


// ============================================================
// 3. GET CONTINUOUSLY ABSENT ACTIVE STUDENTS
// ============================================================

const getContinuousAbsentStudents = async ({
  fromDate,
  toDate,
  days,
  programId,
  batchId,
  districtId,
  blockId,
  centerId,
  class: classValue,
}) => {
  if (!fromDate || !toDate) {
    throw new ApiError(400, "fromDate and toDate are required");
  }

  const requiredDays = Number(days);

  if (!requiredDays || requiredDays < 1) {
    throw new ApiError(
      400,
      "days must be a valid number greater than 0"
    );
  }

  const { startDate, endDate, dates } = getDateRange(
    fromDate,
    toDate
  );

  // ------------------------------------------------------------
  // Validate optional ObjectIds
  // ------------------------------------------------------------

  const objectIdFields = {
    programId,
    batchId,
    districtId,
    blockId,
    centerId,
  };

  for (const [field, value] of Object.entries(objectIdFields)) {
    if (value && !mongoose.Types.ObjectId.isValid(value)) {
      throw new ApiError(400, `Invalid ${field}`);
    }
  }

  // ------------------------------------------------------------
  // Find only active students
  // ------------------------------------------------------------

  const studentMatch = {
    isActive: true,
  };

  // ------------------------------------------------------------
  // Enrollment filters
  // ------------------------------------------------------------

  const enrollmentMatch = {
    status: {
      $in: ["active", "provisional"],
    },
  };

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

  if (classValue !== undefined) {
    const classNumber = Number(classValue);

    if (isNaN(classNumber)) {
      throw new ApiError(400, "Invalid class");
    }

    enrollmentMatch.class = classNumber;
  }

  // ------------------------------------------------------------
  // Get active students matching enrollment
  // ------------------------------------------------------------

  const students = await Student.find(studentMatch)
    .select(
      "studentSrn name fatherName personalContact parentContact otherContact"
    )
    .lean();

  if (!students.length) {
    return {
      requiredContinuousAbsentDays: requiredDays,
      dateRange: {
        fromDate,
        toDate,
      },
      totalStudents: 0,
      students: [],
    };
  }

  const studentIds = students.map((student) => student._id);

  const enrollments = await StudentEnrollment.find({
    ...enrollmentMatch,
    studentId: { $in: studentIds },
  })
    .populate("districtId", "districtName")
    .populate("blockId", "blockName")
    .populate("centerId", "centerName")
    .lean();

  if (!enrollments.length) {
    return {
      requiredContinuousAbsentDays: requiredDays,
      dateRange: {
        fromDate,
        toDate,
      },
      totalStudents: 0,
      students: [],
    };
  }

  // ------------------------------------------------------------
  // Get attendance records for all matching enrollments
  // ------------------------------------------------------------

  const enrollmentIds = enrollments.map(
    (enrollment) => enrollment._id
  );

  const attendanceRecords = await StudentAttendance.find({
    enrollmentId: { $in: enrollmentIds },
    date: {
      $gte: startDate,
      $lte: new Date(
        endDate.getTime() + 24 * 60 * 60 * 1000 - 1
      ),
    },
    status: "Present",
  })
    .select("enrollmentId date status")
    .lean();

  // ------------------------------------------------------------
  // Create attendance lookup
  // ------------------------------------------------------------

  const attendanceMap = new Set();

  attendanceRecords.forEach((record) => {
    const dateKey = new Date(record.date)
      .toISOString()
      .split("T")[0];

    attendanceMap.add(
      `${record.enrollmentId.toString()}_${dateKey}`
    );
  });

  // ------------------------------------------------------------
  // Student lookup
  // ------------------------------------------------------------

  const studentMap = new Map();

  students.forEach((student) => {
    studentMap.set(student._id.toString(), student);
  });

  // ------------------------------------------------------------
  // Check continuous absent streak
  // ------------------------------------------------------------

  const result = [];

  for (const enrollment of enrollments) {
    const student = studentMap.get(
      enrollment.studentId.toString()
    );

    if (!student) {
      continue;
    }

    let currentAbsentStreak = 0;
    let maxAbsentStreak = 0;

    for (const date of dates) {
      const dateKey = date.toISOString().split("T")[0];

      const attendanceKey =
        `${enrollment._id.toString()}_${dateKey}`;

      const isPresent = attendanceMap.has(attendanceKey);

      if (!isPresent) {
        currentAbsentStreak += 1;

        if (currentAbsentStreak > maxAbsentStreak) {
          maxAbsentStreak = currentAbsentStreak;
        }
      } else {
        currentAbsentStreak = 0;
      }
    }

    if (maxAbsentStreak >= requiredDays) {
      result.push({
        studentSrn: student.studentSrn,
        name: student.name,
        fatherName: student.fatherName,
        personalContact: student.personalContact,
        parentContact: student.parentContact,
        otherContact: student.otherContact,

        districtName:
          enrollment.districtId?.districtName || null,

        blockName:
          enrollment.blockId?.blockName || null,

        centerName:
          enrollment.centerId?.centerName || null,
      });
    }
  }

  return {
    requiredContinuousAbsentDays: requiredDays,

    dateRange: {
      fromDate,
      toDate,
    },

    totalStudents: result.length,

    students: result,
  };
};




// ============================================================
// 4. GET CURRENT ABSENT STUDENTS FOR ABSENTEE CALLING
// ============================================================
const getAbsenteeCallingStudents = async (queryParams, userId) => {
  const {
    date,
    programId,
    batchId,
    districtId,
    blockId,
    centerId,
    class: classValue,
  } = queryParams;
  // ----------------------------------------------------------
  // Date validation
  // ----------------------------------------------------------

  if (!date) {
    throw new ApiError(
      400,
      "Attendance date is required"
    );
  }

  const attendanceDate = new Date(date);

  if (isNaN(attendanceDate.getTime())) {
    throw new ApiError(
      400,
      "Invalid attendance date"
    );
  }

  const startOfDay = new Date(attendanceDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(attendanceDate);
  endOfDay.setHours(23, 59, 59, 999);

  // ----------------------------------------------------------
  // Validate ObjectId filters
  // ----------------------------------------------------------

  const objectIdFields = {
    programId,
    batchId,
    districtId,
    blockId,
    centerId,
  };

  for (const [field, value] of Object.entries(
    objectIdFields
  )) {
    if (
      value &&
      !mongoose.Types.ObjectId.isValid(value)
    ) {
      throw new ApiError(
        400,
        `Invalid ${field}`
      );
    }
  }

  // ----------------------------------------------------------
  // Build enrollment filters
  //
  // Only currently active enrollments should appear
  // in absentee calling.
  // ----------------------------------------------------------

  const enrollmentMatch = {
    status: "active",
  };

  if (programId) {
    enrollmentMatch.programId =
      new mongoose.Types.ObjectId(programId);
  }

  if (batchId) {
    enrollmentMatch.batchId =
      new mongoose.Types.ObjectId(batchId);
  }

  if (districtId) {
    enrollmentMatch.districtId =
      new mongoose.Types.ObjectId(districtId);
  }

  if (blockId) {
    enrollmentMatch.blockId =
      new mongoose.Types.ObjectId(blockId);
  }

  if (centerId) {
    enrollmentMatch.centerId =
      new mongoose.Types.ObjectId(centerId);
  }

  if (classValue !== undefined && classValue !== "") {
    const classNumber = Number(classValue);

    if (isNaN(classNumber)) {
      throw new ApiError(
        400,
        "Invalid class"
      );
    }

    enrollmentMatch.class = classNumber;
  }


  


  



  // ----------------------------------------------------------
  // Find active enrollments
  // ----------------------------------------------------------

  const enrollments =
    await StudentEnrollment.find(
      enrollmentMatch
    )
      .populate(
        "studentId",
        "studentSrn rollNumber name fatherName motherName personalContact parentContact otherContact isActive"
      )
      .populate(
        "programId",
        "programName programCode"
      )
      .populate(
        "batchId",
        "batchName startYear endYear"
      )
      .populate(
        "districtId",
        "districtName"
      )
      .populate(
        "blockId",
        "blockName"
      )
      .populate(
        "centerId",
        "centerName centerCode"
      )
      .sort({
        class: 1,
        "studentId.rollNumber": 1,
      })
      .lean();

  // ----------------------------------------------------------
  // Only active students
  // ----------------------------------------------------------

  const activeEnrollments =
    enrollments.filter(
      (enrollment) =>
        enrollment.studentId?.isActive === true
    );

  if (!activeEnrollments.length) {
    return {
      date: startOfDay,

      filters: {
        programId: programId || null,
        batchId: batchId || null,
        districtId: districtId || null,
        blockId: blockId || null,
        centerId: centerId || null,
        class:
          classValue !== undefined &&
          classValue !== ""
            ? Number(classValue)
            : null,
      },

      totalStudents: 0,

      totalAbsent: 0,

      students: [],
    };
  }

  // ----------------------------------------------------------
  // Get today's attendance records
  //
  // IMPORTANT:
  //
  // Only Present records are required.
  //
  // Why?
  //
  // No record = Absent
  // Absent record = Absent
  // Present record = Present
  //
  // Therefore we can simply find Present records
  // and exclude those students.
  // ----------------------------------------------------------

  const enrollmentIds =
    activeEnrollments.map(
      (enrollment) => enrollment._id
    );

  const presentAttendance =
    await StudentAttendance.find({
      enrollmentId: {
        $in: enrollmentIds,
      },

      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },

      status: "Present",
    })
      .select(
        "enrollmentId date status markedBy remarks"
      )
      .lean();

  // ----------------------------------------------------------
  // Create Present enrollment lookup
  // ----------------------------------------------------------

  const presentEnrollmentIds =
    new Set(
      presentAttendance.map(
        (attendance) =>
          attendance.enrollmentId.toString()
      )
    );

  // ----------------------------------------------------------
  // Remove Present students
  //
  // Remaining students are currently Absent.
  // ----------------------------------------------------------

  const previousCalls =
  await CallingAttempt.find({
    enrollmentId: {
      $in: activeEnrollments.map(
        (enrollment) => enrollment._id
      ),
    },

    attendanceDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  })
    .sort({
      calledAt: -1,
    })
    .lean();


  const absentStudents =
  activeEnrollments
    .filter(
      (enrollment) =>
        !presentEnrollmentIds.has(
          enrollment._id.toString()
        )
    )
    .map((enrollment) => {
      const previousCall =
        previousCalls.find(
          (call) =>
            call.enrollmentId?.toString() ===
            enrollment._id.toString()
        );

      return {
        studentId:
          enrollment.studentId?._id,

        enrollmentId:
          enrollment._id,

        student:
          enrollment.studentId,

        program:
          enrollment.programId,

        batch:
          enrollment.batchId,

        district:
          enrollment.districtId,

        block:
          enrollment.blockId,

        center:
          enrollment.centerId,

        class:
          enrollment.class,

        board:
          enrollment.board,

        enrollmentStatus:
          enrollment.status,

        attendance: {
          date: startOfDay,
          status: "Absent",
        },

        calling: previousCall
          ? {
              outcome:
                previousCall.outcome,

              remarks:
                previousCall.remarks || "",

              calledAt:
                previousCall.calledAt,

              calledBy:
                previousCall.calledBy,
            }
          : null,
      };
    });
  // ----------------------------------------------------------
  // Response
  // ----------------------------------------------------------

  return {
    date: startOfDay,

    filters: {
      programId: programId || null,
      batchId: batchId || null,
      districtId: districtId || null,
      blockId: blockId || null,
      centerId: centerId || null,
      class:
        classValue !== undefined &&
        classValue !== ""
          ? Number(classValue)
          : null,
    },

    totalStudents:
      activeEnrollments.length,

    totalAbsent:
      absentStudents.length,

    students:
      absentStudents,
  };
};





// ============================================================
// SAVE ABSENTEE CALL
// ============================================================

const saveAbsenteeCalling = async (
  data,
  userId
) => {
  const {
    studentId,
    enrollmentId,
    attendanceDate,
    outcome,
    remarks,
  } = data;

  if (!studentId) {
    throw new ApiError(
      400,
      "studentId is required"
    );
  }

  if (!enrollmentId) {
    throw new ApiError(
      400,
      "enrollmentId is required"
    );
  }

  if (!attendanceDate) {
    throw new ApiError(
      400,
      "attendanceDate is required"
    );
  }

  if (!outcome) {
    throw new ApiError(
      400,
      "outcome is required"
    );
  }

  const allowedOutcomes = [
    "answered",
    "not-answered",
    "busy",
    "switched-off",
    "wrong-number",
    "number-not-available",
    "call-back-requested",
    "not-interested",
    "completed",
    "other",
  ];

  if (!allowedOutcomes.includes(outcome)) {
    throw new ApiError(
      400,
      "Invalid calling outcome"
    );
  }

  const parsedDate =
    new Date(attendanceDate);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    throw new ApiError(
      400,
      "Invalid attendanceDate"
    );
  }

  const startOfDay =
    new Date(parsedDate);

  startOfDay.setHours(
    0,
    0,
    0,
    0
  );

  const endOfDay =
    new Date(parsedDate);

  endOfDay.setHours(
    23,
    59,
    59,
    999
  );

  const enrollment =
    await StudentEnrollment.findOne({
      _id: enrollmentId,
      studentId,
      status: "active",
    }).lean();

  if (!enrollment) {
    throw new ApiError(
      404,
      "Active student enrollment not found"
    );
  }

  /*
   * Check that the caller has access
   * to this student.
   */

  const access =
    await getCallingUserAccess(
      userId
    );

  if (
    !hasProgramAccess(
      access,
      enrollment.programId
    )
  ) {
    throw new ApiError(
      403,
      "You do not have access to this student's program"
    );
  }

  if (
    !hasBatchAccess(
      access,
      enrollment.batchId
    )
  ) {
    throw new ApiError(
      403,
      "You do not have access to this student's batch"
    );
  }

  if (
    !hasRegionAccess(
      access.regionAccess,
      {
        districtId:
          enrollment.districtId,
        blockId:
          enrollment.blockId,
        centerId:
          enrollment.centerId,
      }
    )
  ) {
    throw new ApiError(
      403,
      "You do not have access to this student's region"
    );
  }

  /*
   * Save a new calling attempt.
   */

  const attempt =
    await CallingAttempt.create({
      callingTaskId: null,

      studentId,

      enrollmentId,

      attendanceDate:
        startOfDay,

      calledBy:
        userId,

      outcome,

      remarks:
        remarks?.trim() || "",
    });

  return attempt;
};

export {
  markAttendance,
  bulkMarkAttendance,
  getAttendance,

    getStudentAttendance,
  getStudentAttendanceSummary,
  getContinuousAbsentStudents,
  getAbsenteeCallingStudents ,
saveAbsenteeCalling
};