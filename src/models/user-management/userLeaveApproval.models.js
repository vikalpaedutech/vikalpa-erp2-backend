import mongoose, { Schema } from "mongoose";

const userLeaveApprovalSchema = new Schema(
  {
    leaveId: {
      type: Schema.Types.ObjectId,
      ref: "UserLeave",
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

    status: {
      type: String,
      required: true,
      enum: [
        "Pending",
        "Approved",
        "Rejected",
        "Skipped",
        "Cancelled",
      ],
      default: "Pending",
      index: true,
    },

    approvalReason: {
      type: String,
      trim: true,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    remarks: {
      type: String,
      trim: true,
      default: null,
    },

    actionAt: {
      type: Date,
      default: null,
    },

    assignedAt: {
      type: Date,
      default: Date.now,
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

userLeaveApprovalSchema.pre(
  "validate",
  function (next) {
    if (
      [
        "Approved",
        "Rejected",
        "Skipped",
        "Cancelled",
      ].includes(this.status) &&
      !this.actionAt
    ) {
      this.actionAt = new Date();
    }

    next();
  }
);

userLeaveApprovalSchema.index(
  {
    leaveId: 1,
    approvalLevel: 1,
  },
  {
    unique: true,
  }
);

userLeaveApprovalSchema.index({
  leaveId: 1,
  approvalLevel: 1,
  status: 1,
});

userLeaveApprovalSchema.index({
  approverId: 1,
  status: 1,
});

userLeaveApprovalSchema.index({
  approverId: 1,
  status: 1,
  assignedAt: -1,
});

userLeaveApprovalSchema.index({
  leaveId: 1,
  createdAt: -1,
});

export const UserLeaveApproval =
  mongoose.model(
    "UserLeaveApproval",
    userLeaveApprovalSchema
  );