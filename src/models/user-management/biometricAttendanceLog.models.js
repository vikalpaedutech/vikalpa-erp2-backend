import mongoose, { Schema } from "mongoose";

// Raw Hikvision events are intentionally retained without schema stripping.
const biometricAttendanceLogSchema = new Schema({}, { strict: false, timestamps: false, collection: "biometricAttendanceLogs" });
export const BiometricAttendanceLog = mongoose.models.BiometricAttendanceLog || mongoose.model("BiometricAttendanceLog", biometricAttendanceLogSchema);
