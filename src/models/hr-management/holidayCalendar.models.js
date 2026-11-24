import mongoose, { Schema } from "mongoose";

const applicableToSchema = new Schema({
  allEmployees: { type: Boolean, default: true },
  designations: [{ type: Schema.Types.ObjectId, ref: "Designation" }],
  departments: [{ type: Schema.Types.ObjectId, ref: "Department" }],
  employees: [{ type: Schema.Types.ObjectId, ref: "User" }]
}, { _id: false });

const holidayCalendarSchema = new Schema({
  calendarName: { type: String, required: true, trim: true, maxlength: 150, index: true },
  year: { type: Number, required: true, min: 2000, max: 2100, index: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  type: { type: String, enum: ["National", "Festival", "Regional", "Other"], default: "Other" },
  isOptional: { type: Boolean, default: false, index: true },
  floatingHolidayLimit: { type: Number, default: 2, min: 0, max: 30 },
  selectionStartDate: { type: String, default: "" },
  selectionEndDate: { type: String, default: "" },
  applicableTo: { type: applicableToSchema, default: () => ({ allEmployees: true, designations: [], departments: [], employees: [] }) },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

holidayCalendarSchema.index({ calendarName: 1, year: 1, date: 1, name: 1 }, { unique: true });
holidayCalendarSchema.index({ year: 1, date: 1, isActive: 1 });

export const HolidayCalendar = mongoose.model("HolidayCalendar", holidayCalendarSchema);
