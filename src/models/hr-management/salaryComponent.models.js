import mongoose, { Schema } from "mongoose";

const salaryComponentSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
  componentType: { type: String, enum: ["EARNING", "DEDUCTION", "EMPLOYER_CONTRIBUTION"], required: true },
  calculationType: { type: String, enum: ["FIXED", "PERCENTAGE", "FORMULA", "INPUT"], default: "FIXED" },
  defaultAmount: { type: Number, min: 0, default: 0 },
  percentageOf: { type: String, enum: ["BASIC", "GROSS", "CTC", "NONE"], default: "NONE" },
  isStatutory: { type: Boolean, default: false },
  isTaxable: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, collection: "salaryComponents" });

salaryComponentSchema.index({ code: 1 }, { unique: true });
export const SalaryComponent = mongoose.models.SalaryComponent || mongoose.model("SalaryComponent", salaryComponentSchema);
