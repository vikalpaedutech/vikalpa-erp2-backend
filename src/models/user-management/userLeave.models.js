import mongoose, { Schema } from "mongoose";

const userLeaveSchema = new Schema(
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
    // LEAVE DATES
    // ==========================================================

    fromDate: {
      type: Date,
      required: true,
      index: true,
    },

    toDate: {
      type: Date,
      required: true,
      index: true,
    },

    // ==========================================================
    // LEAVE DURATION
    // ==========================================================

    durationType: {
      type: String,
      required: true,
      enum: ["Full Day", "Half Day"],
      default: "Full Day",
    },

    halfDayType: {
      type: String,
      enum: ["First Half", "Second Half"],
      default: null,
    },

    numberOfDays: {
      type: Number,
      required: true,
      min: 0.5,
    },

    // ==========================================================
    // LEAVE REASON
    // ==========================================================

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    // ==========================================================
    // ATTACHMENT
    // ==========================================================

    attachment: {
      type: {
        url: {
          type: String,
          trim: true,
        },

        localPath: {
          type: String,
          trim: true,
        },

        fileName: {
          type: String,
          trim: true,
        },
      },
      default: null,
    },

    // ==========================================================
    // MULTIPLE ATTACHMENTS
    // ==========================================================

    attachments: {
      type: [
        {
          url: {
            type: String,
            trim: true,
          },
          localPath: {
            type: String,
            trim: true,
          },
          fileName: {
            type: String,
            trim: true,
          },
          mimeType: {
            type: String,
            trim: true,
          },
          size: {
            type: Number,
            default: 0,
          },
        },
      ],
      default: [],
    },

    // ==========================================================
    // LEAVE STATUS
    // ==========================================================

    status: {
      type: String,
      required: true,
      enum: [
        "Pending",
        "Approved",
        "Rejected",
        "Cancelled",
        "Withdrawn",
      ],
      default: "Pending",
      index: true,
    },

    // ==========================================================
    // APPLICATION / ACTION DATES
    // ==========================================================

    appliedAt: {
      type: Date,
      default: Date.now,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    withdrawnAt: {
      type: Date,
      default: null,
    },

    // ==========================================================
    // APPROVAL REASON
    // ==========================================================

    approvalReason: {
      type: String,
      trim: true,
      default: null,
    },

    // ==========================================================
    // REJECTION REASON
    // ==========================================================

    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    // ==========================================================
    // CANCELLATION REASON
    // ==========================================================

    cancellationReason: {
      type: String,
      trim: true,
      default: null,
    },

    // ==========================================================
    // WITHDRAWAL REASON
    // ==========================================================

    withdrawalReason: {
      type: String,
      trim: true,
      default: null,
    },

    // ==========================================================
    // ADDITIONAL REMARKS
    // ==========================================================

    remarks: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==========================================================
// VALIDATION
// ==========================================================

userLeaveSchema.pre(
  "validate",
  function (next) {
    // --------------------------------------------------------
    // DATE VALIDATION
    // --------------------------------------------------------

    if (
      this.fromDate &&
      this.toDate &&
      this.toDate < this.fromDate
    ) {
      return next(
        new Error(
          "toDate cannot be earlier than fromDate."
        )
      );
    }

    // --------------------------------------------------------
    // HALF DAY VALIDATION
    // --------------------------------------------------------

    if (
      this.durationType === "Half Day" &&
      !this.halfDayType
    ) {
      return next(
        new Error(
          "halfDayType is required for Half Day leave."
        )
      );
    }

    // --------------------------------------------------------
    // FULL DAY SHOULD NOT HAVE HALF DAY TYPE
    // --------------------------------------------------------

    if (
      this.durationType === "Full Day"
    ) {
      this.halfDayType = null;
    }

    // --------------------------------------------------------
    // FULL DAY MINIMUM
    // --------------------------------------------------------

    if (
      this.durationType === "Full Day" &&
      this.numberOfDays < 1
    ) {
      return next(
        new Error(
          "Full Day leave must have numberOfDays of at least 1."
        )
      );
    }

    // --------------------------------------------------------
    // HALF DAY MUST BE ONE CALENDAR DAY
    // --------------------------------------------------------

    if (
      this.durationType === "Half Day" &&
      this.fromDate &&
      this.toDate
    ) {
      const fromDay = new Date(this.fromDate);
      const toDay = new Date(this.toDate);

      if (
        fromDay.getTime() !==
        toDay.getTime()
      ) {
        return next(
          new Error(
            "Half Day leave can only be applied for one date."
          )
        );
      }
    }

    // --------------------------------------------------------
    // HALF DAY MUST BE 0.5
    // --------------------------------------------------------

    if (
      this.durationType === "Half Day" &&
      this.numberOfDays !== 0.5
    ) {
      return next(
        new Error(
          "Half Day leave must have numberOfDays equal to 0.5."
        )
      );
    }

    // --------------------------------------------------------
    // FULL DAY MUST BE WHOLE NUMBER
    // --------------------------------------------------------

    if (
      this.durationType === "Full Day" &&
      !Number.isInteger(this.numberOfDays)
    ) {
      return next(
        new Error(
          "Full Day leave numberOfDays must be a whole number."
        )
      );
    }

    next();
  }
);

// ==========================================================
// INDEXES
// ==========================================================

// Employee leave history
userLeaveSchema.index({
  userId: 1,
  fromDate: -1,
});

// Employee leave by status
userLeaveSchema.index({
  userId: 1,
  status: 1,
});

// Approval / pending leave queries
userLeaveSchema.index({
  status: 1,
  fromDate: -1,
});

// Leave type based reports
userLeaveSchema.index({
  leaveTypeId: 1,
  fromDate: -1,
});

// Employee + date range queries
userLeaveSchema.index({
  userId: 1,
  fromDate: 1,
  toDate: 1,
});

export const UserLeave = mongoose.model(
  "UserLeave",
  userLeaveSchema
);