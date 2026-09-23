import mongoose, { Schema } from "mongoose";

const studentMarkSchema = new Schema(
  {
    examId: {
      type: Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },

    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "StudentEnrollment",
      required: true,
    },

    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    obtainedMarks: {
      type: Number,
      required: true,
      min: 0,
    },

    attachments: [
      {
        url: {
          type: String,
          trim: true,
        },

        publicId: {
          type: String,
          trim: true,
        },

        fileName: {
          type: String,
          trim: true,
        },
      },
    ],

    filledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

studentMarkSchema.index(
  {
    examId: 1,
    studentId: 1,
  },
  {
    unique: true,
  }
);

studentMarkSchema.index({
  examId: 1,
  enrollmentId: 1,
});

studentMarkSchema.index({
  studentId: 1,
  createdAt: -1,
});


studentMarkSchema.index({ examId: 1, enrollmentId: 1, obtainedMarks: 1 });

export const StudentMark = mongoose.model(
  "StudentMark",
  studentMarkSchema
);