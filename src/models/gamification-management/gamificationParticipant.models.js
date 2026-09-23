import mongoose, { Schema } from "mongoose";

const assignmentSchema = new Schema(
  {
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
    centerId: { type: Schema.Types.ObjectId, ref: "Center", required: true },
  },
  { _id: true }
);

const gamificationParticipantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    assignments: { type: [assignmentSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

gamificationParticipantSchema.index({ "assignments.programId": 1, "assignments.batchId": 1, "assignments.centerId": 1 });

export const GamificationParticipant = mongoose.model("GamificationParticipant", gamificationParticipantSchema);
