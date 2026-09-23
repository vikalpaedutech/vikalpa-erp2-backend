import mongoose, { Schema } from "mongoose";

const gamificationUserPointSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventDate: { type: Date, required: true, index: true },
    eventType: {
      type: String,
      enum: ["Self Attendance", "Student Attendance", "PDF Upload", "Calling Absentee", "Marks", "Disciplinary"],
      required: true,
      index: true,
    },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    sourceModel: { type: String, default: null },
    programId: { type: Schema.Types.ObjectId, ref: "Program", default: null },
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", default: null },
    centerId: { type: Schema.Types.ObjectId, ref: "Center", default: null },
    points: { type: Number, required: true },
    pointClassification: { type: String, enum: ["Positive", "Neutral", "Negative"], required: true },
    ruleId: { type: Schema.Types.ObjectId, default: null },
    metricValue: { type: Number, default: null },
    eventTime: { type: Date, default: null },
    description: { type: String, default: "" },
    eventKey: { type: String, required: true, unique: true, index: true },
    calculationRunId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

gamificationUserPointSchema.index({ userId: 1, eventDate: 1 });
gamificationUserPointSchema.index({ userId: 1, eventDate: 1, eventType: 1 });

export const GamificationUserPoint = mongoose.model("GamificationUserPoint", gamificationUserPointSchema);
