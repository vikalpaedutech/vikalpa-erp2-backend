import mongoose, { Schema } from "mongoose";

const permissionSchema = new Schema(
  {
    permissionName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    permissionCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 150,
    },

    module: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 50,
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

permissionSchema.index(
  { module: 1, action: 1 },
  { unique: true }
);

export const Permission = mongoose.model("Permission", permissionSchema);