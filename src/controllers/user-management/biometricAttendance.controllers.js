import XLSX from "xlsx";
import mongoose from "mongoose";
import { BiometricUser } from "../../models/user-management/biometricUser.models.js";
import { BiometricAttendanceLog } from "../../models/user-management/biometricAttendanceLog.models.js";
import { User } from "../../models/user.models.js";
import { UserAttendance } from "../../models/user-management/userAttendance.models.js";

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const dayStart = (value) => new Date(`${value}T00:00:00.000Z`);
const getLocalDay = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Hikvision eventTime includes its device timezone offset. The ISO date portion
  // is the device-local calendar date, which is what the attendance screen uses.
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || d.toISOString().slice(0, 10);
};

export const getBiometricUsers = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 100 } = req.query;
    const filter = {};
    if (search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ employeeName: regex }, { employeeNoString: regex }, { biometricUserId: regex }, { empId: regex }];
    }
    const skip = (Math.max(1, Number(page)) - 1) * Math.min(500, Math.max(1, Number(limit)));
    const [users, total] = await Promise.all([
      BiometricUser.find(filter).sort({ employeeName: 1 }).skip(skip).limit(Math.min(500, Math.max(1, Number(limit)))).lean(),
      BiometricUser.countDocuments(filter),
    ]);
    res.json({ success: true, data: { users, total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load biometric users." });
  }
};

export const getBiometricAttendance = async (req, res) => {
  try {
    const { fromDate, toDate, search = "" } = req.query;
    const filter = {};
    if (fromDate || toDate) {
      filter.eventTime = {};
      if (fromDate && validDate(fromDate)) filter.eventTime.$gte = `${fromDate}T00:00:00`;
      if (toDate && validDate(toDate)) filter.eventTime.$lte = `${toDate}T23:59:59`;
    }
    if (search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ employeeName: regex }, { employeeNoString: regex }, { employeeNo: regex }];
    }
    const logs = await BiometricAttendanceLog.find(filter).sort({ eventTime: -1 }).limit(10000).lean();
    const userRows = await BiometricUser.find({}).lean();
    const byPunchId = new Map();
    for (const u of userRows) {
      for (const key of [u.employeeNoString, u.biometricUserId, u.employeeName, u.rawUser?.name]) if (key != null && key !== "") byPunchId.set(String(key).toLowerCase(), u);
    }
    const grouped = new Map();
    for (const log of logs) {
      const punchId = String(log.employeeNoString ?? log.employeeNo ?? "");
      const bioUser = byPunchId.get(punchId.toLowerCase()) || byPunchId.get(String(log.employeeName || "").toLowerCase());
      const day = getLocalDay(log.eventTime || log.rawEvent?.time);
      const key = `${bioUser?._id || punchId}|${day}`;
      if (!grouped.has(key)) grouped.set(key, { key, date: day, employeeNoString: punchId, employeeName: log.employeeName || bioUser?.employeeName || "-", biometricUser: bioUser || null, logs: [] });
      grouped.get(key).logs.push(log);
    }
    const rows = [...grouped.values()].map(row => ({ ...row, logs: row.logs.sort((a,b) => new Date(a.eventTime || a.rawEvent?.time) - new Date(b.eventTime || b.rawEvent?.time)) }));
    res.json({ success: true, data: { attendance: rows, totalLogs: logs.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load biometric attendance." });
  }
};

export const updateBiometricAttendanceLog = async (req, res) => {
  try {
    const { id } = req.params;
    const { eventTime } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid log ID." });
    const parsed = new Date(eventTime);
    if (!eventTime || Number.isNaN(parsed.getTime())) return res.status(400).json({ success: false, message: "Valid punch date/time is required." });
    const log = await BiometricAttendanceLog.findByIdAndUpdate(id, { $set: { eventTime: String(eventTime), updatedAt: new Date(), manuallyEdited: true, manuallyEditedBy: req.user._id } }, { new: true });
    if (!log) return res.status(404).json({ success: false, message: "Biometric attendance log not found." });
    res.json({ success: true, message: "Punch updated successfully.", data: log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to update punch." });
  }
};


export const getBiometricUserAttendanceByDate = async (req, res) => {
  try {
    const { biometricUserId } = req.params;
    const { fromDate, toDate } = req.query;
    if (!mongoose.Types.ObjectId.isValid(biometricUserId)) return res.status(400).json({ success: false, message: "Invalid biometric user ID." });
    if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate) return res.status(400).json({ success: false, message: "Select a valid date range." });
    const biometricUser = await BiometricUser.findById(biometricUserId).lean();
    if (!biometricUser) return res.status(404).json({ success: false, message: "Biometric user not found." });
    const identifiers = [biometricUser.employeeNoString, biometricUser.biometricUserId].filter(Boolean).map(String);
    const logs = await BiometricAttendanceLog.find({
      eventTime: { $gte: `${fromDate}T00:00:00`, $lte: `${toDate}T23:59:59` },
      $or: [
        { employeeNoString: { $in: identifiers } },
        { "rawEvent.employeeNoString": { $in: identifiers } },
        ...(biometricUser.employeeName ? [{ employeeName: biometricUser.employeeName }] : []),
      ],
    }).sort({ eventTime: 1 }).lean();
    const grouped = new Map();
    for (const log of logs) {
      const day = getLocalDay(log.eventTime || log.rawEvent?.time);
      if (!day) continue;
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day).push(log);
    }
    const rows = [];
    const cursor = dayStart(fromDate);
    const end = dayStart(toDate);
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      const dayLogs = (grouped.get(date) || []).sort((a,b) => new Date(a.eventTime || a.rawEvent?.time) - new Date(b.eventTime || b.rawEvent?.time));
      rows.push({ date, checkIn: dayLogs[0] || null, checkOut: dayLogs.length > 1 ? dayLogs[dayLogs.length - 1] : null, logs: dayLogs });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    res.json({ success: true, data: { biometricUser, attendance: rows } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load employee biometric attendance." });
  }
};

export const manageBiometricUserAttendanceDay = async (req, res) => {
  try {
    const { biometricUserId, date } = req.params;
    const { punchIn, punchOut } = req.body;
    if (!mongoose.Types.ObjectId.isValid(biometricUserId)) return res.status(400).json({ success: false, message: "Invalid biometric user ID." });
    if (!validDate(date)) return res.status(400).json({ success: false, message: "Invalid attendance date." });
    const biometricUser = await BiometricUser.findById(biometricUserId).lean();
    if (!biometricUser) return res.status(404).json({ success: false, message: "Biometric user not found." });
    const parsePunch = (value) => {
      if (!value) return null;
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error("Punch time must be HH:mm or HH:mm:ss.");
      const [h,m,sec="00"] = value.split(":");
      if (+h > 23 || +m > 59 || +sec > 59) throw new Error("Invalid punch time.");
      return `${date}T${h}:${m}:${sec}+05:30`;
    };
    const inTime = parsePunch(punchIn);
    const outTime = parsePunch(punchOut);
    if (!inTime && !outTime) return res.status(400).json({ success: false, message: "Enter at least Punch In or Punch Out." });
    if (inTime && outTime && new Date(outTime) < new Date(inTime)) return res.status(400).json({ success: false, message: "Punch Out cannot be earlier than Punch In." });
    const identifiers = [biometricUser.employeeNoString, biometricUser.biometricUserId].filter(Boolean).map(String);
    const dayLogs = await BiometricAttendanceLog.find({
      eventTime: { $gte: `${date}T00:00:00`, $lte: `${date}T23:59:59` },
      $or: [
        { employeeNoString: { $in: identifiers } },
        { "rawEvent.employeeNoString": { $in: identifiers } },
        ...(biometricUser.employeeName ? [{ employeeName: biometricUser.employeeName }] : []),
      ],
    }).sort({ eventTime: 1 });
    const deviceId = String(biometricUser.deviceId || "");
    const employeeNoString = String(biometricUser.employeeNoString || biometricUser.biometricUserId || "");
    const employeeName = biometricUser.employeeName || biometricUser.rawUser?.name || "Unknown";
    const saveOrCreate = async (existing, eventTime, punchKind) => {
      if (!eventTime) return null;
      if (existing) {
        existing.eventTime = eventTime;
        existing.rawEvent = { ...(existing.rawEvent || {}), time: eventTime, employeeNoString, name: employeeName };
        existing.manuallyEdited = true;
        existing.manuallyEditedBy = req.user._id;
        existing.updatedAt = new Date();
        await existing.save();
        return existing;
      }
      const rawEvent = { major: 5, minor: 75, time: eventTime, name: employeeName, employeeNoString, userType: biometricUser.userType || "normal", manualEntry: true, punchKind };
      return BiometricAttendanceLog.create({
        deviceId, deviceModel: biometricUser.deviceModel || "Hikvision",
        eventIdentifier: `manual-${new mongoose.Types.ObjectId().toString()}`,
        employeeName, employeeNoString, eventTime, eventType: "Authentication",
        major: 5, minor: 75, rawEvent, source: "Hikvision ISAPI",
        syncedAt: new Date(), manuallyCreated: true, createdBy: req.user._id,
      });
    };
    const first = dayLogs[0] || null;
    const last = dayLogs.length > 1 ? dayLogs[dayLogs.length - 1] : null;
    await saveOrCreate(first, inTime, "Punch In");
    // A one-punch day can be upgraded with an out punch by creating a second log.
    if (outTime) await saveOrCreate(last, outTime, "Punch Out");
    else if (dayLogs.length > 1 && last) await BiometricAttendanceLog.deleteOne({ _id: last._id });
    res.json({ success: true, message: "Biometric attendance saved successfully." });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || "Unable to save biometric attendance." });
  }
};

export const pushBiometricAttendance = async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;
    if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate) return res.status(400).json({ success: false, message: "Select a valid date range." });
    const logs = await BiometricAttendanceLog.find({ eventTime: { $gte: `${fromDate}T00:00:00`, $lte: `${toDate}T23:59:59` } }).sort({ eventTime: 1 }).lean();
    const bioUsers = await BiometricUser.find({ empId: { $nin: [null, ""] } }).lean();
    const punchToBio = new Map();
    for (const b of bioUsers) for (const key of [b.employeeNoString, b.biometricUserId, b.employeeName, b.rawUser?.name]) if (key != null && key !== "") punchToBio.set(String(key).toLowerCase(), b);
    const empIds = [...new Set(bioUsers.map(b => String(b.empId)))];
    const users = await User.find({ userId: { $in: empIds } }).select("_id userId isActive").lean();
    const userByEmpId = new Map(users.map(u => [String(u.userId), u]));
    const grouped = new Map();
    let unmatched = 0;
    for (const log of logs) {
      const punchId = String(log.employeeNoString ?? log.employeeNo ?? "");
      const bio = punchToBio.get(punchId.toLowerCase()) || punchToBio.get(String(log.employeeName || "").toLowerCase());
      const user = bio ? userByEmpId.get(String(bio.empId)) : null;
      const day = getLocalDay(log.eventTime || log.rawEvent?.time);
      if (!user || user.isActive === false || !day) { unmatched++; continue; }
      const key = `${user._id}|${day}`;
      const time = new Date(log.eventTime || log.rawEvent?.time);
      if (Number.isNaN(time.getTime())) { unmatched++; continue; }
      if (!grouped.has(key)) grouped.set(key, { user, day, punches: [] });
      grouped.get(key).punches.push(time);
    }
    let created = 0, updated = 0, skippedLeave = 0;
    for (const item of grouped.values()) {
      item.punches.sort((a,b) => a-b);
      const date = dayStart(item.day);
      const checkIn = item.punches[0];
      const checkOut = item.punches.length > 1 ? item.punches[item.punches.length - 1] : null;
      const existing = await UserAttendance.findOne({ userId: item.user._id, date, attendanceType: "Daily Attendance" });
      if (existing?.attendanceSource === "Leave") { skippedLeave++; continue; }
      const payload = { userId: item.user._id, date, attendanceType: "Daily Attendance", status: "Present", attendanceSource: "System", checkIn, checkOut, visitedLocation: null, latitude: 0, longitude: 0, markedBy: req.user._id, manualAttendanceReason: "Imported from Hikvision biometric attendance", remarks: `Biometric punches: ${item.punches.length}`, leaveId: null };
      if (existing) { Object.assign(existing, payload); await existing.save(); updated++; }
      else { await UserAttendance.create(payload); created++; }
    }
    res.json({ success: true, message: "Biometric attendance pushed to user attendances.", data: { totalLogs: logs.length, usersProcessed: grouped.size, created, updated, unmatched, skippedLeave } });
  } catch (error) {
    console.error("PUSH BIOMETRIC ATTENDANCE ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Unable to push biometric attendance." });
  }
};


export const updateBiometricUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { officeTime = "", leaveTime = "", workingHours = "" } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid biometric user ID." });
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (officeTime && !timePattern.test(officeTime)) return res.status(400).json({ success: false, message: "Office Time must be HH:mm." });
    if (leaveTime && !timePattern.test(leaveTime)) return res.status(400).json({ success: false, message: "Leave Time must be HH:mm." });
    if (workingHours !== "" && (!Number.isFinite(Number(workingHours)) || Number(workingHours) < 0 || Number(workingHours) > 24)) return res.status(400).json({ success: false, message: "Working Hours must be between 0 and 24." });
    const user = await BiometricUser.findByIdAndUpdate(id, { $set: { officeTime, leaveTime, workingHours: workingHours === "" ? null : Number(workingHours), updatedAt: new Date(), attendanceTimingsUpdatedAt: new Date(), attendanceTimingsUpdatedBy: req.user?._id } }, { new: true, runValidators: true }).lean();
    if (!user) return res.status(404).json({ success: false, message: "Biometric user not found." });
    return res.json({ success: true, message: "Biometric user timings updated.", data: user });
  } catch (error) { return res.status(500).json({ success: false, message: error.message || "Unable to update biometric user." }); }
};

export const downloadBiometricUsersTemplate = async (_req, res) => {
  const rows = [{ "Employee ID": "", "Office Time (HH:mm)": "", "Leave Time (HH:mm)": "", "Working Hours": "" }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Biometric Timings");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="biometric-user-timings-template.xlsx"');
  return res.send(buffer);
};

export const bulkUpdateBiometricUsers = async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ success: false, message: "Please upload an Excel file." });
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    if (!rows.length) return res.status(400).json({ success: false, message: "The uploaded template has no rows." });
    const normalize = (v) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const get = (row, aliases) => { const key = Object.keys(row).find(k => aliases.includes(normalize(k))); return key ? row[key] : ""; };
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const errors = []; let modified = 0; let unmatched = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const empId = String(get(row, ["employeeid", "empid", "employeeidnumber"])).trim();
      const officeTime = String(get(row, ["officetime", "officetimehhmm"])).trim();
      const leaveTime = String(get(row, ["leavetime", "leavetimehhmm"])).trim();
      const hoursRaw = get(row, ["workinghours"]);
      if (!empId) { errors.push(`Row ${i + 2}: Employee ID is required.`); continue; }
      if (officeTime && !timePattern.test(officeTime)) { errors.push(`Row ${i + 2}: Invalid Office Time; use HH:mm.`); continue; }
      if (leaveTime && !timePattern.test(leaveTime)) { errors.push(`Row ${i + 2}: Invalid Leave Time; use HH:mm.`); continue; }
      const workingHours = hoursRaw === "" ? null : Number(hoursRaw);
      if (workingHours !== null && (!Number.isFinite(workingHours) || workingHours < 0 || workingHours > 24)) { errors.push(`Row ${i + 2}: Working Hours must be between 0 and 24.`); continue; }
      const result = await BiometricUser.updateMany({ empId }, { $set: { officeTime, leaveTime, workingHours, updatedAt: new Date(), attendanceTimingsUpdatedAt: new Date(), attendanceTimingsUpdatedBy: req.user?._id } });
      if (result.matchedCount) modified += result.modifiedCount; else unmatched++;
    }
    return res.json({ success: true, message: "Biometric user timings bulk upload processed.", data: { updated: modified, unmatched, errors } });
  } catch (error) { return res.status(500).json({ success: false, message: error.message || "Unable to process biometric users upload." }); }
};
