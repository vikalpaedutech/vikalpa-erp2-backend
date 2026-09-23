import mongoose, { Schema } from "mongoose";

const monitoringRegionAccessSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

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

/*
 * One active monitoring access per:
 * User + Program + Batch + Center
 *
 * Inactive records can remain for history.
 * If access is revoked and later assigned again,
 * the old inactive record will not block the new active access.
 */
monitoringRegionAccessSchema.index(
  {
    userId: 1,
    programId: 1,
    batchId: 1,
    centerId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
    },
  }
);


export const MonitoringRegionAccess = mongoose.model(
  "MonitoringRegionAccess",
  monitoringRegionAccessSchema
);