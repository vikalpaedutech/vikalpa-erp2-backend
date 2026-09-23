import mongoose, { Schema } from "mongoose";

const studentMeasurementSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    shirtSize: {
      type: Number,
    },

    waistSize: {
      type: Number,
    },

    bottomLength: {
      type: Number,
    },

    measuredAt: {
      type: Date,
    },

    allUntisAreIn:{
      type: String
    }
  },
  {
    timestamps: true,
  }
);

export const StudentMeasurement = mongoose.model(
  "StudentMeasurement",
  studentMeasurementSchema
);