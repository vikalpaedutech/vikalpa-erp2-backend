import mongoose from "mongoose";

import { UserAttendance } from "../../models/user-management/userAttendance.models.js";

import { User } from "../../models/user.models.js";

import {
  uploadToSpaces,
  deleteFromSpaces,
} from "../../utils/space.utils.js";


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

      if (!manualAttendanceReason?.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Manual attendance reason is required when marking attendance for another user.",
        });
      }


      if (!remarks?.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Remarks are required when marking attendance for another user.",
        });
      }
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
        100
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

        .populate(
          "leaveId"
        )

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

export const getMyUserAttendance = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    req.query.userId = String(userId);

    return getUserAttendance(req, res);
  } catch (error) {
    console.error("GET MY USER ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch my attendance.",
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
