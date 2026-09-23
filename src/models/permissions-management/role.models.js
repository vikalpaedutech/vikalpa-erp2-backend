import mongoose, { Schema } from "mongoose";

const roleSchema = new Schema(
  {
    roleName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    roleCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
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

export const Role = mongoose.model("Role", roleSchema);