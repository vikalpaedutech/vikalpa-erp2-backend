import mongoose, { Schema } from "mongoose";

const studentAttendanceSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "StudentEnrollment",
    },
    
    date: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      required: true,
      trim: true,
      enum:['Present', 'Absent']
    },

    markedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    remarks: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

studentAttendanceSchema.index({ enrollmentId: 1, date: -1, status: 1 });
studentAttendanceSchema.index({ studentId: 1, date: -1 });


studentAttendanceSchema.index({ enrollmentId: 1, date: 1, createdAt: -1 });

export const StudentAttendance = mongoose.model(
  "StudentAttendance",
  studentAttendanceSchema
);