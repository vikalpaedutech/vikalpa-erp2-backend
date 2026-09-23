import { asyncHandler } from "../../utils/async-handler.js";
import { ApiResponse } from "../../utils/api-response.js";

import {
  markAttendance as markAttendanceService,
  bulkMarkAttendance as bulkMarkAttendanceService,
  getAttendance as getAttendanceService,

   getStudentAttendance as getStudentAttendanceService,
  getStudentAttendanceSummary as getStudentAttendanceSummaryService,
  getContinuousAbsentStudents as getContinuousAbsentStudentsService,
  getAbsenteeCallingStudents as getAbsenteeCallingStudentsService,
   saveAbsenteeCalling as saveAbsenteeCallingService,
} from "../../services/student-management/studentAttendance.services.js";


// ============================================================
// MARK SINGLE ATTENDANCE
// ============================================================

const markAttendance = asyncHandler(async (req, res) => {
  const result = await markAttendanceService(
    req.body,
    req.user._id
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Attendance marked successfully"
    )
  );
});


// ============================================================
// BULK MARK PRESENT
// ============================================================

const bulkMarkAttendance = asyncHandler(async (req, res) => {
  const result = await bulkMarkAttendanceService(
    req.body,
    req.user._id
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Attendance marked successfully for all selected students"
    )
  );
});


// ============================================================
// GET ATTENDANCE
// ============================================================

const getAttendance = asyncHandler(async (req, res) => {
  const result = await getAttendanceService(
    req.query
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Attendance fetched successfully"
    )
  );
});




const getStudentAttendance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const result = await getStudentAttendanceService({
    studentId,
    ...req.query,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Student attendance fetched successfully"
    )
  );
});


const getStudentAttendanceSummary = asyncHandler(
  async (req, res) => {
    const { studentId } = req.params;

    const result = await getStudentAttendanceSummaryService({
      studentId,
      ...req.query,
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        result,
        "Student attendance summary fetched successfully"
      )
    );
  }
);


const getContinuousAbsentStudents = asyncHandler(
  async (req, res) => {
    const result = await getContinuousAbsentStudentsService(
      req.query
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        result,
        "Continuous absent students fetched successfully"
      )
    );
  }
);

// ============================================================
// GET ABSENTEE CALLING STUDENTS
// ============================================================

const getAbsenteeCallingStudents = asyncHandler(
  async (req, res) => {
    const result =
      await getAbsenteeCallingStudentsService(
          req.query,
  req.user._id
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        result,
        "Absentee calling students fetched successfully"
      )
    );
  }
);





// ==========================================
// SAVE ABSENTEE CALL
// ==========================================

const saveAbsenteeCalling = asyncHandler(
  async (req, res) => {
    const result =
      await saveAbsenteeCallingService(
        req.body,
        req.user._id
      );

    return res.status(201).json(
      new ApiResponse(
        201,
        result,
        "Absentee call saved successfully"
      )
    );
  }
);



export {
  markAttendance,
  bulkMarkAttendance,
  getAttendance,
  getStudentAttendance,
  getStudentAttendanceSummary,
  getContinuousAbsentStudents,
  getAbsenteeCallingStudents,
  saveAbsenteeCalling
};