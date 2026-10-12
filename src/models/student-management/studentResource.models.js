import mongoose, { Schema } from "mongoose";
const studentResourceSchema = new Schema({
 studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, unique: true, index: true },
 enrollmentId: { type: Schema.Types.ObjectId, ref: "StudentEnrollment", default: null },
 tshirtSizeInInches: { type: Number, min: 30, max: 50, default: null },
 botoomLengthInInches: { type: Number, min: 30, max: 50, default: null },
 isDressGiven: { type: String, enum: ["Yes", "No"], default: null },
 homeToCenterDistance: { type: Number, min: 0, default: null },
 isTAGiven: { type: String, enum: ["Yes", "No"], default: null },
 taMonth: { type: Number, min: 1, max: 12, default: null },
 taYear: { type: Number, default: null },
 updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
export const StudentResource = mongoose.model("StudentResource", studentResourceSchema);
