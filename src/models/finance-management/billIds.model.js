import mongoose, { Schema } from "mongoose";

const billIdsSchema = new Schema({
  submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expensePurpose: { type: String, required: true, trim: true },
  submissionDate: { type: Date, default: Date.now },
  description: { type: String, trim: true, default: "" },
  currency: { type: String, default: "INR", enum: ["INR"] },
  isActive: { type: Boolean, default: true },
  isPaid: { type: Boolean, default: false },
}, { timestamps: true, collection: "billids" });

export const BillIds = mongoose.models.BillIds || mongoose.model("BillIds", billIdsSchema);
