import mongoose, { Schema } from "mongoose";

const leaveBalanceTransactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    leaveTypeId: {
      type: Schema.Types.ObjectId,
      ref: "LeaveType",
      required: true,
      index: true,
    },

    leaveBalanceId: {
      type: Schema.Types.ObjectId,
      ref: "UserLeaveBalance",
      required: true,
      index: true,
    },

    leaveId: {
      type: Schema.Types.ObjectId,
      ref: "UserLeave",
      default: null,
      index: true,
    },

    leaveYear: {
      type: Number,
      required: true,
      min: 2000,
      index: true,
    },

    transactionType: {
      type: String,
      required: true,
      enum: [
        "Opening Balance",
        "Accrual",
        "Leave Deduction",
        "Leave Cancellation",
        "Leave Withdrawal",
        "Carry Forward",
        "Expiry",
        "Manual Adjustment",
        "Pending Reservation",
        "Pending Release",
      ],
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    referenceType: {
      type: String,
      enum: [
        "Leave",
        "LeaveApproval",
        "System",
        "Manual",
      ],
      default: "System",
    },

    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    reason: {
      type: String,
      trim: true,
      default: null,
    },

    remarks: {
      type: String,
      trim: true,
      default: null,
    },

    transactionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

leaveBalanceTransactionSchema.index({
  userId: 1,
  leaveTypeId: 1,
  leaveYear: 1,
  transactionDate: -1,
});

leaveBalanceTransactionSchema.index({
  leaveBalanceId: 1,
  transactionDate: -1,
});

leaveBalanceTransactionSchema.index({
  leaveId: 1,
  transactionDate: -1,
});

leaveBalanceTransactionSchema.index({
  transactionType: 1,
  transactionDate: -1,
});

export const LeaveBalanceTransaction =
  mongoose.model(
    "LeaveBalanceTransaction",
    leaveBalanceTransactionSchema
  );