import mongoose, { Schema } from "mongoose";

const salaryStructureComponentSchema = new Schema({
  componentId: { type: Schema.Types.ObjectId, ref: "SalaryComponent", required: true },
  calculationType: { type: String, enum: ["FIXED", "PERCENTAGE", "INPUT"], default: "FIXED" },
  amount: { type: Number, min: 0, default: 0 },
  percentage: { type: Number, min: 0, max: 100, default: 0 },
  percentageOf: { type: String, enum: ["BASIC", "GROSS", "CTC", "NONE"], default: "NONE" }
}, { _id: false });

const salaryStructureSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, default: "" },
  currency: { type: String, default: "INR", uppercase: true },
  components: { type: [salaryStructureComponentSchema], default: [] },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, collection: "salaryStructures" });

salaryStructureSchema.index({ name: 1 }, { unique: true });
export const SalaryStructure = mongoose.models.SalaryStructure || mongoose.model("SalaryStructure", salaryStructureSchema);
