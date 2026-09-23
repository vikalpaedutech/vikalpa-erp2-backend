import {
  getAccessBasedAttendance,
} from "../../services/user-managment/attendanceAccess.services.js";

export const getAccessBasedUserAttendance = async (
  req,
  res
) => {
  try {
    const viewerId = req.user?._id;

    if (!viewerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    const {
      fromDate,
      toDate,
      attendanceType,
      status,
      attendanceSource,
    } = req.query;

    const result =
      await getAccessBasedAttendance({
        viewerId,
        fromDate,
        toDate,
        attendanceType,
        status,
        attendanceSource,
      });

    return res.status(200).json({
      success: true,
      message:
        "Access based user attendance fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error(
      "getAccessBasedUserAttendance error:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch access based user attendance.",
    });
  }
};