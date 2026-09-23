import mongoose, { Schema } from "mongoose";

const districtSchema = new Schema(
  {
    districtId: {
      type: String,
      trim: true,
    },

    districtName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const District = mongoose.model("District", districtSchema);