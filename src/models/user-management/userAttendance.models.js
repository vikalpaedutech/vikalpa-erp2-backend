import mongoose, { Schema } from "mongoose";

const userAttendanceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // of who attendance is marked


    attendanceType: {
      type: String,
      required: true,
      enum: [
        "Daily Attendance",
        "Orientation",
        "Feild Visit",
        "Event",
        "Center Visit",
        "Half Day",
      ],
    }, // user will be on center or sometimes on field, center visit or event for that it is


    status: {
      type: String,
      required: true,
      trim: true,
      enum: ["Present", "WFH", "Absent", "Leave"],
    }, // attendance status


    leaveId: {
      type: Schema.Types.ObjectId,
      ref: "UserLeave",
      default: null,
      index: true,
    },


    /*
     * Tells whether this attendance was created manually
     * or automatically because of an approved leave.
     *
     * Existing manual attendance will remain "Manual".
     * Approved leave attendance will be created as "Leave".
     */
    attendanceSource: {
      type: String,
      enum: ["Manual", "Leave", "System"],
      default: "Manual",
      index: true,
    },


    /*
     * These fields are only relevant when attendance
     * is generated from a leave.
     *
     * Full Day:
     *   leaveDurationType = "Full Day"
     *   leaveHalfDayType = null
     *
     * Half Day:
     *   leaveDurationType = "Half Day"
     *   leaveHalfDayType = "First Half" / "Second Half"
     */
    leaveDurationType: {
      type: String,
      enum: ["Full Day", "Half Day"],
      default: null,
    },


    leaveHalfDayType: {
      type: String,
      enum: ["First Half", "Second Half"],
      default: null,
    },


    photo: {
      type: {
        url: String,
        localPath: String,
      },
      default: {
        url: `https://placehold.co/200x200`,
        localPath: "",
      },
    }, // student marks attendance by clicking his photo in their mobile device


    date: {
      type: Date,
      required: true,
      index: true,
    }, // attendance date


    checkIn: {
      type: Date,
      default: null,
    }, // same as when attendance marked


    checkOut: {
      type: Date,
      default: null,
    },


    visitedLocation: {
      type: String,
      trim: true,
    }, // if user selects any other option than Daily Attendance from attendanceType


    latitude: {
      type: Number,
      default: 0,
    }, // currently 0, future location tracking


    longitude: {
      type: Number,
      default: 0,
    }, // currently 0, future location tracking


    markedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // who marks attendance


    manualAttendanceReason: {
      type: String,
      trim: true,
    }, // if someone else marks another user's attendance


    remarks: {
      type: String,
      trim: true,
    }, // any remarks
  },
  {
    timestamps: true,
  }
);


/*
 * Attendance lookup for a user's daily attendance.
 */
userAttendanceSchema.index({
  userId: 1,
  date: -1,
});


/*
 * Useful when checking attendance generated
 * from a particular leave.
 */
userAttendanceSchema.index({
  leaveId: 1,
  attendanceSource: 1,
});


/*
 * Useful for daily attendance reports.
 */
userAttendanceSchema.index({
  userId: 1,
  date: 1,
  attendanceType: 1,
});


export const UserAttendance = mongoose.model(
  "UserAttendance",
  userAttendanceSchema
);