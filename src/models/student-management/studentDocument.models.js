import mongoose, { Schema } from "mongoose";

const studentDocumentSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    documentType: {
      type: String,
      required: true,
      trim: true,
    },

    documentNumber: {
      type: String,
      trim: true,
    },

    documentUrl: {
      type: String,
      trim: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    verifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const StudentDocument = mongoose.model(
  "StudentDocument",
  studentDocumentSchema
);