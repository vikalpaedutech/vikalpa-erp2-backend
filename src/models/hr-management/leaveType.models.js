import mongoose, { Schema } from "mongoose";

const leaveTypeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },

    isPaid: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

leaveTypeSchema.path("code").validate(
  (value) => /^[A-Z0-9_-]+$/.test(value),
  "Leave type code may contain only A-Z, 0-9, underscore and hyphen."
);

leaveTypeSchema.index({ name: 1 }, { unique: true });
leaveTypeSchema.index({ isActive: 1, name: 1 });

export const LeaveType = mongoose.model(
  "LeaveType",
  leaveTypeSchema
);
