import mongoose, { Schema } from "mongoose";

const studentEnrollmentSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },

    batchId: {
      type: Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },

    districtId: {
      type: Schema.Types.ObjectId,
      ref: "District",
    },

    blockId: {
      type: Schema.Types.ObjectId,
      ref: "Block",
    },

    centerId: {
      type: Schema.Types.ObjectId,
      ref: "Center",
    },

    class: {
      type: Number,
    },

    board: {
      type: String,
      trim: true,
    },

    enrollmentDate: {
      type: Date,
    },

    status: {
      type: String,
      trim: true,
      enum: [
        "active",
        "requested-slc",
        "provisional",
        "left",
        "add-request",
        "remove-request",
        "completed",
        "transfer-student",
      ],
    },

    // Initial SLC submission
    slcSubmitted: {
      type: Boolean,
      default: false,
    },

    slcSubmittedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

studentEnrollmentSchema.index({ status: 1, districtId: 1, blockId: 1, centerId: 1, batchId: 1, programId: 1 });
studentEnrollmentSchema.index({ status: 1, studentId: 1 });

export const StudentEnrollment = mongoose.model(
  "StudentEnrollment",
  studentEnrollmentSchema
);