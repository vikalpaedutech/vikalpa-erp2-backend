import mongoose, { Schema } from "mongoose";

const billHistorySchema = new Schema(
  {
    billId: {
      type: Schema.Types.ObjectId,
      ref: "Bills",
      required: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "created",
        "submitted",
        "verified",
        "rejected",
        "resubmitted",
        "approved",
        "marked-payment-pending",
        "paid",
      ],
    },

    stage: {
      type: String,
      trim: true,
      enum: [
        "submission",
        "verification",
        "approval",
        "payment",
      ],
    },

    previousStatus: {
      type: String,
      trim: true,
    },

    newStatus: {
      type: String,
      trim: true,
    },

    actionBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    actionAt: {
      type: Date,
      default: Date.now,
    },

    remarks: {
      type: String,
      trim: true,
    },

    /*
     * Optional reference for payment-related actions.
     */
    paymentReference: {
      type: String,
      trim: true,
    },

    /*
     * Additional information related to
     * a particular workflow action.
     */
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Bill timeline/history
 */
billHistorySchema.index({
  billId: 1,
  createdAt: 1,
});

/*
 * Useful for finding actions performed by a user
 */
billHistorySchema.index({
  actionBy: 1,
  createdAt: -1,
});

/*
 * Useful for workflow/stage based queries
 */
billHistorySchema.index({
  action: 1,
  createdAt: -1,
});

billHistorySchema.index({
  stage: 1,
  createdAt: -1,
});

export const BillHistory = mongoose.model(
  "BillHistory",
  billHistorySchema
);