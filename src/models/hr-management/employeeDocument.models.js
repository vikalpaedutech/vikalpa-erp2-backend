import mongoose, { Schema } from "mongoose";

const employeeDocumentSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  documentType: { type: String, required: true, trim: true, maxlength: 100 },
  documentName: { type: String, required: true, trim: true, maxlength: 200 },
  documentNumber: { type: String, trim: true, default: "" },
  file: { url: { type: String, default: "" }, localPath: { type: String, default: "" }, fileName: { type: String, default: "" }, mimeType: { type: String, default: "" }, size: { type: Number, min: 0, default: 0 } },
  issueDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null, index: true },
  verificationStatus: { type: String, enum: ["Pending", "Verified", "Rejected"], default: "Pending", index: true },
  verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  verifiedAt: { type: Date, default: null },
  remarks: { type: String, trim: true, default: "" },
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, collection: "employeeDocuments" });

employeeDocumentSchema.index({ employeeId: 1, documentType: 1 });
export const EmployeeDocument = mongoose.models.EmployeeDocument || mongoose.model("EmployeeDocument", employeeDocumentSchema);
