import mongoose, { Schema } from "mongoose";

const timeRuleSchema = new Schema({
  startTime: String,
  endTime: String,
  point: Number,
  description: { type: String, default: "" },
  timeValidation: { type: String, default: null },
  descriptionOfTimeValidation: { type: String, default: null },
  negativeMarkingOnBreakingTimeValidation: { type: Number, default: 0 },
}, { _id: true });

const rangeRuleSchema = new Schema({
  startRange: Number,
  endRange: Number,
  point: Number,
  description: { type: String, default: "" },
  timeValidation: { type: String, default: null },
  descriptionOfTimeValidation: { type: String, default: null },
  negativeMarkingOnBreakingTimeValidation: { type: Number, default: 0 },
}, { _id: true });

const gamificationCriteriaSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true },
    selfAttendance: { type: [timeRuleSchema], default: [] },
    studentAttendance: { type: [rangeRuleSchema], default: [] },
    pdfUpload: { type: [timeRuleSchema], default: [] },
    callingAbsentee: { type: [rangeRuleSchema], default: [] },
    marks: { type: [rangeRuleSchema], default: [] },
    disciplinary: { type: [rangeRuleSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export const GamificationCriteria = mongoose.model("GamificationCriteria", gamificationCriteriaSchema);
