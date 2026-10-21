import mongoose, { Schema } from "mongoose";

const billIdSchema = new Schema({
  billNumber: { type: String, required: true, unique: true, index: true, trim: true },
  purpose: { type: String, required: true, trim: true, enum: ["Office", "Orientation", "Center Visit", "MB Center", "Stationary", "Events", "Other"] },
  customPurpose: { type: String, trim: true },
  billDate: { type: Date, required: true },
  description: { type: String, trim: true },
  currency: { type: String, default: "INR", enum: ["INR"] },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
}, { timestamps: true });

billIdSchema.index({ createdBy:  1, createdAt: -1 });
export const BillId = mongoose.model("BillId", billIdSchema);
