import mongoose, { Schema } from "mongoose";

const blockSchema = new Schema(
  {
    districtId: {
      type: Schema.Types.ObjectId,
      ref: "District",
      required: true,
    },

    blockId: {
      type: String,
      trim: true,
    },

    blockName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Block = mongoose.model("Block", blockSchema);