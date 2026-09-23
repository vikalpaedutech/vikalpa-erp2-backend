import mongoose, { Schema } from "mongoose";

const callLogSchema = new Schema(
  {
    callingTypeId: {
      type: Schema.Types.ObjectId,
      ref: "CallingType",
      required: true,
    },

    callingDetailId: {
      type: Schema.Types.ObjectId,
      ref: "CallingDetails",
      required: true,
    },

    callingStatus: {
      type: String,
      trim: true,
      required: true,
    },

    remark: {
      type: String,
      trim: true,
    },

    followUpDate: {
      type: Date,
      default: null,
    },

    comment: {
      type: String,
      trim: true,
    },

    calledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

callLogSchema.index({
  callingDetailId: 1,
  createdAt: -1,
});

callLogSchema.index({
  callingTypeId: 1,
  createdAt: -1,
});

callLogSchema.index({
  calledBy: 1,
  createdAt: -1,
});

callLogSchema.index({
  followUpDate: 1,
});


callLogSchema.index({ callingDetailId: 1, createdAt: -1, callingStatus: 1 });

export const CallLog = mongoose.model(
  "CallLog",
  callLogSchema
);