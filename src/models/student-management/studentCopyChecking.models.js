// import mongoose, { Schema } from "mongoose";

// const studentCopyCheckingSchema = new Schema(
//   {
//     studentId: {
//       type: Schema.Types.ObjectId,
//       ref: "Student",
//       required: true,
//     },

//     enrollmentId: {
//       type: Schema.Types.ObjectId,
//       ref: "StudentEnrollment",
//       required: true,
//     },

//     // subjectId: {
//     //   type: Schema.Types.ObjectId,
//     //   ref: "Subject",
//     //   required: true,
//     // },

//      subjectId: {
//       type: String
//     },

//     workType: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     checkDate: {
//       type: Date,
//       required: true,
//     },

//     status: {
//       type: String,
//       required: true,
//       trim: true,
//       enum:["Complete", "Incomplete", "Not-brought"]
//     },

//     checkedBy: {
//       type: Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },

//     remarks: {
//       type: String,
//       trim: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// export const StudentCopyChecking = mongoose.model(
//   "StudentCopyChecking",
//   studentCopyCheckingSchema
// );






import mongoose, { Schema } from "mongoose";

const studentCopyCheckingSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "StudentEnrollment",
      required: true,
    },

    subjectId: {
      type: String,
      required: true,
      trim: true,
    },

    workType: {
      type: String,
      required: true,
      trim: true,
      enum: ["Class Work", "Home Work"],
    },

    checkDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "Complete",
        "Incomplete",
        "Not-brought",
      ],
    },

    checkedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    remarks: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate checking for the same
// student + enrollment + subject + work type + date
studentCopyCheckingSchema.index(
  {
    studentId: 1,
    enrollmentId: 1,
    subjectId: 1,
    workType: 1,
    checkDate: 1,
  },
  {
    unique: true,
  }
);

studentCopyCheckingSchema.index({ enrollmentId: 1, checkDate: 1 });
studentCopyCheckingSchema.index({ checkDate: 1, enrollmentId: 1, workType: 1 });

export const StudentCopyChecking =
  mongoose.model(
    "StudentCopyChecking",
    studentCopyCheckingSchema
  );