import mongoose, { Schema } from "mongoose";

const studentLogSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "StudentEnrollment",
      default: null,
    },

    requestType: {
      type: String,
      required: true,
      enum: [
        "add-student",
        "remove-student",
        "slc-request",
        "transfer-student",
      ],
      trim: true,
    },

    status: {
      type: String,
      required: true,
      enum: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "completed",
      ],
      default: "pending",
    },

    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    transferTo: {
      districtId: {
        type: Schema.Types.ObjectId,
        ref: "District",
        default: null,
      },

      blockId: {
        type: Schema.Types.ObjectId,
        ref: "Block",
        default: null,
      },

      centerId: {
        type: Schema.Types.ObjectId,
        ref: "Center",
        default: null,
      },
    },

    actionBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    actionAt: {
      type: Date,
      default: null,
    },

    actionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


studentLogSchema.index({ enrollmentId: 1, requestType: 1, createdAt: -1 });

export const StudentLog = mongoose.model(
  "StudentLog",
  studentLogSchema
);