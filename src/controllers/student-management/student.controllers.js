import { asyncHandler } from "../../utils/async-handler.js";
import { ApiResponse } from "../../utils/api-response.js";
import XLSX from "xlsx";

import {
  onboardStudent as onboardStudentService,
  bulkOnboardStudents as bulkOnboardStudentsService,
  requestStudentAdd as requestStudentAddService,
  requestStudentRemove as requestStudentRemoveService,
  requestStudentSLC as requestStudentSLCService,
  requestStudentTransfer as requestStudentTransferService,
  getStudents as getStudentsService,
  getStudentById as getStudentByIdService,
  getStudentEnrollments as getStudentEnrollmentsService,
} from "../../services/student-management/student.services.js";

/**
 * @desc    Onboard a new student
 * @route   POST /api/v1/student-management/students/onboard
 * @access  Private
 */
const onboardStudent = asyncHandler(async (req, res) => {
  const student = await onboardStudentService(req.body);


  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        student,
        "Student onboarded successfully"
      )
    );
});

/**
 * @desc    Bulk onboard students
 * @route   POST /api/v1/student-management/students/bulk-onboard
 * @access  Private
 */
const bulkOnboardStudents = asyncHandler(async (req, res) => {
  const result = await bulkOnboardStudentsService(req.file);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        result,
        "Students bulk onboarded successfully"
      )
    );
});

/**
 * @desc    Download student bulk onboarding template
 * @route   GET /api/v1/student-management/students/bulk-onboard/template
 * @access  Private
 */
const downloadBulkOnboardingTemplate = asyncHandler(
  async (req, res) => {
    const headers = [
      // Student Details
      "studentSrn",
      "rollNumber",
      "name",
      "fatherName",
      "motherName",
      "personalContact",
      "parentContact",
      "otherContact",
      "dob",
      "gender",
      "category",
      "address",
      "profileImage",
      "isActive",

      // Enrollment Details
      "programId",
      "batchId",
      "districtId",
      "blockId",
      "centerId",
      "class",
      "board",
      "enrollmentDate",
      "status",

      // Enrollment SLC Details
      "slcSubmitted",
      "slcSubmittedAt",
    ];

    const exampleRows = [
      [
        "SRN001",
        "1",
        "Rahul Kumar",
        "Raj Kumar",
        "Sunita Kumar",
        "9876543210",
        "9876500001",
        "9876500011",
        "15/04/2010",
        "Male",
        "General",
        "Rohtak, Haryana",
        "",
        "true",

        "PROGRAM_ID_1",
        "BATCH_ID_1",
        "DISTRICT_ID_1",
        "BLOCK_ID_1",
        "CENTER_ID_1",
        "10",
        "HBSE",
        "15/04/2026",
        "active",

        "false",
        "",
      ],

      [
        "SRN002",
        "2",
        "Priya Sharma",
        "Suresh Sharma",
        "Meena Sharma",
        "9876543211",
        "9876500002",
        "",
        "22/08/2011",
        "Female",
        "OBC",
        "Gurugram, Haryana",
        "",
        "true",

        "PROGRAM_ID_1",
        "BATCH_ID_1",
        "DISTRICT_ID_1",
        "BLOCK_ID_1",
        "CENTER_ID_1",
        "9",
        "CBSE",
        "15/04/2026",
        "active",

        "false",
        "",
      ],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([
      headers,
      ...exampleRows,
    ]);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Student Onboarding"
    );

    worksheet["!cols"] = headers.map((header) => ({
      wch: Math.max(header.length + 2, 18),
    }));

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="student_bulk_onboarding_template.xlsx"'
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.status(200).send(buffer);
  }
);



/**
 * @desc    Request to add a new student
 * @route   POST /api/v1/student-management/students/request-add
 * @access  Private
 */
const requestStudentAdd = asyncHandler(async (req, res) => {
  const result = await requestStudentAddService(
    req.body,
    req.user._id
  );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        result,
        "Student add request submitted successfully"
      )
    );
});

/**
 * @desc    Request student removal
 * @route   POST /api/v1/student-management/students/request-remove
 * @access  Private
 */
const requestStudentRemove = asyncHandler(async (req, res) => {
  const result = await requestStudentRemoveService({
    ...req.body,
    requestedBy: req.user._id,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        result,
        "Student removal request submitted successfully"
      )
    );
});

/**
 * @desc    Request student SLC
 * @route   POST /api/v1/student-management/students/request-slc
 * @access  Private
 */
const requestStudentSLC = asyncHandler(async (req, res) => {
  const result = await requestStudentSLCService({
    ...req.body,
    requestedBy: req.user._id,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        result,
        "Student SLC request submitted successfully"
      )
    );
});



const requestStudentTransfer = asyncHandler(async (req, res) => {
  const result = await requestStudentTransferService(
    req.body,
    req.user._id
  );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        result,
        "Student transfer request submitted successfully"
      )
    );
});




const getStudents = asyncHandler(async (req, res) => {
  const result = await getStudentsService(req.query);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Students fetched successfully"
      )
    );
});





const getStudentById = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const result = await getStudentByIdService(studentId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Student fetched successfully"
      )
    );
});


const getStudentEnrollments = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const result = await getStudentEnrollmentsService(studentId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Student enrollments fetched successfully"
      )
    );
});

export {
  onboardStudent,
  bulkOnboardStudents,
  downloadBulkOnboardingTemplate,
  requestStudentAdd,
  requestStudentRemove,
  requestStudentSLC,
  requestStudentTransfer,
  getStudents,
  getStudentById,
  getStudentEnrollments
};