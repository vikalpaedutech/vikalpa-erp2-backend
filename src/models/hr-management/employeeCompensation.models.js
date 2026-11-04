import mongoose, { Schema } from "mongoose";

const revisionSchema = new Schema({
  salaryStructureId: { type: Schema.Types.ObjectId, ref: "SalaryStructure", default: null },
  annualCTC: { type: Number, min: 0, required: true },
  monthlyGross: { type: Number, min: 0, required: true },
  effectiveFrom: { type: Date, required: true },
  reason: { type: String, trim: true, default: "" },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const employeeCompensationSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  employeeProfileId: { type: Schema.Types.ObjectId, ref: "Employee", default: null, index: true },
  salaryStructureId: { type: Schema.Types.ObjectId, ref: "SalaryStructure", default: null },
  annualCTC: { type: Number, min: 0, required: true },
  monthlyGross: { type: Number, min: 0, required: true },
  effectiveFrom: { type: Date, required: true, index: true },
  effectiveTo: { type: Date, default: null },
  status: { type: String, enum: ["ACTIVE", "SUPERSEDED", "INACTIVE"], default: "ACTIVE", index: true },
  revisionHistory: { type: [revisionSchema], default: [] },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, collection: "employeeCompensations" });

employeeCompensationSchema.index({ employeeId: 1, status: 1, effectiveFrom: -1 });
export const EmployeeCompensation = mongoose.models.EmployeeCompensation || mongoose.model("EmployeeCompensation", employeeCompensationSchema);
