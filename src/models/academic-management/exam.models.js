import mongoose, { Schema } from "mongoose";

const examSchema = new Schema(
  {
    examName: {
      type: String,
      required: true,
      trim: true,
    },

    examCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    examDate: {
      type: Date,
      required: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    examType: {
      type: String,
      trim: true,
      default: "",
    },

    maximumMarks: {
      type: Number,
      required: true,
      min: 0,
    },

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

    board: {
      type: String,
      trim: true,
    },

    class: {
      type: Number,
    },

    marksUploadWithinDays: {
      type: Number,
      min: 0,
    },

    description: {
      type: String,
      trim: true,
    },

    isThereAnyAttachment: {
      type: Boolean,
      default: false,
    },
    
      createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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



export const Exam = mongoose.model("Exam", examSchema);