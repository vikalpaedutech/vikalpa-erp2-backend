import mongoose, { Schema } from "mongoose";

const employmentHistorySchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  changeType: { type: String, required: true, enum: ["JOINING", "PROMOTION", "DEPARTMENT_TRANSFER", "DESIGNATION_CHANGE", "LOCATION_TRANSFER", "REPORTING_CHANGE", "SALARY_REVISION", "STATUS_CHANGE", "RESIGNATION", "EXIT", "OTHER"], index: true },
  effectiveDate: { type: Date, required: true, index: true },
  previousValues: { type: Schema.Types.Mixed, default: {} },
  newValues: { type: Schema.Types.Mixed, default: {} },
  reason: { type: String, trim: true, default: "" },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, minimize: false, collection: "employmentHistory" });

employmentHistorySchema.index({ employeeId: 1, effectiveDate: -1 });
export const EmploymentHistory = mongoose.models.EmploymentHistory || mongoose.model("EmploymentHistory", employmentHistorySchema);
