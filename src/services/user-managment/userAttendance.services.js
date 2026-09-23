import { UserAttendance } from "../../models/user-management/userAttendance.models.js";


/*
 * Normalize a date to UTC date-only.
 *
 * Example:
 * 2026-09-22T00:00:00
 * becomes:
 * 2026-09-22T00:00:00.000Z
 */
const normalizeDateOnlyUTC = (date) => {
  const parsedDate = new Date(date);

  return new Date(
    Date.UTC(
      parsedDate.getUTCFullYear(),
      parsedDate.getUTCMonth(),
      parsedDate.getUTCDate()
    )
  );
};


/*
 * Get every calendar date between fromDate and toDate.
 */
const getDatesBetween = (fromDate, toDate) => {
  const dates = [];

  const currentDate = new Date(fromDate);
  const endDate = new Date(toDate);

  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));

    currentDate.setUTCDate(
      currentDate.getUTCDate() + 1
    );
  }

  return dates;
};


/*
 * Create attendance records for an approved leave.
 *
 * IMPORTANT:
 * This function is intended to be called only after
 * the final approval of the leave.
 *
 * The same MongoDB session is used so that:
 *
 * Leave approval
 * Balance update
 * Ledger entry
 * Attendance creation
 *
 * all succeed or fail together.
 */
export const createLeaveAttendance = async (
  leave,
  markedBy,
  session
) => {
  const fromDate = normalizeDateOnlyUTC(
    leave.fromDate
  );

  const toDate = normalizeDateOnlyUTC(
    leave.toDate
  );

  const dates = getDatesBetween(
    fromDate,
    toDate
  );

  const attendanceDocuments = [];

  for (const date of dates) {
    /*
     * Do not create duplicate leave attendance
     * for the same leave/date.
     */
    const existingAttendance =
      await UserAttendance.findOne({
        userId: leave.userId,
        leaveId: leave._id,
        date,
        attendanceSource: "Leave",
      }).session(session);

    if (existingAttendance) {
      continue;
    }

    /*
     * For a half-day leave, the attendance record
     * still represents the leave on that date.
     *
     * We preserve First Half / Second Half separately.
     */
    const isHalfDay =
      leave.durationType === "Half Day";

    attendanceDocuments.push({
      userId: leave.userId,

      /*
       * Existing attendanceType is preserved.
       *
       * Half-day leave is represented through
       * leaveDurationType / leaveHalfDayType rather
       * than changing the attendance type unexpectedly.
       */
      attendanceType: "Daily Attendance",

      status: "Leave",

      leaveId: leave._id,

      attendanceSource: "Leave",

      leaveDurationType:
        leave.durationType,

      leaveHalfDayType:
        isHalfDay
          ? leave.halfDayType
          : null,

      date,

      checkIn: null,

      checkOut: null,

      visitedLocation: null,

      latitude: 0,

      longitude: 0,

      /*
       * The final approver is recorded as the
       * user who caused the system-generated
       * attendance record.
       */
      markedBy,

      manualAttendanceReason: null,

      remarks:
        leave.remarks ||
        "Attendance automatically marked as Leave after leave approval.",
    });
  }

  if (!attendanceDocuments.length) {
    return [];
  }

  return await UserAttendance.insertMany(
    attendanceDocuments,
    {
      session,
    }
  );
};


/*
 * Safely remove attendance records that were
 * automatically created from a leave.
 *
 * We NEVER change them to "Absent".
 *
 * Only records having:
 *
 * attendanceSource = "Leave"
 * leaveId = given leave
 *
 * are touched.
 */
export const removeLeaveAttendance = async (
  leaveId,
  session
) => {
  const result =
    await UserAttendance.deleteMany(
      {
        leaveId,
        attendanceSource: "Leave",
      },
      {
        session,
      }
    );

  return result;
};


/*
 * Check whether leave attendance already exists.
 */
export const getLeaveAttendance = async (
  leaveId,
  session
) => {
  return await UserAttendance.find({
    leaveId,
    attendanceSource: "Leave",
  })
    .sort({
      date: 1,
    })
    .session(session);
};