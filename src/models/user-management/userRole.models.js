import mongoose, { Schema } from "mongoose";

const userRoleSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
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

userRoleSchema.index(
  { userId: 1, roleId: 1 },
  { unique: true }
);

export const UserRole = mongoose.model("UserRole", userRoleSchema);