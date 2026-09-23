import mongoose, { Schema } from "mongoose";

const centerSchema = new Schema(
  {
    districtId: {
      type: Schema.Types.ObjectId,
      ref: "District",
      required: true,
    },

    blockId: {
      type: Schema.Types.ObjectId,
      ref: "Block",
      required: true,
    },
    centerCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },

    centerName: {
      type: String,
      required: true,
      trim: true,
    },

    isCenterAvailable: {
      type: Boolean,
      default: true,
    },

    availableClasses: [
      {
        type: Number,
      },
    ],

    availableBoard: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Center = mongoose.model("Center", centerSchema);