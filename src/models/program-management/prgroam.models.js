import mongoose, { Schema } from "mongoose";

const programSchema = new Schema(
  {
    programName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 150,
    },
    programCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: 30,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
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

export const Program = mongoose.model("Program", programSchema);
