import mongoose, { Schema } from "mongoose";

const studentDisciplinaryRecordSchema = new Schema(
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

    incidentDate: {
      type: Date,
      required: true,
    },

    disciplinaryType: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    severity: {
      type: String,
      trim: true,
    },

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

export const StudentDisciplinaryRecord = mongoose.model(
  "StudentDisciplinaryRecord",
  studentDisciplinaryRecordSchema
);