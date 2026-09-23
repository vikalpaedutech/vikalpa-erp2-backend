import mongoose, { Schema } from "mongoose";

const leaveApprovalRuleSchema = new Schema(
  {
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: true,
      index: true,
    },

    designationId: {
      type: Schema.Types.ObjectId,
      ref: "Designation",
      required: true,
      index: true,
    },

    approverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    approvalLevel: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
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

leaveApprovalRuleSchema.index(
  {
    departmentId: 1,
    designationId: 1,
    approvalLevel: 1,
  },
  {
    unique: true,
  }
);

leaveApprovalRuleSchema.index({
  approverId: 1,
  isActive: 1,
});

leaveApprovalRuleSchema.index({
  departmentId: 1,
  designationId: 1,
  isActive: 1,
});

export const LeaveApprovalRule =
  mongoose.model(
    "LeaveApprovalRule",
    leaveApprovalRuleSchema
  );