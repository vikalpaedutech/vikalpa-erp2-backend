import mongoose from "mongoose";

import { UserAttendance } from "../../models/user-management/userAttendance.models.js";

import { User } from "../../models/user.models.js";

import {
  uploadToSpaces,
  deleteFromSpaces,
} from "../../utils/space.utils.js";


import { syncGamificationPointsForActivity } from "../../services/gamification-management/gamificationCalculation.services.js";
import { HolidayCalendar } from "../../models/hr-management/holidayCalendar.models.js";
import { EmployeeHolidaySelections } from "../../models/hr-management/employeeHolidaySelections.models.js";
import { UserDesignation } from "../../models/user-management/userDesignation.models.js";

import { UserLeave } from "../../models/user-management/userLeave.models.js";
import { UserLeaveBalance } from "../../models/user-management/userLeaveBalance.models.js";
import { LeaveType } from "../../models/hr-management/leaveType.models.js";
import { LeaveBalanceTransaction } from "../../models/user-management/leaveBalanceTransaction.models.js";
import { consumeLeaveCredits } from "../../services/hr-management/leaveCreditLedger.service.js";
import { createLeaveAttendance, removeLeaveAttendance } from "../../services/user-managment/userAttendance.services.js";


// ============================================================
// CREATE USER ATTENDANCE
// ============================================================

export const createUserAttendance = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    const {
      userId,
      attendanceType,
      status,
      date,
      checkIn,
      checkOut,
      visitedLocation,
      latitude,
      longitude,
      markedBy,
      manualAttendanceReason,
      remarks,
    } = req.body;


    // ========================================================
    // USER ID
    // ========================================================

    const attendanceUserId =
      userId || loggedInUserId;


    // ========================================================
    // VALIDATE USER ID
    // ========================================================

    if (
      !mongoose.Types.ObjectId.isValid(
        attendanceUserId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId.",
      });
    }


    // ========================================================
    // LEAVE CANNOT BE CREATED MANUALLY
    // ========================================================

    if (status === "Leave") {
      return res.status(400).json({
        success: false,
        message:
          "Leave attendance is automatically created after leave approval.",
      });
    }


    // ========================================================
    // IF MARKING SOMEONE ELSE'S ATTENDANCE
    // ========================================================

    const actualMarkedBy =
      markedBy || loggedInUserId;

    const isMarkingAnotherUser =
      String(attendanceUserId) !==
      String(loggedInUserId);


    if (isMarkingAnotherUser) {
    }


    // ========================================================
    // DATE
    // ========================================================

    if (!date) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance date is required.",
      });
    }


    const attendanceDate =
      new Date(date);


    if (
      isNaN(
        attendanceDate.getTime()
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid attendance date.",
      });
    }


    // ========================================================
    // NORMALIZE DATE TO DATE ONLY
    // ========================================================

    attendanceDate.setUTCHours(
      0,
      0,
      0,
      0
    );


    // ========================================================
    // ATTENDANCE TYPE VALIDATION
    // ========================================================

    if (!attendanceType) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance type is required.",
      });
    }


    // ========================================================
    // STATUS VALIDATION
    // ========================================================

    if (!status) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance status is required.",
      });
    }


    // ========================================================
    // SPECIAL ATTENDANCE TYPE VALIDATION
    // ========================================================

    const locationRequiredTypes = [
      "Orientation",
      "Feild Visit",
      "Event",
      "Center Visit",
    ];


    if (
      locationRequiredTypes.includes(
        attendanceType
      ) &&
      !visitedLocation?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Visited location is required for this attendance type.",
      });
    }


    if (
      locationRequiredTypes.includes(
        attendanceType
      ) &&
      !remarks?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Remarks are required for this attendance type.",
      });
    }


    // ========================================================
    // CHECK DUPLICATE ATTENDANCE
    // ========================================================

    const existingAttendance =
      await UserAttendance.findOne({
        userId: attendanceUserId,
        date: attendanceDate,
        attendanceType,
      });


    if (existingAttendance) {
      return res.status(409).json({
        success: false,
        message:
          "Attendance already exists for this date and attendance type.",
      });
    }


    // ========================================================
    // CHECK EXISTING LEAVE ATTENDANCE
    // ========================================================

    const existingLeaveAttendance =
      await UserAttendance.findOne({
        userId: attendanceUserId,
        date: attendanceDate,
        attendanceSource:
          "Leave",
      });


    if (existingLeaveAttendance) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance cannot be manually marked because the user is already on approved leave.",
      });
    }


    // ========================================================
    // PHOTO UPLOAD
    // ========================================================

    let photo = {
      url: "https://placehold.co/200x200",
      localPath: "",
    };


    if (req.file) {
      const uploadedFile =
        await uploadToSpaces({
          file: req.file,
          folder: "user-attendance",
          fileName:
            `${attendanceUserId}/${Date.now()}-${req.file.originalname}`,
        });


      photo = {
        url: uploadedFile.url,
        localPath:
          uploadedFile.key,
      };
    }


    // ========================================================
    // CREATE ATTENDANCE
    // ========================================================

    const attendance =
      await UserAttendance.create({
        userId:
          attendanceUserId,

        attendanceType,

        status,

        leaveId: null,

        attendanceSource:
          "Manual",

        leaveDurationType:
          null,

        leaveHalfDayType:
          null,

        photo,

        date:
          attendanceDate,

        // A manual attendance mark is the employee's check-in event.
        // If a checkIn is explicitly supplied (for controlled/admin flows),
        // preserve it; otherwise save the current server time.
        checkIn:
          checkIn || new Date(),

        checkOut:
          checkOut || null,

        visitedLocation:
          visitedLocation?.trim() ||
          null,

        latitude:
          latitude !== undefined
            ? Number(latitude)
            : 0,

        longitude:
          longitude !== undefined
            ? Number(longitude)
            : 0,

        markedBy:
          actualMarkedBy,

        manualAttendanceReason:
          manualAttendanceReason?.trim() ||
          null,

        remarks:
          remarks?.trim() ||
          null,
      });


    // ========================================================
    // RESPONSE
    // ========================================================

    await syncGamificationPointsForActivity({ userId: attendanceUserId, date: attendanceDate }).catch((error) => console.error("Gamification point sync failed:", error));

    return res.status(201).json({
      success: true,
      message:
        "User attendance created successfully.",
      data: attendance,
    });

  } catch (error) {

    console.error(
      "CREATE USER ATTENDANCE ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to create user attendance.",
    });
  }
};

// ============================================================
// GET USER ATTENDANCE
// ============================================================

export const getUserAttendance = async (
  req,
  res
) => {
  try {

    const {
      userId,
      status,
      attendanceType,
      attendanceSource,
      fromDate,
      toDate,
      page = 1,
      limit = 20,
    } = req.query;


    const filter = {};


    // ========================================================
    // USER FILTER
    // ========================================================

    /*
      If userId is provided:
        → fetch attendance of that particular user.

      If userId is NOT provided:
        → fetch attendance of ALL users.

      IMPORTANT:
        This API is NOT restricted using isAdmin.
        Access to this API/page will be controlled separately.
    */

    if (userId) {

      if (
        !mongoose.Types.ObjectId.isValid(
          userId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid userId.",
        });
      }


      filter.userId =
        userId;
    }


    // ========================================================
    // STATUS
    // ========================================================

    if (status) {
      filter.status =
        status;
    }


    // ========================================================
    // ATTENDANCE TYPE
    // ========================================================

    if (attendanceType) {
      filter.attendanceType =
        attendanceType;
    }


    // ========================================================
    // ATTENDANCE SOURCE
    // ========================================================

    if (attendanceSource) {
      filter.attendanceSource =
        attendanceSource;
    }


    // ========================================================
    // DATE FILTER
    // ========================================================

    if (
      fromDate ||
      toDate
    ) {

      const dateFilter = {};


      // ------------------------------------------------------
      // FROM DATE
      // ------------------------------------------------------

      if (fromDate) {

        const startDate =
          new Date(
            `${fromDate}T00:00:00.000Z`
          );


        if (
          isNaN(
            startDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid fromDate.",
          });
        }


        dateFilter.$gte =
          startDate;
      }


      // ------------------------------------------------------
      // TO DATE
      // ------------------------------------------------------

      if (toDate) {

        const endDate =
          new Date(
            `${toDate}T23:59:59.999Z`
          );


        if (
          isNaN(
            endDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid toDate.",
          });
        }


        dateFilter.$lte =
          endDate;
      }


      filter.date =
        dateFilter;
    }


    // ========================================================
    // DEBUG
    // ========================================================



    // ========================================================
    // PAGINATION
    // ========================================================

    const pageNumber =
      Math.max(
        Number(page),
        1
      );


    const limitNumber =
      Math.min(
        Math.max(
          Number(limit),
          1
        ),
        5000
      );


    const skip =
      (pageNumber - 1) *
      limitNumber;


    // ========================================================
    // QUERY
    // ========================================================

    const [
      attendance,
      total,
    ] = await Promise.all([

      UserAttendance
        .find(filter)

        .populate(
          "userId",
          "name email userId"
        )

        .populate(
          "markedBy",
          "name email userId"
        )

        .populate({ path: "leaveId", populate: { path: "leaveTypeId", select: "name code" } })

        .sort({
          date: -1,
          createdAt: -1,
        })

        .skip(skip)

        .limit(
          limitNumber
        ),

      UserAttendance.countDocuments(
        filter
      ),
    ]);


    // ========================================================
    // BACKFILL LEGACY CHECK-IN IN RESPONSE
    // ========================================================
    //
    // Older manual attendance records were created before
    // checkIn was automatically stored. For those legacy
    // records, createdAt represents the attendance marking time.
    // We expose it as checkIn without rewriting historical data.
    //
    attendance.forEach((record) => {
      if (
        record.attendanceSource === "Manual" &&
        !record.checkIn &&
        record.createdAt
      ) {
        record.checkIn = record.createdAt;
      }
    });

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({

      success: true,

      message:
        "User attendance fetched successfully.",

      data:
        attendance,

      pagination: {
        total,

        page:
          pageNumber,

        limit:
          limitNumber,

        totalPages:
          Math.ceil(
            total /
              limitNumber
          ),
      },
    });

  } catch (error) {

    console.error(
      "GET USER ATTENDANCE ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch user attendance.",
    });
  }
};

// ============================================================
// GET MY ATTENDANCE
// ============================================================

// Resolve applicable fixed holidays and selected floating holidays as virtual
// attendance rows. No synthetic documents are persisted in UserAttendance.
async function getMyAttendanceHolidayRows(userId, fromDate, toDate) {
  if (!fromDate || !toDate || fromDate > toDate) return [];
  const holidays = await HolidayCalendar.find({
    year: { $gte: Number(fromDate.slice(0, 4)), $lte: Number(toDate.slice(0, 4)) },
    date: { $gte: fromDate, $lte: toDate },
    isActive: true
  }).lean();
  if (!holidays.length) return [];
  const assignments = await UserDesignation.find({ userId, isActive: true })
    .populate({ path: "designationId", select: "departmentId", populate: { path: "departmentId", select: "_id" } })
    .lean();
  const designationIds = new Set(assignments.map(x => String(x.designationId?._id || x.designationId)).filter(Boolean));
  const departmentIds = new Set(assignments.map(x => String(x.designationId?.departmentId?._id || x.designationId?.departmentId || "")).filter(Boolean));
  const selections = await EmployeeHolidaySelections.find({ employeeId: userId, status: "Confirmed" }).lean();
  const selectedIds = new Set(selections.flatMap(x => (x.selectedHolidays || []).map(h => String(h.holidayId))));
  return holidays.filter(holiday => {
    const rule = holiday.applicableTo || {};
    const eligible = rule.allEmployees !== false
      || (rule.employees || []).some(id => String(id) === String(userId))
      || (rule.designations || []).some(id => designationIds.has(String(id)))
      || (rule.departments || []).some(id => departmentIds.has(String(id)));
    return eligible && (!holiday.isOptional || selectedIds.has(String(holiday._id)));
  }).map(holiday => ({
    _id: `holiday-${holiday._id}`,
    userId: String(userId),
    date: `${holiday.date}T00:00:00.000Z`,
    status: "Holiday",
    attendanceType: "Holiday",
    attendanceSource: "Holiday",
    holidayId: holiday._id,
    holidayName: holiday.name,
    holidayType: holiday.type,
    isOptionalHoliday: Boolean(holiday.isOptional),
    checkIn: null,
    checkOut: null,
    remarks: holiday.name
  }));
}

export const getMyUserAttendance = async (req, res) => {
  try {
    // Always scope this endpoint to the authenticated user. Do not mutate
    // req.query and delegate to getUserAttendance: Express 5 exposes req.query
    // through a getter, so changes to req.query may not persist between reads.
    const userId = req.user?._id;
    console.log(userId)
    

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    const {
      status,
      attendanceType,
      attendanceSource,
      fromDate,
      toDate,
      page = 1,
      limit = 100,
    } = req.query;

    // Intentionally do not accept userId from the query string here.
    const filter = { userId };

    if (status) filter.status = status;
    if (attendanceType) filter.attendanceType = attendanceType;
    if (attendanceSource) filter.attendanceSource = attendanceSource;

    if (fromDate || toDate) {
      const dateFilter = {};

      if (fromDate) {
        const startDate = new Date(`${fromDate}T00:00:00.000Z`);
        if (Number.isNaN(startDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid fromDate.",
          });
        }
        dateFilter.$gte = startDate;
      }

      if (toDate) {
        const endDate = new Date(`${toDate}T23:59:59.999Z`);
        if (Number.isNaN(endDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid toDate.",
          });
        }
        dateFilter.$lte = endDate;
      }

      filter.date = dateFilter;
    }

    const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(
      Math.max(Number.parseInt(limit, 10) || 100, 1),
      5000
    );
    const skip = (pageNumber - 1) * limitNumber;

    const [attendance, total] = await Promise.all([
      UserAttendance.find(filter)
        .populate("userId", "name email userId")
        .populate("markedBy", "name email userId")
        .populate({ path: "leaveId", populate: { path: "leaveTypeId", select: "name code" } })
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNumber),
      UserAttendance.countDocuments(filter),
    ]);

    // Preserve the legacy check-in fallback used by the general endpoint.
    attendance.forEach((record) => {
      if (
        record.attendanceSource === "Manual" &&
        !record.checkIn &&
        record.createdAt
      ) {
        record.checkIn = record.createdAt;
      }
    });

    const holidayRows = await getMyAttendanceHolidayRows(userId, fromDate, toDate);
    const existingDateKeys = new Set(attendance
      .filter(record => ["Present", "WFH"].includes(record.status))
      .map(record => record.date instanceof Date ? record.date.toISOString().slice(0, 10) : String(record.date || "").slice(0, 10)));
    // Actual attendance takes precedence when an employee works on a holiday.
    const visibleHolidayRows = holidayRows.filter(row => !existingDateKeys.has(String(row.date).slice(0, 10)));
    const combinedAttendance = [...attendance, ...visibleHolidayRows].sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.status(200).json({
      success: true,
      message: "User attendance fetched successfully.",
      data: combinedAttendance,
      pagination: {
        total: total + visibleHolidayRows.length,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil((total + visibleHolidayRows.length) / limitNumber),
      },
    });
  } catch (error) {
    console.error("GET MY USER ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch my attendance.",
    });
  }
};


// ============================================================
// GET USER ATTENDANCE BY ID
// ============================================================

export const getUserAttendanceById =
  async (
    req,
    res
  ) => {

    try {

      const {
        id,
      } = req.params;


      const loggedInUserId =
        req.user?._id;


      // ======================================================
      // GET ACTUAL LOGGED-IN USER
      // ======================================================

      const loggedInUser =
        await User.findById(
          loggedInUserId
        ).select(
          "_id isAdmin"
        );


      if (!loggedInUser) {
        return res.status(404).json({
          success: false,
          message:
            "Logged-in user not found.",
        });
      }


      const isAdmin =
        loggedInUser.isAdmin === true;


      // ======================================================
      // VALIDATE ID
      // ======================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid attendance ID.",
        });
      }


      // ======================================================
      // FIND ATTENDANCE
      // ======================================================

      const attendance =
        await UserAttendance
          .findById(id)

          .populate(
            "userId",
            "name email userId"
          )

          .populate(
            "markedBy",
            "name email userId"
          )

          .populate(
            "leaveId"
          );


      if (!attendance) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance not found.",
        });
      }


      // ======================================================
      // ACCESS CHECK
      // ======================================================

      /*
        Admin can view any attendance.

        Normal user can view:
        1. Their own attendance.
        2. Attendance marked by themselves.
      */

      if (
        !isAdmin &&
        String(
          attendance.userId?._id
        ) !==
          String(
            loggedInUserId
          ) &&
        String(
          attendance.markedBy?._id
        ) !==
          String(
            loggedInUserId
          )
      ) {

        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to view this attendance.",
        });
      }


      // ======================================================
      // RESPONSE
      // ======================================================

      return res.status(200).json({

        success: true,

        message:
          "User attendance fetched successfully.",

        data:
          attendance,
      });

    } catch (error) {

      console.error(
        "GET USER ATTENDANCE BY ID ERROR:",
        error
      );


      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to fetch user attendance.",
      });
    }
  };


// ============================================================
// UPDATE USER ATTENDANCE
// ============================================================

export const updateUserAttendance =
  async (
    req,
    res
  ) => {

    try {

      const {
        id,
      } = req.params;


      const loggedInUserId =
        req.user._id;


      // ======================================================
      // GET ACTUAL LOGGED-IN USER
      // ======================================================

      const loggedInUser =
        await User.findById(
          loggedInUserId
        ).select(
          "_id isAdmin"
        );


      if (!loggedInUser) {
        return res.status(404).json({
          success: false,
          message:
            "Logged-in user not found.",
        });
      }


      const isAdmin =
        loggedInUser.isAdmin === true;


      // ======================================================
      // VALIDATE ID
      // ======================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid attendance ID.",
        });
      }


      // ======================================================
      // FIND ATTENDANCE
      // ======================================================

      const attendance =
        await UserAttendance
          .findById(id);


      if (!attendance) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance not found.",
        });
      }


      // ======================================================
      // LEAVE ATTENDANCE CANNOT BE UPDATED
      // ======================================================

      if (
        attendance.attendanceSource ===
        "Leave"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Leave attendance cannot be manually updated.",
        });
      }


      // ======================================================
      // ACCESS CHECK
      // ======================================================

      if (
        !isAdmin &&
        String(
          attendance.userId
        ) !==
          String(
            loggedInUserId
          ) &&
        String(
          attendance.markedBy
        ) !==
          String(
            loggedInUserId
          )
      ) {

        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to update this attendance.",
        });
      }


      // ======================================================
      // OLD PHOTO KEY
      // ======================================================

      const oldPhotoKey =
        attendance.photo?.localPath ||
        null;


      // ======================================================
      // NEW PHOTO
      // ======================================================

      let newPhotoUploaded =
        false;

      let uploadedPhoto =
        null;


      if (req.file) {

        uploadedPhoto =
          await uploadToSpaces({
            file: req.file,

            folder:
              "user-attendance",

            fileName:
              `${attendance.userId}/${Date.now()}-${req.file.originalname}`,
          });


        newPhotoUploaded =
          true;
      }


      // ======================================================
      // UPDATE BASIC FIELDS
      // ======================================================

      const allowedFields = [
        "attendanceType",
        "status",
        "date",
        "checkIn",
        "checkOut",
        "visitedLocation",
        "latitude",
        "longitude",
        "manualAttendanceReason",
        "remarks",
      ];


      for (
        const field of
        allowedFields
      ) {

        if (
          req.body[field] !==
          undefined
        ) {

          attendance[field] =
            req.body[field];
        }
      }


      // ======================================================
      // NORMALIZE UPDATED DATE
      // ======================================================

      if (
        req.body.date !==
        undefined
      ) {

        const updatedDate =
          new Date(
            req.body.date
          );


        if (
          isNaN(
            updatedDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid attendance date.",
          });
        }


        updatedDate.setUTCHours(
          0,
          0,
          0,
          0
        );


        attendance.date =
          updatedDate;
      }


      // ======================================================
      // PHOTO UPDATE
      // ======================================================

      if (
        newPhotoUploaded &&
        uploadedPhoto
      ) {

        attendance.photo = {
          url:
            uploadedPhoto.url,

          localPath:
            uploadedPhoto.key,
        };
      }


      // ======================================================
      // PREVENT MANUAL LEAVE
      // ======================================================

      if (
        attendance.status ===
        "Leave"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Leave attendance can only be generated from approved leave.",
        });
      }


      // ======================================================
      // SPECIAL ATTENDANCE TYPE VALIDATION
      // ======================================================

      const locationRequiredTypes = [
        "Orientation",
        "Feild Visit",
        "Event",
        "Center Visit",
      ];


      if (
        locationRequiredTypes.includes(
          attendance.attendanceType
        ) &&
        !attendance.visitedLocation?.trim()
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Visited location is required for this attendance type.",
        });
      }


      if (
        locationRequiredTypes.includes(
          attendance.attendanceType
        ) &&
        !attendance.remarks?.trim()
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Remarks are required for this attendance type.",
        });
      }


      // ======================================================
      // SAVE
      // ======================================================

      await attendance.save();

      await syncGamificationPointsForActivity({
        userId: attendance.userId,
        date: attendance.date || attendance.createdAt || new Date(),
      }).catch((error) => console.error("Gamification user attendance update sync failed:", error));

      // ======================================================
      // DELETE OLD PHOTO
      // ======================================================

      if (
        newPhotoUploaded &&
        oldPhotoKey &&
        !oldPhotoKey.startsWith(
          "http"
        )
      ) {

        try {

          await deleteFromSpaces(
            oldPhotoKey
          );

        } catch (
          deleteError
        ) {

          console.error(
            "OLD ATTENDANCE PHOTO DELETE ERROR:",
            deleteError
          );
        }
      }


      // ======================================================
      // RESPONSE
      // ======================================================

      return res.status(200).json({

        success: true,

        message:
          "User attendance updated successfully.",

        data:
          attendance,
      });

    } catch (error) {

      console.error(
        "UPDATE USER ATTENDANCE ERROR:",
        error
      );


      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to update user attendance.",
      });
    }
  };

// ============================================================
// CHECK OUT USER ATTENDANCE
// ============================================================

export const checkoutUserAttendance = async (req, res) => {
  try {
    const loggedInUserId = req.user?._id;
    const { id } = req.params;

    if (!loggedInUserId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attendance ID.",
      });
    }

    const attendance = await UserAttendance.findById(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance not found.",
      });
    }

    if (String(attendance.userId) !== String(loggedInUserId)) {
      return res.status(403).json({
        success: false,
        message: "You can only check out your own attendance.",
      });
    }

    if (attendance.attendanceSource === "Leave") {
      return res.status(400).json({
        success: false,
        message: "Leave attendance cannot be checked out.",
      });
    }

    if (attendance.status === "Absent") {
      return res.status(400).json({
        success: false,
        message: "Absent attendance cannot be checked out.",
      });
    }

    if (!attendance.checkIn) {
      if (attendance.createdAt) {
        // Legacy manual attendance: use the original marking time
        // as the check-in time before recording checkout.
        attendance.checkIn = attendance.createdAt;
      } else {
        return res.status(400).json({
          success: false,
          message: "Check-in time is missing for this attendance.",
        });
      }
    }

    if (attendance.checkOut) {
      return res.status(409).json({
        success: false,
        message: "Attendance is already checked out.",
        data: attendance,
      });
    }

    attendance.checkOut = new Date();
    await attendance.save();

    await syncGamificationPointsForActivity({
      userId: attendance.userId,
      date: attendance.date || attendance.createdAt || new Date(),
    }).catch((error) => console.error("Gamification user attendance checkout sync failed:", error));

    return res.status(200).json({
      success: true,
      message: "Attendance checked out successfully.",
      data: attendance,
    });
  } catch (error) {
    console.error("CHECKOUT USER ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to check out attendance.",
    });
  }
};


// ============================================================
// LEAVE OPTIONS FOR ADMIN ATTENDANCE MODAL
// Returns active leave buckets and their available balances.
// ============================================================
export const getAttendanceLeaveOptions = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid employee ID." });
    }

    const year = Number(req.query.year || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      return res.status(400).json({ success: false, message: "Invalid leave year." });
    }

    const balances = await UserLeaveBalance.find({
      userId,
      leaveYear: year,
      isActive: true,
    }).populate({ path: "leaveTypeId", select: "name code isActive" }).lean();

    let currentLeave = null;
    if (req.query.currentAttendanceId && mongoose.isValidObjectId(req.query.currentAttendanceId)) {
      const currentAttendance = await UserAttendance.findOne({
        _id: req.query.currentAttendanceId,
        userId,
        attendanceSource: "Leave",
      }).populate("leaveId").lean();
      if (currentAttendance?.leaveId?.status === "Approved") currentLeave = currentAttendance.leaveId;
    }

    const options = balances
      .filter(balance => balance.leaveTypeId?.isActive !== false)
      .map(balance => {
        const currentCredit = currentLeave && String(currentLeave.leaveTypeId) === String(balance.leaveTypeId?._id)
          ? Number(currentLeave.numberOfDays || 1) : 0;
        const availableBalance = Number(balance.availableBalance || 0) + currentCredit;
        return {
          leaveBalanceId: balance._id,
          leaveTypeId: balance.leaveTypeId?._id,
          name: balance.leaveTypeId?.name || "Leave",
          code: balance.leaveTypeId?.code || "",
          availableBalance,
          label: `${balance.leaveTypeId?.code || balance.leaveTypeId?.name || "Leave"} (${availableBalance})`,
        };
      })
      .filter(option => option.availableBalance > 0);

    return res.status(200).json({
      success: true,
      message: "Employee leave balances fetched successfully.",
      data: options,
    });
  } catch (error) {
    console.error("GET ATTENDANCE LEAVE OPTIONS ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to fetch employee leave balances." });
  }
};

// ============================================================
// MARK APPROVED LEAVE DIRECTLY FROM ADMIN ATTENDANCE
// Creates the leave record, deducts the leave bucket, writes the
// ledger transaction and creates Leave attendance atomically.
// ============================================================
async function restoreAdminMarkedLeave(leave, actorId, session, reason = "Admin/HR updated or removed attendance leave.") {
  if (!leave || leave.status !== "Approved" ||
      !String(leave.approvalReason || "").includes("Directly marked by an authorized attendance user.")) {
    throw new Error("Only HR/Admin-marked attendance leave can be updated or removed here.");
  }
  const balance = await UserLeaveBalance.findOne({
    userId: leave.userId,
    leaveTypeId: leave.leaveTypeId,
    leaveYear: leave.fromDate.getUTCFullYear(),
    isActive: true,
  }).session(session);
  if (!balance) throw new Error("Leave balance record not found; cannot restore the leave.");
  const days = Number(leave.numberOfDays || 1);
  // Restore consumed credit lots as well as the balance snapshot so a
  // subsequent replacement leave can consume the restored entitlement.
  let creditToRestore = days;
  const consumedCredits = await LeaveBalanceTransaction.find({
    userId: leave.userId,
    leaveTypeId: leave.leaveTypeId,
    leaveYear: leave.fromDate.getUTCFullYear(),
    transactionType: { $in: ["Opening Balance", "Accrual", "Carry Forward", "Manual Adjustment"] },
    consumedAmount: { $gt: 0 },
  }).sort({ expiryDate: -1, transactionDate: -1 }).session(session);
  for (const credit of consumedCredits) {
    if (creditToRestore <= 0) break;
    const consumed = Number(credit.consumedAmount || 0);
    const restoreAmount = Math.min(consumed, creditToRestore);
    credit.consumedAmount = consumed - restoreAmount;
    credit.remainingAmount = Number(credit.remainingAmount ?? Math.max(0, Number(credit.amount || 0) - consumed - Number(credit.expiredAmount || 0))) + restoreAmount;
    await credit.save({ session });
    creditToRestore -= restoreAmount;
  }
  const before = Number(balance.availableBalance || 0);
  balance.usedBalance = Math.max(0, Number(balance.usedBalance || 0) - days);
  balance.availableBalance = before + days;
  balance.lastUpdatedAt = new Date();
  await balance.save({ session });
  await removeLeaveAttendance(leave._id, session);
  leave.status = "Cancelled";
  leave.cancelledAt = new Date();
  leave.cancellationReason = reason;
  leave.approvalReason = `${leave.approvalReason || ""} | Cancelled by authorized HR/Admin`;
  await leave.save({ session });
  await LeaveBalanceTransaction.create([{
    userId: leave.userId,
    leaveTypeId: leave.leaveTypeId,
    leaveBalanceId: balance._id,
    leaveId: leave._id,
    leaveYear: leave.fromDate.getUTCFullYear(),
    transactionType: "Leave Cancellation",
    amount: days,
    balanceBefore: before,
    balanceAfter: before + days,
    referenceType: "Manual",
    referenceId: leave._id,
    reason,
    transactionDate: new Date(),
    createdBy: actorId,
  }], { session });
}

export const removeAdminMarkedLeaveAttendance = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const actorId = req.user?._id;
    const attendanceId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(attendanceId)) {
      return res.status(400).json({ success: false, message: "Invalid attendance ID." });
    }
    await session.withTransaction(async () => {
      const attendance = await UserAttendance.findOne({
        _id: attendanceId,
        attendanceSource: "Leave",
        leaveId: { $ne: null },
      }).session(session);
      if (!attendance) throw new Error("Admin-marked leave attendance not found.");
      const leave = await UserLeave.findById(attendance.leaveId).session(session);
      if (!leave) throw new Error("Linked leave record not found.");
      await restoreAdminMarkedLeave(leave, actorId, session, "Leave removed by authorized HR/Admin from Attendance Management.");
    });
    return res.status(200).json({ success: true, message: "Leave removed and balance restored. Attendance will return to its calculated status." });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Unable to remove leave." });
  } finally {
    await session.endSession();
  }
};

export const markAttendanceLeave = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const actorId = req.user?._id;
    const { userId, leaveTypeId, date, remarks, reason, replaceAttendanceId } = req.body || {};

    if (!actorId) return res.status(401).json({ success: false, message: "Unauthorized user." });
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(leaveTypeId)) {
      return res.status(400).json({ success: false, message: "Valid employee and leave type are required." });
    }
    if (replaceAttendanceId && !mongoose.Types.ObjectId.isValid(replaceAttendanceId)) {
      return res.status(400).json({ success: false, message: "Invalid attendance record selected for conversion." });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ success: false, message: "A valid leave date is required." });
    }

    const [year, month, day] = String(date).split("-").map(Number);
    const leaveDate = new Date(Date.UTC(year, month - 1, day));
    if (leaveDate.getUTCFullYear() !== year || leaveDate.getUTCMonth() !== month - 1 || leaveDate.getUTCDate() !== day) {
      return res.status(400).json({ success: false, message: "Invalid leave date." });
    }

    const leaveType = await LeaveType.findOne({ _id: leaveTypeId, isActive: true }).lean();
    if (!leaveType) return res.status(404).json({ success: false, message: "Active leave type not found." });

    let createdLeave;
    await session.withTransaction(async () => {
      const existingAttendance = await UserAttendance.findOne({
        userId,
        date: leaveDate,
      }).session(session);

      if (existingAttendance) {
        const isRequestedReplacement =
          replaceAttendanceId &&
          String(existingAttendance._id) === String(replaceAttendanceId);

        if (!isRequestedReplacement) {
          throw new Error(`Attendance already exists for this employee on ${date}.`);
        }
        if (existingAttendance.attendanceSource === "Leave") {
          if (!existingAttendance.leaveId) throw new Error("Linked leave record not found.");
          const previousLeave = await UserLeave.findById(existingAttendance.leaveId).session(session);
          await restoreAdminMarkedLeave(previousLeave, actorId, session, "Leave updated by authorized HR/Admin from Attendance Management.");
        } else {
          if (existingAttendance.attendanceSource !== "Manual") {
            throw new Error("Only manually marked attendance or an HR/Admin-marked leave can be replaced. Biometric/system records cannot be replaced here.");
          }
          await UserAttendance.deleteOne({ _id: existingAttendance._id }).session(session);
        }
      } else if (replaceAttendanceId) {
        const oldRecord = await UserAttendance.findOne({
          _id: replaceAttendanceId,
          userId,
          attendanceSource: "Manual",
        }).session(session);
        if (!oldRecord) {
          throw new Error("The attendance record being edited could not be found or cannot be converted to leave.");
        }
        await UserAttendance.deleteOne({ _id: oldRecord._id }).session(session);
      }

      const overlappingLeave = await UserLeave.findOne({
        userId,
        status: { $in: ["Pending", "Approved"] },
        fromDate: { $lte: leaveDate },
        toDate: { $gte: leaveDate },
      }).session(session);

      if (overlappingLeave) throw new Error("This employee already has a pending or approved leave on the selected date.");

      const balance = await UserLeaveBalance.findOne({
        userId,
        leaveTypeId,
        leaveYear: year,
        isActive: true,
      }).session(session);

      if (!balance) throw new Error("Leave balance is not configured for this employee and leave type.");

      const available = Number(balance.availableBalance || 0);
      if (available < 1) throw new Error("Insufficient leave balance.");

      // One date selected in the attendance modal represents one full leave day.
      const leaveDocs = await UserLeave.create([{
        userId,
        leaveTypeId,
        fromDate: leaveDate,
        toDate: leaveDate,
        durationType: "Full Day",
        halfDayType: null,
        numberOfDays: 1,
        reason: String(reason || "Leave marked by HR/Admin from Attendance Management").trim(),
        status: "Approved",
        appliedAt: new Date(),
        approvedAt: new Date(),
        approvalReason: "Directly marked by an authorized attendance user.",
        remarks: String(remarks || "").trim() || null,
      }], { session });

      createdLeave = leaveDocs[0];

      await consumeLeaveCredits({
        userId,
        leaveTypeId,
        leaveYear: year,
        leaveId: createdLeave._id,
        amount: 1,
        session,
      });

      const before = available;
      balance.usedBalance = Number(balance.usedBalance || 0) + 1;
      balance.availableBalance = before - 1;
      balance.lastUpdatedAt = new Date();
      await balance.save({ session });

      await LeaveBalanceTransaction.create([{
        userId,
        leaveTypeId,
        leaveBalanceId: balance._id,
        leaveId: createdLeave._id,
        leaveYear: year,
        transactionType: "Leave Deduction",
        amount: 1,
        balanceBefore: before,
        balanceAfter: before - 1,
        referenceType: "Manual",
        referenceId: createdLeave._id,
        reason: "Leave marked directly from Admin Attendance.",
        remarks: String(remarks || "").trim() || null,
        transactionDate: new Date(),
        createdBy: actorId,
      }], { session });

      await createLeaveAttendance(createdLeave, actorId, session);
    });

    const populatedLeave = await UserLeave.findById(createdLeave?._id)
      .populate({ path: "leaveTypeId", select: "name code" })
      .populate({ path: "userId", select: "name email userId" })
      .lean();

    return res.status(201).json({
      success: true,
      message: "Leave marked successfully and leave balance deducted.",
      data: populatedLeave,
    });
  } catch (error) {
    console.error("MARK ATTENDANCE LEAVE ERROR:", error);
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Unable to mark leave.",
    });
  } finally {
    await session.endSession();
  }
};
