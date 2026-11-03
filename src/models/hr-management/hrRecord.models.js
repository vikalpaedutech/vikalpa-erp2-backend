import mongoose, { Schema } from "mongoose";

export const HR_MODULES = [
  "employee", "onboarding", "offboarding", "recruitment", "performance", "goal", "payroll",
  "expense", "asset", "helpdesk", "training", "announcement", "policy", "travel", "loan",
  "benefit", "timesheet", "project", "workflow", "skill", "recognition", "survey", "disciplinary",
  "document", "shift", "overtime", "compensation", "gratuity", "tax-declaration", "background-check"
];

const hrRecordSchema = new Schema({
  module: { type: String, required: true, enum: HR_MODULES, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 10000, default: "" },
  status: { type: String, trim: true, default: "Open", maxlength: 60, index: true },
  priority: { type: String, enum: ["Low", "Normal", "High", "Urgent"], default: "Normal" },
  employeeId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  dueDate: { type: Date, default: null },
  amount: { type: Number, min: 0, default: null },
  fields: { type: Schema.Types.Mixed, default: {} },
  comments: [{
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
    createdAt: { type: Date, default: Date.now }
  }],
  history: [{
    action: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
    details: { type: String, default: "" }
  }],
  isArchived: { type: Boolean, default: false, index: true }
}, { timestamps: true, minimize: false });

hrRecordSchema.index({ module: 1, createdAt: -1 });
hrRecordSchema.index({ module: 1, ownerId: 1, updatedAt: -1 });

export const HRRecord = mongoose.models.HRRecord || mongoose.model("HRRecord", hrRecordSchema);
