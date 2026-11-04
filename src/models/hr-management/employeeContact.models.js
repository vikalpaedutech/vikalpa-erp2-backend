import mongoose, { Schema } from "mongoose";

const employeeContactSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  contactType: { type: String, enum: ["Emergency", "Family", "Dependent", "Other"], default: "Emergency" },
  name: { type: String, required: true, trim: true },
  relationship: { type: String, trim: true, default: "" },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: "" },
  address: { type: String, trim: true, default: "" },
  isPrimary: { type: Boolean, default: false }
}, { timestamps: true, collection: "employeeContacts" });

employeeContactSchema.index({ employeeId: 1, contactType: 1 });
export const EmployeeContact = mongoose.models.EmployeeContact || mongoose.model("EmployeeContact", employeeContactSchema);
