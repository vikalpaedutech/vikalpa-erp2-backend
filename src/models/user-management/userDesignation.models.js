import mongoose, { Schema } from "mongoose";

const userDesignationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    designationId: {
      type: Schema.Types.ObjectId,
      ref: "Designation",
      required: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
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

userDesignationSchema.index({ userId: 1, designationId: 1 }, { unique: true });
userDesignationSchema.index(
  { userId: 1, isPrimary: 1 },
  {
    unique: true,
    partialFilterExpression: { isPrimary: true, isActive: true },
  }
);

export const UserDesignation = mongoose.model(
  "UserDesignation",
  userDesignationSchema
);
