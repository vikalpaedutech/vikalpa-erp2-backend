import mongoose, { Schema } from "mongoose";

const userRegionAccessSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    scope: {
      type: String,
      required: true,
      enum:["global", "district", "block", "center"]
    },
    

    districtId: {
      type: Schema.Types.ObjectId,
      ref: "District",
      default: null,
    },

    blockId: {
      type: Schema.Types.ObjectId,
      ref: "Block",
      default: null,
    },

    centerId: {
      type: Schema.Types.ObjectId,
      ref: "Center",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


// // Prevent duplicate district access for the same user
// userRegionAccessSchema.index(
//   { userId: 1, districtId: 1 },
//   {
//     unique: true,
//     partialFilterExpression: {
//       districtId: { $type: "objectId" },
//     },
//   }
// );

// // Prevent duplicate block access for the same user
// userRegionAccessSchema.index(
//   { userId: 1, blockId: 1 },
//   {
//     unique: true,
//     partialFilterExpression: {
//       blockId: { $type: "objectId" },
//     },
//   }
// );

// // Prevent duplicate center access for the same user
// userRegionAccessSchema.index(
//   { userId: 1, centerId: 1 },
//   {
//     unique: true,
//     partialFilterExpression: {
//       centerId: { $type: "objectId" },
//     },
//   }
// );

export const UserRegionAccess = mongoose.model(
  "UserRegionAccess",
  userRegionAccessSchema
);