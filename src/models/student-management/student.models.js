import mongoose, { Schema } from "mongoose";

const studentSchema = new Schema(
  {
    studentSrn: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    rollNumber: {
      type: String,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    fatherName: {
      type: String,
      trim: true,
    },

    motherName: {
      type: String,
      trim: true,
    },

    personalContact: {
      type: String,
      trim: true,
    },

    parentContact: {
      type: String,
      trim: true,
    },

    otherContact: {
      type: String,
      trim: true,
    },

    dob: {
      type: Date,
    },

    gender: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    profileImage: {
      type: String,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);


studentSchema.index({ isActive: 1, studentSrn: 1 });

export const Student = mongoose.model("Student", studentSchema);