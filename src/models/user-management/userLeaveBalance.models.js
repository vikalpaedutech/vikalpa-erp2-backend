import mongoose, { Schema } from "mongoose";

const userLeaveBalanceSchema = new Schema(
  {
    // ==========================================================
    // EMPLOYEE
    // ==========================================================

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ==========================================================
    // LEAVE TYPE
    // ==========================================================

    leaveTypeId: {
      type: Schema.Types.ObjectId,
      ref: "LeaveType",
      required: true,
      index: true,
    },

    // ==========================================================
    // LEAVE YEAR
    //
    // Example:
    //
    // 2026
    //
    // This keeps balances separated year-wise.
    // ==========================================================

    leaveYear: {
      type: Number,
      required: true,
      min: 2000,
      index: true,
    },

    // ==========================================================
    // OPENING BALANCE
    //
    // Balance available at the beginning of the leave year.
    // ==========================================================

    openingBalance: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================================
    // ACCRUED BALANCE
    //
    // Leave credited during the leave year.
    // ==========================================================

    accruedBalance: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================================
    // USED BALANCE
    //
    // Approved leave already consumed.
    // ==========================================================

    usedBalance: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================================
    // PENDING BALANCE
    //
    // Leave currently requested but not yet approved.
    //
    // This is useful for showing:
    //
    // Available: 8
    // Pending:   2
    //
    // without deducting pending leave from used balance.
    // ==========================================================

    pendingBalance: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================================
    // ADJUSTMENT BALANCE
    //
    // Can be positive or negative.
    //
    // Example:
    //
    // +2  → manual credit
    // -1  → manual debit
    // ==========================================================

    adjustmentBalance: {
      type: Number,
      default: 0,
    },

    // ==========================================================
    // CARRY FORWARD BALANCE
    //
    // Leave brought forward from previous leave year.
    // ==========================================================

    carryForwardBalance: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================================
    // EXPIRED BALANCE
    //
    // Leave that expired according to organisation policy.
    // ==========================================================

    expiredBalance: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================================
    // AVAILABLE BALANCE
    //
    // Current usable leave balance.
    //
    // This is maintained as a snapshot for fast reads.
    //
    // Conceptually:
    //
    // Opening
    // + Accrued
    // + Carry Forward
    // + Adjustment
    // - Used
    // - Expired
    //
    // Pending leave is NOT deducted from available balance
    // because it has not yet been approved.
    // ==========================================================

    availableBalance: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================================
    // STATUS
    // ==========================================================

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ==========================================================
    // LAST BALANCE UPDATE
    // ==========================================================

    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ==========================================================
// INDEXES
// ==========================================================

// One balance record per:
// User + Leave Type + Leave Year
userLeaveBalanceSchema.index(
  {
    userId: 1,
    leaveTypeId: 1,
    leaveYear: 1,
  },
  {
    unique: true,
  }
);

// Useful for fetching all leave balances of a user.
userLeaveBalanceSchema.index({
  userId: 1,
  leaveYear: 1,
});

// Useful for leave-type based balance reports.
userLeaveBalanceSchema.index({
  leaveTypeId: 1,
  leaveYear: 1,
});

// Useful for active balance queries.
userLeaveBalanceSchema.index({
  userId: 1,
  leaveYear: 1,
  isActive: 1,
});

export const UserLeaveBalance =
  mongoose.model(
    "UserLeaveBalance",
    userLeaveBalanceSchema
  );