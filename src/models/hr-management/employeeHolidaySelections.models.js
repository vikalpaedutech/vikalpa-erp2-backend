import mongoose, { Schema } from "mongoose";

const selectedHolidaySchema = new Schema({
  holidayId: { type: Schema.Types.ObjectId, ref: "HolidayCalendar", required: true },
  holidayName: { type: String, required: true },
  date: { type: String, required: true },
  selectedAt: { type: Date, default: Date.now }
}, { _id: false });

const employeeHolidaySelectionsSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  holidayCalendarId: { type: String, required: true, index: true },
  calendarName: { type: String, required: true },
  year: { type: Number, required: true, index: true },
  selectedHolidays: { type: [selectedHolidaySchema], default: [] },
  totalAllowed: { type: Number, required: true, min: 0 },
  totalSelected: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["Draft", "Confirmed"], default: "Confirmed" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

employeeHolidaySelectionsSchema.index({ employeeId: 1, holidayCalendarId: 1 }, { unique: true });
export const EmployeeHolidaySelections = mongoose.model("EmployeeHolidaySelections", employeeHolidaySelectionsSchema);
