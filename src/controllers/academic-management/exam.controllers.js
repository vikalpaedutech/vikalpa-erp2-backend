import mongoose from "mongoose";

import { Exam } from "../../models/academic-management/exam.models.js";

import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";

import { Student } from "../../models/student-management/student.models.js";

import { StudentMark } from "../../models/student-management/studentMark.models.js";

import { UserAccess } from "../../models/user-management/userAccess.models.js";

import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";


/*
==========================================================
HELPER FUNCTIONS
==========================================================
*/


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
      (role) =>
        role?.roleCode === "admin" ||
        role?.code === "admin"
    )
  );
};


/*
==========================================================
GET USER PROGRAM + BATCH ACCESS
==========================================================
*/

const getUserProgramBatchAccess = async (userId) => {
  const userAccess = await UserAccess.findOne({
    userId,
  }).lean();

  if (!userAccess) {
    return {
      programIds: [],
      batchIds: [],
    };
  }

  return {
    programIds: userAccess.programIds || [],
    batchIds: userAccess.batchIds || [],
  };
};


/*
==========================================================
CHECK PROGRAM + BATCH ACCESS
==========================================================
*/

const checkProgramBatchAccess = async ({
  userId,
  programId,
  batchId,
}) => {
  const {
    programIds,
    batchIds,
  } = await getUserProgramBatchAccess(userId);


  const programAllowed =
    programIds.some(
      (id) =>
        id.toString() ===
        programId.toString()
    );


  const batchAllowed =
    batchIds.some(
      (id) =>
        id.toString() ===
        batchId.toString()
    );


  return (
    programAllowed &&
    batchAllowed
  );
};


/*
==========================================================
GET USER REGION ACCESS
==========================================================
*/

const getUserRegionAccess = async (
  userId
) => {
  return UserRegionAccess.find({
    userId,
  }).lean();
};


/*
==========================================================
BUILD ACCESSIBLE ENROLLMENT FILTER
==========================================================

Rules:

global
  -> all students

district
  -> all students inside district

block
  -> all students inside block

center
  -> only students inside that center

IMPORTANT:

center access must NOT be expanded into
district/block access.
==========================================================
*/

const buildRegionEnrollmentFilter = async (
  userId
) => {
  const regionAccess =
    await getUserRegionAccess(
      userId
    );


  if (!regionAccess.length) {
    return null;
  }


  /*
  --------------------------------------------------------
  GLOBAL ACCESS
  --------------------------------------------------------
  */

  const hasGlobalAccess =
    regionAccess.some(
      (access) =>
        access.scope === "global"
    );


  if (hasGlobalAccess) {
    return {};
  }


  /*
  --------------------------------------------------------
  COLLECT DIRECT ACCESS IDS
  --------------------------------------------------------
  */

  const districtIds = [
    ...new Set(
      regionAccess
        .filter(
          (access) =>
            access.scope ===
              "district" &&
            access.districtId
        )
        .map((access) =>
          access.districtId.toString()
        )
    ),
  ];


  const blockIds = [
    ...new Set(
      regionAccess
        .filter(
          (access) =>
            access.scope === "block" &&
            access.blockId
        )
        .map((access) =>
          access.blockId.toString()
        )
    ),
  ];


  const centerIds = [
    ...new Set(
      regionAccess
        .filter(
          (access) =>
            access.scope === "center" &&
            access.centerId
        )
        .map((access) =>
          access.centerId.toString()
        )
    ),
  ];


  /*
  --------------------------------------------------------
  NO VALID ACCESS
  --------------------------------------------------------
  */

  if (
    !districtIds.length &&
    !blockIds.length &&
    !centerIds.length
  ) {
    return null;
  }


  /*
  --------------------------------------------------------
  REGION CONDITIONS
  --------------------------------------------------------

  Enrollment already contains:

  districtId
  blockId
  centerId

  Therefore:

  district access -> districtId
  block access    -> blockId
  center access   -> centerId
  --------------------------------------------------------
  */

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
    return null;
  }


  return {
    $or: regionConditions,
  };
};


/*
==========================================================
CHECK REGION ACCESS FOR ONE ENROLLMENT
==========================================================
*/

const checkEnrollmentRegionAccess = async ({
  userId,
  districtId,
  blockId,
  centerId,
}) => {
  const regionAccess =
    await getUserRegionAccess(
      userId
    );


  if (!regionAccess.length) {
    return false;
  }


  return regionAccess.some(
    (access) => {

      /*
      Global
      */

      if (
        access.scope ===
        "global"
      ) {
        return true;
      }


      /*
      District
      */

      if (
        access.scope ===
          "district" &&
        access.districtId &&
        districtId &&
        access.districtId.toString() ===
          districtId.toString()
      ) {
        return true;
      }


      /*
      Block
      */

      if (
        access.scope ===
          "block" &&
        access.blockId &&
        blockId &&
        access.blockId.toString() ===
          blockId.toString()
      ) {
        return true;
      }


      /*
      Center

      IMPORTANT:
      Center access only matches
      centerId.
      */

      if (
        access.scope ===
          "center" &&
        access.centerId &&
        centerId &&
        access.centerId.toString() ===
          centerId.toString()
      ) {
        return true;
      }


      return false;
    }
  );
};


/*
==========================================================
CREATE EXAM
==========================================================
*/

export const createExam = async (
  req,
  res
) => {
  try {

    const {
      examName,
      examCode,
      examDate,
      subject,
      examType,
      maximumMarks,
      programId,
      batchId,
      board,
      class: examClass,
      marksUploadWithinDays,
      description,
      isThereAnyAttachment,
      isActive,
    } = req.body;


    /*
    --------------------------------------------------------
    REQUIRED FIELDS
    --------------------------------------------------------
    */

    if (
      !examName ||
      !examCode ||
      !examDate ||
      !subject ||
      maximumMarks === undefined ||
      !programId ||
      !batchId
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Required exam fields are missing",
        success: false,
      });
    }


    /*
    --------------------------------------------------------
    VALIDATE OBJECT IDS
    --------------------------------------------------------
    */

    if (
      !isValidObjectId(
        programId
      ) ||
      !isValidObjectId(
        batchId
      )
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Invalid programId or batchId",
        success: false,
      });
    }


    /*
    --------------------------------------------------------
    DUPLICATE EXAM CODE
    --------------------------------------------------------
    */

    const existingExam =
      await Exam.findOne({
        examCode:
          examCode.trim(),
      });


    if (existingExam) {
      return res.status(409).json({
        statusCode: 409,
        message:
          "Exam with this exam code already exists",
        success: false,
      });
    }


    /*
    --------------------------------------------------------
    CREATE
    --------------------------------------------------------
    */

    const exam =
      await Exam.create({
        examName:
          examName.trim(),

        examCode:
          examCode.trim(),

        examDate,

        subject:
          subject.trim(),

        examType:
          examType?.trim() || "",

        maximumMarks,

        programId,

        batchId,

        board:
          board?.trim(),

        class:
          examClass,

        marksUploadWithinDays,

        description:
          description?.trim(),

        isThereAnyAttachment:
          isThereAnyAttachment ??
          false,

        createdBy:
          req.user._id,

        isActive:
          isActive ?? true,
      });


    return res.status(201).json({
      statusCode: 201,
      data: exam,
      message:
        "Exam created successfully",
      success: true,
    });

  } catch (error) {

    console.error(
      "CREATE EXAM ERROR:",
      error
    );


    return res.status(500).json({
      statusCode: 500,
      message:
        error.message ||
        "Failed to create exam",
      success: false,
    });
  }
};


/*
==========================================================
GET ALL EXAMS
==========================================================

For non-admin:

Program + Batch access is enforced.

For admin:

All exams can be viewed.

Frontend filters can still send:

programId
batchId
subject
board
class
isActive
search
==========================================================
*/

export const getExams = async (
  req,
  res
) => {
  try {

    const userId =
      getUserId(req);

    const {
      page = 1,
      limit = 20,
      search,
      programId,
      batchId,
      subject,
      examType,
      board,
      class: examClass,
      isActive,
    } = req.query;


    const currentPage =
      Math.max(
        Number(page) || 1,
        1
      );


    const currentLimit =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );


    const skip =
      (currentPage - 1) *
      currentLimit;


    const filter = {};


    /*
    --------------------------------------------------------
    SEARCH
    --------------------------------------------------------
    */

    if (
      search?.trim()
    ) {

      filter.$or = [
        {
          examName: {
            $regex:
              search.trim(),
            $options: "i",
          },
        },

        {
          examCode: {
            $regex:
              search.trim(),
            $options: "i",
          },
        },

        {
          subject: {
            $regex:
              search.trim(),
            $options: "i",
          },
        },
      ];
    }


    /*
    --------------------------------------------------------
    ADMIN / NON ADMIN ACCESS
    --------------------------------------------------------
    */

    if (
      !isAdminUser(req)
    ) {

      const {
        programIds,
        batchIds,
      } =
        await getUserProgramBatchAccess(
          userId
        );


      /*
      No program/batch access
      */

      if (
        !programIds.length ||
        !batchIds.length
      ) {

        return res.status(200).json({
          statusCode: 200,

          data: {
            exams: [],

            pagination: {
              page:
                currentPage,

              limit:
                currentLimit,

              total: 0,

              totalPages: 0,

              hasNextPage:
                false,

              hasPreviousPage:
                currentPage > 1,
            },
          },

          message:
            "Exams fetched successfully",

          success: true,
        });
      }


      /*
      ------------------------------------------------------
      ENFORCE USER PROGRAM/BATCH ACCESS
      ------------------------------------------------------
      */

      filter.programId = {
        $in: programIds,
      };

      filter.batchId = {
        $in: batchIds,
      };


      /*
      If frontend sends programId,
      verify it belongs to user.
      */

      if (programId) {

        const allowed =
          programIds.some(
            (id) =>
              id.toString() ===
              programId.toString()
          );


        if (!allowed) {

          return res.status(403).json({
            statusCode: 403,

            message:
              "You do not have access to this program",

            success: false,
          });
        }


        filter.programId =
          programId;
      }


      /*
      If frontend sends batchId,
      verify it belongs to user.
      */

      if (batchId) {

        const allowed =
          batchIds.some(
            (id) =>
              id.toString() ===
              batchId.toString()
          );


        if (!allowed) {

          return res.status(403).json({
            statusCode: 403,

            message:
              "You do not have access to this batch",

            success: false,
          });
        }


        filter.batchId =
          batchId;
      }

    } else {

      /*
      ------------------------------------------------------
      ADMIN
      ------------------------------------------------------
      */

      if (programId) {
        filter.programId =
          programId;
      }


      if (batchId) {
        filter.batchId =
          batchId;
      }
    }


    /*
    --------------------------------------------------------
    OTHER FILTERS
    --------------------------------------------------------
    */

    if (subject) {
      filter.subject =
        subject;
    }


    if (board) {
      filter.board =
        board;
    }


    if (
      examClass !==
        undefined &&
      examClass !== ""
    ) {

      filter.class =
        Number(examClass);
    }


    if (
      isActive !==
      undefined
    ) {

      filter.isActive =
        isActive === "true";
    }


    /*
    --------------------------------------------------------
    QUERY
    --------------------------------------------------------
    */

    const [
      total,
      exams,
    ] =
      await Promise.all([

        Exam.countDocuments(
          filter
        ),

        Exam.find(filter)
          .populate(
            "programId",
            "programName programCode"
          )
          .populate(
            "batchId",
            "batchName startYear endYear"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .sort({
            createdAt: -1,
            _id: -1,
          })
          .skip(skip)
          .limit(
            currentLimit
          )
          .lean(),
      ]);


    const totalPages =
      Math.ceil(
        total /
          currentLimit
      );


    return res.status(200).json({

      statusCode: 200,

      data: {

        exams,

        pagination: {

          page:
            currentPage,

          limit:
            currentLimit,

          total,

          totalPages,

          hasNextPage:
            currentPage <
            totalPages,

          hasPreviousPage:
            currentPage > 1,
        },
      },

      message:
        "Exams fetched successfully",

      success: true,
    });

  } catch (error) {

    console.error(
      "GET EXAMS ERROR:",
      error
    );


    return res.status(500).json({
      statusCode: 500,

      message:
        error.message ||
        "Failed to fetch exams",

      success: false,
    });
  }
};


/*
==========================================================
GET EXAM BY ID
==========================================================

Non-admin users can only open an exam
belonging to their assigned program + batch.
==========================================================
*/

export const getExamById = async (
  req,
  res
) => {

  try {

    const userId =
      getUserId(req);

    const {
      examId,
    } = req.params;


    if (
      !isValidObjectId(
        examId
      )
    ) {

      return res.status(400).json({
        statusCode: 400,

        message:
          "Invalid examId",

        success: false,
      });
    }


    const exam =
      await Exam.findById(
        examId
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
          "createdBy",
          "name email"
        )
        .lean();


    if (!exam) {

      return res.status(404).json({
        statusCode: 404,

        message:
          "Exam not found",

        success: false,
      });
    }


    /*
    --------------------------------------------------------
    PROGRAM + BATCH ACCESS
    --------------------------------------------------------
    */

    if (
      !isAdminUser(req)
    ) {

      const allowed =
        await checkProgramBatchAccess({
          userId,

          programId:
            exam.programId._id,

          batchId:
            exam.batchId._id,
        });


      if (!allowed) {

        return res.status(403).json({
          statusCode: 403,

          message:
            "You do not have access to this exam",

          success: false,
        });
      }
    }


    return res.status(200).json({

      statusCode: 200,

      data: exam,

      message:
        "Exam fetched successfully",

      success: true,
    });

  } catch (error) {

    console.error(
      "GET EXAM BY ID ERROR:",
      error
    );


    return res.status(500).json({
      statusCode: 500,

      message:
        error.message ||
        "Failed to fetch exam",

      success: false,
    });
  }
};





/*
==========================================================
GET EXAM STUDENTS
==========================================================

GET:

/academic-management/exams/:examId/students

Query params:

page
limit
search
status
districtId
centerId

The backend applies:

1. Exam program + batch
2. User program + batch access
3. User region access
4. Selected district filter
5. Selected center filter
6. Student search

Region filters are optional.

Student search is independent of district/center.
==========================================================
*/

export const getExamStudents = async (
  req,
  res
) => {
  try {


    const userId =
      getUserId(req);

    const {
      examId,
    } = req.params;


    const {
      page = 1,
      limit = 50,
      search,
      status,
      districtId,
      centerId,
    } = req.query;


    /*
    --------------------------------------------------------
    VALIDATE EXAM ID
    --------------------------------------------------------
    */

    if (
      !isValidObjectId(
        examId
      )
    ) {

      return res.status(400).json({
        statusCode: 400,

        message:
          "Invalid examId",

        success: false,
      });
    }


    /*
    --------------------------------------------------------
    VALIDATE DISTRICT ID
    --------------------------------------------------------
    */

    if (
      districtId &&
      !isValidObjectId(
        districtId
      )
    ) {

      return res.status(400).json({
        statusCode: 400,

        message:
          "Invalid districtId",

        success: false,
      });
    }


    /*
    --------------------------------------------------------
    VALIDATE CENTER ID
    --------------------------------------------------------
    */

    if (
      centerId &&
      !isValidObjectId(
        centerId
      )
    ) {

      return res.status(400).json({
        statusCode: 400,

        message:
          "Invalid centerId",

        success: false,
      });
    }


    /*
    --------------------------------------------------------
    GET EXAM
    --------------------------------------------------------
    */

    const exam =
      await Exam.findById(
        examId
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
          "createdBy",
          "name email"
        )
        .lean();


    if (!exam) {

      return res.status(404).json({
        statusCode: 404,

        message:
          "Exam not found",

        success: false,
      });
    }


    /*
    --------------------------------------------------------
    EXAM MUST BE ACTIVE
    --------------------------------------------------------
    */

    if (
      !exam.isActive
    ) {

      return res.status(400).json({
        statusCode: 400,

        message:
          "This exam is inactive",

        success: false,
      });
    }


    /*
    --------------------------------------------------------
    PROGRAM + BATCH ACCESS
    --------------------------------------------------------
    */

    if (
      !isAdminUser(req)
    ) {

      const programBatchAllowed =
        await checkProgramBatchAccess({
          userId,

          programId:
            exam.programId._id,

          batchId:
            exam.batchId._id,
        });


      if (
        !programBatchAllowed
      ) {

        return res.status(403).json({
          statusCode: 403,

          message:
            "You do not have access to this exam",

          success: false,
        });
      }
    }


    /*
    --------------------------------------------------------
    PAGINATION
    --------------------------------------------------------
    */

    const currentPage =
      Math.max(
        Number(page) || 1,
        1
      );


    const currentLimit =
      Math.min(
        Math.max(
          Number(limit) || 50,
          1
        ),
        100
      );


    const skip =
      (currentPage - 1) *
      currentLimit;


    /*
    --------------------------------------------------------
    ENROLLMENT FILTER
    --------------------------------------------------------

    Base filter:

    Program + Batch of this exam
    --------------------------------------------------------
    */

    const enrollmentFilter = {

      programId:
        exam.programId._id,

      batchId:
        exam.batchId._id,
    };


    /*
    --------------------------------------------------------
    STATUS FILTER
    --------------------------------------------------------
    */

    if (status) {

      enrollmentFilter.status =
        status;
    }


    /*
    --------------------------------------------------------
    USER REGION ACCESS
    --------------------------------------------------------

    For non-admin users:

    global
        -> no region restriction

    district
        -> district access

    block
        -> block access

    center
        -> center access
    --------------------------------------------------------
    */

    if (
      !isAdminUser(req)
    ) {

      const regionFilter =
        await buildRegionEnrollmentFilter(
          userId
        );


      /*
      User has no region access
      */

      if (
        regionFilter === null
      ) {

        return res.status(200).json({

          statusCode: 200,

          data: {

            exam,

            students: [],

            pagination: {

              page:
                currentPage,

              limit:
                currentLimit,

              total: 0,

              totalPages: 0,

              hasNextPage:
                false,

              hasPreviousPage:
                currentPage > 1,
            },
          },

          message:
            "Exam students fetched successfully",

          success: true,
        });
      }


      /*
      Global access

      regionFilter = {}

      Therefore no region restriction
      is required.
      */

      if (
        Object.keys(
          regionFilter
        ).length
      ) {

        enrollmentFilter.$or =
          regionFilter.$or;
      }
    }


    /*
    --------------------------------------------------------
    SELECTED DISTRICT FILTER
    --------------------------------------------------------

    IMPORTANT:

    This is an additional filter.

    It does NOT replace the user's
    region access restriction.
    --------------------------------------------------------
    */

    if (
      districtId
    ) {

      enrollmentFilter.districtId =
        districtId;
    }


    /*
    --------------------------------------------------------
    SELECTED CENTER FILTER
    --------------------------------------------------------

    This is also an additional filter.

    For CC users this will normally be
    the main region filter.

    For other users it further narrows
    the selected district.
    --------------------------------------------------------
    */

    if (
      centerId
    ) {

      enrollmentFilter.centerId =
        centerId;
    }


    /*
    --------------------------------------------------------
    STUDENT SEARCH
    --------------------------------------------------------

    Student search is independent.

    It can be used:

    1. Without district
    2. Without center
    3. With district
    4. With center
    5. With district + center
    --------------------------------------------------------
    */

    if (
      search?.trim()
    ) {

      const searchRegex = {
        $regex:
          search.trim(),
        $options: "i",
      };


      const matchingStudents =
        await Student.find({
          $or: [

            {
              name:
                searchRegex,
            },

            {
              studentSrn:
                searchRegex,
            },

            {
              rollNumber:
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
          ],
        })
          .select("_id")
          .lean();


      const studentIds =
        matchingStudents.map(
          (student) =>
            student._id
        );


      /*
      ------------------------------------------------------
      NO MATCHING STUDENTS
      ------------------------------------------------------
      */

      if (
        !studentIds.length
      ) {

        return res.status(200).json({

          statusCode: 200,

          data: {

            exam,

            students: [],

            pagination: {

              page:
                currentPage,

              limit:
                currentLimit,

              total: 0,

              totalPages: 0,

              hasNextPage:
                false,

              hasPreviousPage:
                currentPage > 1,
            },
          },

          message:
            "Exam students fetched successfully",

          success: true,
        });
      }


      enrollmentFilter.studentId = {
        $in: studentIds,
      };
    }


    /*
    --------------------------------------------------------
    GET ENROLLMENTS
    --------------------------------------------------------
    */

    const [
      total,
      enrollments,
    ] =
      await Promise.all([

        StudentEnrollment.countDocuments(
          enrollmentFilter
        ),

        StudentEnrollment.find(
          enrollmentFilter
        )
          .populate(
            "studentId",
            "studentSrn rollNumber name fatherName motherName gender category"
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
            createdAt: 1,
            _id: 1,
          })
          .skip(skip)
          .limit(
            currentLimit
          )
          .lean(),
      ]);


    /*
    --------------------------------------------------------
    NO ENROLLMENTS
    --------------------------------------------------------
    */

    if (
      !enrollments.length
    ) {

      const totalPages =
        Math.ceil(
          total /
            currentLimit
        );


      return res.status(200).json({

        statusCode: 200,

        data: {

          exam,

          students: [],

          pagination: {

            page:
              currentPage,

            limit:
              currentLimit,

            total,

            totalPages,

            hasNextPage:
              currentPage <
              totalPages,

            hasPreviousPage:
              currentPage > 1,
          },
        },

        message:
          "Exam students fetched successfully",

        success: true,
      });
    }


    /*
    --------------------------------------------------------
    GET EXISTING MARKS
    --------------------------------------------------------
    */

    const enrollmentIds =
      enrollments.map(
        (enrollment) =>
          enrollment._id
      );


    const studentIds =
      enrollments
        .map(
          (enrollment) =>
            enrollment.studentId?._id
        )
        .filter(Boolean);


    const marks =
      await StudentMark.find({
        examId,

        $or: [

          {
            enrollmentId: {
              $in:
                enrollmentIds,
            },
          },

          {
            studentId: {
              $in:
                studentIds,
            },
          },
        ],
      })
        .select(
          "_id examId enrollmentId studentId obtainedMarks attachments filledBy createdAt updatedAt"
        )
        .populate(
          "filledBy",
          "name email"
        )
        .lean();


    /*
    --------------------------------------------------------
    CREATE MARK MAP
    --------------------------------------------------------
    */

    const markMap =
      new Map();


    marks.forEach(
      (mark) => {

        /*
        Prefer enrollmentId
        */

        if (
          mark.enrollmentId
        ) {

          markMap.set(
            mark.enrollmentId.toString(),
            mark
          );
        }


        /*
        Also map by studentId
        */

        if (
          mark.studentId
        ) {

          markMap.set(
            mark.studentId.toString(),
            mark
          );
        }
      }
    );


    /*
    --------------------------------------------------------
    MERGE STUDENTS + MARKS
    --------------------------------------------------------
    */

    const students =
      enrollments.map(
        (enrollment) => {

          const markByEnrollment =
            markMap.get(
              enrollment._id.toString()
            );


          const markByStudent =
            enrollment.studentId?._id
              ? markMap.get(
                  enrollment.studentId._id.toString()
                )
              : null;


          const mark =
            markByEnrollment ||
            markByStudent ||
            null;


          return {

            enrollmentId:
              enrollment._id,

            studentId:
              enrollment.studentId?._id ||
              null,

            student:
              enrollment.studentId ||
              null,

            program:
              enrollment.programId ||
              null,

            batch:
              enrollment.batchId ||
              null,

            district:
              enrollment.districtId ||
              null,

            block:
              enrollment.blockId ||
              null,

            center:
              enrollment.centerId ||
              null,

            class:
              enrollment.class,

            board:
              enrollment.board,

            status:
              enrollment.status,

            mark,
          };
        }
      );


    /*
    --------------------------------------------------------
    PAGINATION
    --------------------------------------------------------
    */

    const totalPages =
      Math.ceil(
        total /
          currentLimit
      );


    /*
    --------------------------------------------------------
    RESPONSE
    --------------------------------------------------------
    */

    return res.status(200).json({

      statusCode: 200,

      data: {

        exam,

        students,

        pagination: {

          page:
            currentPage,

          limit:
            currentLimit,

          total,

          totalPages,

          hasNextPage:
            currentPage <
            totalPages,

          hasPreviousPage:
            currentPage > 1,
        },
      },

      message:
        "Exam students fetched successfully",

      success: true,
    });

  } catch (error) {

    console.error(
      "GET EXAM STUDENTS ERROR:",
      error
    );


    return res.status(500).json({

      statusCode: 500,

      message:
        error.message ||
        "Failed to fetch exam students",

      success: false,
    });
  }
};

/*
==========================================================
UPDATE EXAM
==========================================================
*/

export const updateExam = async (
  req,
  res
) => {

  try {

    const {
      examId,
    } = req.params;


    const {
      examName,
      examCode,
      examDate,
      subject,
      examType,
      maximumMarks,
      programId,
      batchId,
      board,
      class: examClass,
      marksUploadWithinDays,
      description,
      isThereAnyAttachment,
      isActive,
    } = req.body;


    /*
    --------------------------------------------------------
    VALIDATE ID
    --------------------------------------------------------
    */

    if (
      !isValidObjectId(
        examId
      )
    ) {

      return res.status(400).json({
        statusCode: 400,

        message:
          "Invalid examId",

        success: false,
      });
    }


    /*
    --------------------------------------------------------
    FIND EXAM
    --------------------------------------------------------
    */

    const exam =
      await Exam.findById(
        examId
      );


    if (!exam) {

      return res.status(404).json({
        statusCode: 404,

        message:
          "Exam not found",

        success: false,
      });
    }


    /*
    --------------------------------------------------------
    DUPLICATE EXAM CODE
    --------------------------------------------------------
    */

    if (
      examCode !==
      undefined
    ) {

      const existingExam =
        await Exam.findOne({

          examCode:
            examCode.trim(),

          _id: {
            $ne:
              examId,
          },
        });


      if (
        existingExam
      ) {

        return res.status(409).json({
          statusCode: 409,

          message:
            "Exam with this exam code already exists",

          success: false,
        });
      }
    }


    /*
    --------------------------------------------------------
    UPDATE
    --------------------------------------------------------
    */

    if (
      examName !==
      undefined
    ) {
      exam.examName =
        examName.trim();
    }


    if (
      examCode !==
      undefined
    ) {
      exam.examCode =
        examCode.trim();
    }


    if (
      examDate !==
      undefined
    ) {
      exam.examDate =
        examDate;
    }


    if (
      subject !==
      undefined
    ) {
      exam.subject =
        subject.trim();
    }

    if (examType !== undefined) {
      exam.examType = examType?.trim() || "";
    }


    if (
      maximumMarks !==
      undefined
    ) {
      exam.maximumMarks =
        maximumMarks;
    }


    if (
      programId !==
      undefined
    ) {

      if (
        !isValidObjectId(
          programId
        )
      ) {

        return res.status(400).json({
          statusCode: 400,

          message:
            "Invalid programId",

          success: false,
        });
      }

      exam.programId =
        programId;
    }


    if (
      batchId !==
      undefined
    ) {

      if (
        !isValidObjectId(
          batchId
        )
      ) {

        return res.status(400).json({
          statusCode: 400,

          message:
            "Invalid batchId",

          success: false,
        });
      }

      exam.batchId =
        batchId;
    }


    if (
      board !==
      undefined
    ) {
      exam.board =
        board?.trim();
    }


    if (
      examClass !==
      undefined
    ) {
      exam.class =
        examClass;
    }


    if (
      marksUploadWithinDays !==
      undefined
    ) {
      exam.marksUploadWithinDays =
        marksUploadWithinDays;
    }


    if (
      description !==
      undefined
    ) {
      exam.description =
        description?.trim();
    }


    if (
      isThereAnyAttachment !==
      undefined
    ) {
      exam.isThereAnyAttachment =
        isThereAnyAttachment;
    }


    if (
      isActive !==
      undefined
    ) {
      exam.isActive =
        isActive;
    }


    await exam.save();


    return res.status(200).json({

      statusCode: 200,

      data: exam,

      message:
        "Exam updated successfully",

      success: true,
    });

  } catch (error) {

    console.error(
      "UPDATE EXAM ERROR:",
      error
    );


    return res.status(500).json({

      statusCode: 500,

      message:
        error.message ||
        "Failed to update exam",

      success: false,
    });
  }
};


/*
==========================================================
DELETE / DEACTIVATE EXAM
==========================================================
*/

export const deleteExam = async (
  req,
  res
) => {

  try {

    const {
      examId,
    } = req.params;


    if (
      !isValidObjectId(
        examId
      )
    ) {

      return res.status(400).json({
        statusCode: 400,

        message:
          "Invalid examId",

        success: false,
      });
    }


    const exam =
      await Exam.findById(
        examId
      );


    if (!exam) {

      return res.status(404).json({
        statusCode: 404,

        message:
          "Exam not found",

        success: false,
      });
    }


    exam.isActive =
      false;


    await exam.save();


    return res.status(200).json({

      statusCode: 200,

      data: exam,

      message:
        "Exam deactivated successfully",

      success: true,
    });

  } catch (error) {

    console.error(
      "DELETE EXAM ERROR:",
      error
    );


    return res.status(500).json({

      statusCode: 500,

      message:
        error.message ||
        "Failed to deactivate exam",

      success: false,
    });
  }
};