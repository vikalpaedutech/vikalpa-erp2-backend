import mongoose, { Schema } from "mongoose";

const billAuditorSchema = new Schema(
  {
    // User who is authorized to verify or approve bills
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Bills submitted by which role this user can handle
    roleAccess: {
      type: String,
      enum: ["CC", "ACI", "CM"],
      required: true,
      trim: true,
    },

    // What action this user is authorized to perform
    action: {
      type: String,
      enum: ["verify", "approve"],
      required: true,
      trim: true,
    },

    // Region level within which the authorization applies
    regionScope: {
      type: String,
      enum: ["global", "district", "block", "center"],
      required: true,
      trim: true,
    },

    // Required for district / block / center scope
    districtId: {
      type: Schema.Types.ObjectId,
      ref: "District",
      default: null,
    },

    // Required for block / center scope
    blockId: {
      type: Schema.Types.ObjectId,
      ref: "Block",
      default: null,
    },

    // Required for center scope
    centerId: {
      type: Schema.Types.ObjectId,
      ref: "Center",
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Prevent duplicate authorization mappings
 *
 * Example:
 * Same user + same role + same action + same region
 * should not be added multiple times.
 */
billAuditorSchema.index(
  {
    userId: 1,
    roleAccess: 1,
    action: 1,
    regionScope: 1,
    districtId: 1,
    blockId: 1,
    centerId: 1,
  },
  {
    unique: true,
  }
);

/*
 * Useful for finding all bill-authorizations
 * assigned to a particular user.
 */
billAuditorSchema.index({
  userId: 1,
  isActive: 1,
});

/*
 * Useful for checking authorization based on
 * role + action + region.
 */
billAuditorSchema.index({
  roleAccess: 1,
  action: 1,
  regionScope: 1,
  districtId: 1,
  blockId: 1,
  centerId: 1,
  isActive: 1,
});

export const BillAuditor = mongoose.model(
  "BillAuditor",
  billAuditorSchema
);