import mongoose, { Schema } from "mongoose";

const userAccessSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    programIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Program",
        },
      ],
      default: [],
    },
    batchIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Batch",
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

userAccessSchema.index({ userId: 1 }, { unique: true });

export const UserAccess = mongoose.model("UserAccess", userAccessSchema);
