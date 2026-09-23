import mongoose, { Schema } from "mongoose";

const callingDetailsSchema = new Schema(
  {
    callingTypeId: {
      type: Schema.Types.ObjectId,
      ref: "CallingType",
    //   required: true,
      default: null,
    },

    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "StudentEnrollment",
      default: null,
    },

    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },

    calledDistrict: {
    type: String,
    trim: true,
    default: null,
},

calledBlock: {
    type: String,
    trim: true,
    default: null,
},

calledCenter: {
    type: String,
    trim: true,
    default: null,
},

    assignedTo: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    calledTo: {
      type: String,
      trim: true,
      required: true,
    },

    father: {
      type: String,
      trim: true,
    },

    contact1: {
      type: String,
      trim: true,
    },

    contact2: {
      type: String,
      trim: true,
    },

    contact3: {
      type: String,
      trim: true,
    },

    callingStatus: {
      type: String,
      trim: true,
    },

    remark: {
      type: String,
      trim: true,
    },

    comment: {
      type: String,
      trim: true,
    },

    additionalInformation1: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation2: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation3: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation4: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation5: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation6: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation7: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation8: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation9: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInformation10: {
      type: Schema.Types.Mixed,
      default: null,
    },

    additionalInfo: {
      type: Schema.Types.Mixed,
      default: null,
    },

    callingData: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

callingDetailsSchema.index({
  callingTypeId: 1,
});

callingDetailsSchema.index({
  studentId: 1,
});

callingDetailsSchema.index({
  enrollmentId: 1,
});

callingDetailsSchema.index({
  assignedTo: 1,
});

callingDetailsSchema.index({
  calledDistrict: 1,
  calledBlock: 1,
  calledCenter: 1,
});


callingDetailsSchema.index({ enrollmentId: 1, updatedAt: -1, createdAt: -1 });

export const CallingDetails = mongoose.model(
  "CallingDetails",
  callingDetailsSchema
);