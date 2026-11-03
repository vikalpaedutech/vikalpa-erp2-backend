import mongoose, { Schema } from "mongoose";

const payrollSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/, index: true },
  status: { type: String, enum: ["Draft", "Calculated", "Approved", "Paid", "Cancelled"], default: "Draft", index: true },
  currency: { type: String, default: "INR" },
  components: {
    basic: { type: Number, min: 0, default: 0 },
    hra: { type: Number, min: 0, default: 0 },
    allowances: { type: Number, min: 0, default: 0 },
    bonus: { type: Number, min: 0, default: 0 },
    overtime: { type: Number, min: 0, default: 0 },
    otherEarnings: { type: Number, min: 0, default: 0 },
    pfEmployeeRate: { type: Number, min: 0, max: 100, default: 12 },
    pfEmployerRate: { type: Number, min: 0, max: 100, default: 12 },
    pfWageCeiling: { type: Number, min: 0, default: 15000 },
    esiEmployeeRate: { type: Number, min: 0, max: 100, default: 0.75 },
    esiEmployerRate: { type: Number, min: 0, max: 100, default: 3.25 },
    esiWageCeiling: { type: Number, min: 0, default: 21000 },
    professionalTax: { type: Number, min: 0, default: 0 },
    tds: { type: Number, min: 0, default: 0 },
    otherDeductions: { type: Number, min: 0, default: 0 },
    unpaidLeaveDays: { type: Number, min: 0, default: 0 },
    workingDays: { type: Number, min: 1, default: 30 }
  },
  attendanceSnapshot: { presentDays: { type: Number, default: 0 }, leaveDays: { type: Number, default: 0 }, absentDays: { type: Number, default: 0 }, unpaidLeaveDays: { type: Number, default: 0 } },
  totals: {
    gross: { type: Number, default: 0 }, pfEmployee: { type: Number, default: 0 }, esiEmployee: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 }, tds: { type: Number, default: 0 }, otherDeductions: { type: Number, default: 0 },
    unpaidLeaveDeduction: { type: Number, default: 0 }, totalDeductions: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 }, pfEmployer: { type: Number, default: 0 }, esiEmployer: { type: Number, default: 0 }
  },
  calculationNotes: [{ type: String }],
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  isArchived: { type: Boolean, default: false }
}, { timestamps: true, minimize: false });

payrollSchema.index({ employeeId: 1, period: 1 }, { unique: true });
export const Payroll = mongoose.models.Payroll || mongoose.model("Payroll", payrollSchema);
