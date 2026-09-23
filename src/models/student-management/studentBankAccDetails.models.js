import mongoose, { Schema } from "mongoose";

const studentBankAccountSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    bankName: {
      type: String,
      trim: true,
    },

    accountNumber: {
      type: String,
      trim: true,
    },

    ifsc: {
      type: String,
      trim: true,
      uppercase: true,
    },

    accountHolderName: {
      type: String,
      trim: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const StudentBankAccount = mongoose.model(
  "StudentBankAccount",
  studentBankAccountSchema
);