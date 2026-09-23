import mongoose, { Schema } from "mongoose";

const centerWiseAttendanceSchema = new Schema(
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

    centerId: {
      type: Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },

    batchId: {
      type: Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },

    file: {
      url: {
        type: String,
        required: true,
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

    date: {
      type: Date,
      required: true,
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);


// ============================================================
// INDEXES
// ============================================================

centerWiseAttendanceSchema.index({
  centerId: 1,
  batchId: 1,
  date: -1,
});

centerWiseAttendanceSchema.index({
  districtId: 1,
  blockId: 1,
  centerId: 1,
  batchId: 1,
  date: -1,
});


export const CenterWiseAttendance = mongoose.model(
  "CenterWiseAttendance",
  centerWiseAttendanceSchema
);