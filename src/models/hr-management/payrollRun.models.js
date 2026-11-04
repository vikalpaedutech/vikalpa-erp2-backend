import mongoose, { Schema } from "mongoose";

const payrollRunSchema = new Schema({
  period: { type: String, required: true, match: /^\\d{4}-(0[1-9]|1[0-2])$/, index: true },
  status: { type: String, enum: ["Draft", "Processing", "Calculated", "Approved", "Paid", "Cancelled"], default: "Draft", index: true },
  employeeCount: { type: Number, default: 0 },
  totalGross: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  totalNetPay: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  calculatedAt: { type: Date, default: null },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  isArchived: { type: Boolean, default: false }
}, { timestamps: true, collection: "payrollRuns" });

payrollRunSchema.index({ period: 1 }, { unique: true });
export const PayrollRun = mongoose.models.PayrollRun || mongoose.model("PayrollRun", payrollRunSchema);
