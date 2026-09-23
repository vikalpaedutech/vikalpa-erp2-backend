import mongoose, { Schema } from "mongoose";

const designationSchema = new Schema(
  {
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    designation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    designationCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
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

designationSchema.index({ departmentId: 1, designation: 1 }, { unique: true });
designationSchema.index({ departmentId: 1, designationCode: 1 }, { unique: true });

export const Designation = mongoose.model("Designation", designationSchema);
