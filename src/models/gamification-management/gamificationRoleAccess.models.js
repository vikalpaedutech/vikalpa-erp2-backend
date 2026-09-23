import mongoose, { Schema } from "mongoose";

const gamificationRoleAccessSchema = new Schema(
  {
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true, unique: true, index: true },
    isAllowed: { type: Boolean, default: false, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export const GamificationRoleAccess = mongoose.model("GamificationRoleAccess", gamificationRoleAccessSchema);
