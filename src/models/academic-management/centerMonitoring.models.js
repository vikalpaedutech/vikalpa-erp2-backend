import mongoose, { Schema } from "mongoose";

const centerMonitoringSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },

    batchId: {
      type: Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
      index: true,
    },

    districtId: {
      type: Schema.Types.ObjectId,
      ref: "District",
      required: true,
      index: true,
    },

    blockId: {
      type: Schema.Types.ObjectId,
      ref: "Block",
      required: true,
      index: true,
    },

    centerId: {
      type: Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      index: true,
    },

    discipline: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "Poor",
        "Average",
        "Good",
        "Excellent",
        "Camera Off",
      ],
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    remark: {
      type: String,
      trim: true,
      default: "",
    },

    markedBy: {
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

/*
 * Common report/filter queries
 */
centerMonitoringSchema.index({
  programId: 1,
  batchId: 1,
  centerId: 1,
  date: -1,
});

centerMonitoringSchema.index({
  districtId: 1,
  blockId: 1,
  centerId: 1,
  date: -1,
});

centerMonitoringSchema.index({
  programId: 1,
  batchId: 1,
  date: -1,
});

centerMonitoringSchema.index({
  markedBy: 1,
  date: -1,
});

export const CenterMonitoring = mongoose.model(
  "CenterMonitoring",
  centerMonitoringSchema
);