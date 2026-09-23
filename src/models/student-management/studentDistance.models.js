import mongoose, { Schema } from "mongoose";

const studentDistanceSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    singleSideDistance: {
      type: Number,
    },

    bothSideDistance: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

export const StudentDistance = mongoose.model(
  "StudentDistance",
  studentDistanceSchema
);