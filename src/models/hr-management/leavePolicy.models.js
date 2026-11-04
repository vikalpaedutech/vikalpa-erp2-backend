import mongoose, { Schema } from "mongoose";

const leavePolicySchema = new Schema({
  leaveTypeId: { type: Schema.Types.ObjectId, ref: "LeaveType", required: true, unique: true, index: true },
  eligibility: {
    roles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    designations: [{ type: Schema.Types.ObjectId, ref: "Designation" }],
    users: [{ type: Schema.Types.ObjectId, ref: "User" }],
    applyToAll: { type: Boolean, default: true },
  },
  accrualFrequency: { type: String, enum: ["none", "monthly", "quarterly", "half_yearly", "yearly"], default: "none", required: true },
  accrualAmount: { type: Number, min: 0, default: 0 },
  annualEntitlement: { type: Number, min: 0, default: 0 },
  carryForwardAllowed: { type: Boolean, default: false },
  maxCarryForward: { type: Number, min: 0, default: 0 },
  expiryMonths: { type: Number, min: 0, default: 0 },
  effectiveFrom: { type: Date, default: Date.now },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

leavePolicySchema.index({ isActive: 1, accrualFrequency: 1 });
export const LeavePolicy = mongoose.model("LeavePolicy", leavePolicySchema);
