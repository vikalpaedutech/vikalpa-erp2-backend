import mongoose, { Schema } from "mongoose";

const classInteractionSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },

    batchId: {
      type: Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },

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

    centerId: {
      type: Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    recordType: {
      type: String,
      required: true,
      trim: true,
      enum: ["Disciplinary", "Interaction"],
    },

    status: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "Indiscipline",
        "Not Attentive",
        "Teacher-Student",
        "Student-Doubt",
      ],
    },

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    remark: {
      type: String,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);


export const ClassInteraction = mongoose.model(
  "ClassInteraction",
  classInteractionSchema
);