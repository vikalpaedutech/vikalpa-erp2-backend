import mongoose, { Schema } from "mongoose";

const batchSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },

    batchName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    startYear: {
      type: Number,
      required: true,
      min: 2000,
      max: 2100,
    },
    endYear: {
      type: Number,
      required: true,
      min: 2000,
      max: 2100,
      validate: {
        validator: function (value) {
          return value > this.startYear;
        },
        message: "End year must be greater than start year",
      },
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

batchSchema.index({ programId: 1, batchName: 1 }, { unique: true });

export const Batch = mongoose.model("Batch", batchSchema);
