import mongoose, { Schema } from "mongoose";

// Uses the collection populated by the Hikvision user-sync workflow.
const biometricUserSchema = new Schema({}, { strict: false, timestamps: false, collection: "biometricUsers" });
export const BiometricUser = mongoose.models.BiometricUser || mongoose.model("BiometricUser", biometricUserSchema);
