import mongoose, { Schema } from "mongoose";

const callingTypeSchema = new Schema(
  {
    callingTitle: {
      type: String,
      required: true,
      trim: true,
    },

    callingTypeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    callingTo: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    callingStatus: [
      {
        type: String,
        enum: [
          "Connected",
          "Not Connected",
          "Wrong Number",
        ],
        trim: true,
      },
    ],

    callingRemark: {
      connected: [
        {
          type: String,
          trim: true,
        },
      ],

      notConnected: [
        {
          type: String,
          trim: true,
        },
      ],
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

export const CallingType = mongoose.model(
  "CallingType",
  callingTypeSchema
);