import mongoose, { Schema } from "mongoose";

const departmentSchema = new Schema(
  {
    departmentName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 100,
    },
    departmentCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: 30,
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

export const Department = mongoose.model("Department", departmentSchema);
