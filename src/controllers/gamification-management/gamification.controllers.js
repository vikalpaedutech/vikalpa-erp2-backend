import mongoose from "mongoose";
import XLSX from "xlsx";
import { User } from "../../models/user.models.js";
import { Role } from "../../models/permissions-management/role.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { Program } from "../../models/program-management/prgroam.models.js";
import { Batch } from "../../models/program-management/batch.models.js";
import { Center } from "../../models/region-management/center.models.js";
import { Block } from "../../models/region-management/block.models.js";
import { District } from "../../models/region-management/district.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";
import { UserAttendance } from "../../models/user-management/userAttendance.models.js";
import { getEffectivePermissionCodes } from "../../middlewares/permission.middlewares.js";
import { GamificationRoleAccess } from "../../models/gamification-management/gamificationRoleAccess.models.js";
import { GamificationParticipant } from "../../models/gamification-management/gamificationParticipant.models.js";
import { GamificationCriteria } from "../../models/gamification-management/gamificationCriteria.models.js";
import { GamificationUserPoint } from "../../models/gamification-management/gamificationUserPoints.models.js";
import { GamificationUserRank } from "../../models/gamification-management/gamificationUserRanks.models.js";
import { getOrCreateCriteria, initiateGamification, initiateGamificationDaily, initiateGamificationEventType, updateMonthlyRanking, monthStart, monthEnd, startOfDay, endOfDay } from "../../services/gamification-management/gamificationCalculation.services.js";

const isAdmin = async (userId) => {
  const roles = await UserRole.find({ userId, isActive: true }).populate("roleId","roleCode").lean();
  return roles.some(r => String(r.roleId?.roleCode||"").toLowerCase()==="admin");
};
const requireAdmin = async (req) => {
  if(!req.user?._id) throw Object.assign(new Error("Unauthorized user."),{statusCode:401});
  if(!(await isAdmin(req.user._id))) throw Object.assign(new Error("Only Admin can manage gamification."),{statusCode:403});
  return req.user._id;
};
const validId=(id)=>mongoose.Types.ObjectId.isValid(id);
const clean=(v)=>String(v??"").trim();

const resolveDashboardUserIds = async (req, scope = "region") => {
  const permissions = await getEffectivePermissionCodes(req.user._id);
  const admin = await isAdmin(req.user._id);
  const allAllowed = admin || permissions.has("gamification.all-dashboard.view");
  const regionAllowed = admin || permissions.has("gamification.dashboard.view");
  if (admin) return null;
  if (scope === "all" && !allAllowed) throw Object.assign(new Error("All Gamification Dashboard permission required."), { statusCode: 403 });
  if (scope !== "all" && !regionAllowed && !allAllowed) throw Object.assign(new Error("Gamification Dashboard permission required."), { statusCode: 403 });
  if (scope === "all" || allAllowed && scope === "all") return null;

  const accessRows = await UserRegionAccess.find({ userId: req.user._id }).lean();
  if (accessRows.some((x) => x.scope === "global")) return null;
  const clauses = [];
  for (const access of accessRows) {
    if (access.scope === "district" && access.districtId) clauses.push({ districtId: access.districtId });
    if (access.scope === "block" && access.blockId) clauses.push({ blockId: access.blockId });
    if (access.scope === "center" && access.centerId) clauses.push({ _id: access.centerId });
  }
  if (!clauses.length) return [];
  const centers = await Center.find({ $or: clauses }).select("_id").lean();
  const centerIds = centers.map((x) => x._id);
  const participants = await GamificationParticipant.find({ isActive: true, "assignments.centerId": { $in: centerIds } }).select("userId").lean();
  return [...new Map(participants.map((x) => [String(x.userId), x.userId])).values()];
};

// Derive current-day values from the point ledger instead of trusting a saved
// monthly rank snapshot, which may have been generated on an earlier date.
const getCurrentDayRanking = async (userIds, todayStart, todayEnd) => {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length) return new Map();

  const [aggregated, attendanceRows] = await Promise.all([
    GamificationUserPoint.aggregate([
      { $match: { userId: { $in: ids }, eventDate: { $gte: todayStart, $lte: todayEnd } } },
      { $group: {
        _id: { userId: "$userId", eventType: "$eventType" },
        points: { $sum: "$points" },
        eventCount: { $sum: 1 },
      } },
    ]),
    GamificationUserPoint.aggregate([
      { $match: {
        userId: { $in: ids }, eventDate: { $gte: todayStart, $lte: todayEnd },
        eventType: "Self Attendance", eventTime: { $ne: null },
      } },
      { $group: { _id: "$userId", earliestAttendanceAt: { $min: "$eventTime" } } },
    ]),
  ]);

  const rowsByUser = new Map(ids.map((id) => [String(id), {
    userId: id, todayPoints: 0, todayEventCount: 0, eventPoints: {},
  }]));
  for (const item of aggregated) {
    const row = rowsByUser.get(String(item._id.userId));
    if (!row) continue;
    row.todayPoints += Number(item.points || 0);
    row.todayEventCount += Number(item.eventCount || 0);
    row.eventPoints[item._id.eventType] = Number(item.points || 0);
  }
  const attendanceByUser = new Map(attendanceRows.map((item) => [String(item._id), item.earliestAttendanceAt]));
  const sorted = [...rowsByUser.values()].sort((a, b) => {
    if (b.todayPoints !== a.todayPoints) return b.todayPoints - a.todayPoints;
    const aAttendance = attendanceByUser.get(String(a.userId));
    const bAttendance = attendanceByUser.get(String(b.userId));
    const aTime = aAttendance ? new Date(aAttendance).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = bAttendance ? new Date(bAttendance).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return String(a.userId).localeCompare(String(b.userId));
  });
  return new Map(sorted.map((row, index) => [String(row.userId), { ...row, todayRank: index + 1 }]));
};

export const getGamificationRoleAccess = async (req,res)=>{
  try{
    await requireAdmin(req);
    const roles=await Role.find({}).sort({roleName:1}).lean();
    const access=await GamificationRoleAccess.find({}).lean();
    const map=new Map(access.map(x=>[String(x.roleId),x]));
    return res.json({success:true,data:roles.map(r=>({...r,isAllowed:map.get(String(r._id))?.isAllowed||false,accessId:map.get(String(r._id))?._id||null}))});
  }catch(e){return res.status(e.statusCode||500).json({success:false,message:e.message});}
};

export const updateGamificationRoleAccess = async (req,res)=>{
  try{
    const admin=await requireAdmin(req); const {roleId}=req.params;
    if(!validId(roleId)) return res.status(400).json({success:false,message:"Invalid roleId."});
    const role=await Role.findById(roleId).lean(); if(!role) return res.status(404).json({success:false,message:"Role not found."});
    const item=await GamificationRoleAccess.findOneAndUpdate({roleId},{isAllowed:Boolean(req.body.isAllowed),updatedBy:admin},{new:true,upsert:true,setDefaultsOnInsert:true});
    return res.json({success:true,data:item,message:"Gamification role access updated."});
  }catch(e){return res.status(e.statusCode||500).json({success:false,message:e.message});}
};

const ensureAllowedRole=async(userId)=>{
  const roles=await UserRole.find({userId,isActive:true}).lean();
  const ids=roles.map(r=>r.roleId);
  const allowed=await GamificationRoleAccess.find({roleId:{$in:ids},isAllowed:true}).lean();
  if(!allowed.length) throw new Error("User's role is not enabled for gamification.");
};

const validateAssignments=async(assignments)=>{
  if(!Array.isArray(assignments)||!assignments.length) throw new Error("At least one program, batch and center assignment is required.");
  const seen=new Set(), result=[];
  for(const a of assignments){
    if(!validId(a.programId)||!validId(a.batchId)||!validId(a.centerId)) throw new Error("Each assignment requires valid programId, batchId and centerId.");
    const key=`${a.programId}|${a.batchId}|${a.centerId}`; if(seen.has(key)) continue; seen.add(key);
    const [program,batch,center]=await Promise.all([Program.findOne({_id:a.programId,isActive:true}),Batch.findOne({_id:a.batchId,isActive:true}),Center.findOne({_id:a.centerId,isCenterAvailable:true})]);
    if(!program) throw new Error(`Program not found: ${a.programId}`);
    if(!batch) throw new Error(`Batch not found: ${a.batchId}`);
    if(String(batch.programId)!==String(program._id)) throw new Error("Batch does not belong to selected program.");
    if(!center) throw new Error(`Center not found: ${a.centerId}`);
    result.push({programId:program._id,batchId:batch._id,centerId:center._id});
  }
  return result;
};

export const getGamificationParticipants=async(req,res)=>{
  try{
    await requireAdmin(req);
    const rows=await GamificationParticipant.find({}).populate("userId","userId name email isActive").populate("assignments.programId","programName programCode").populate("assignments.batchId","batchName").populate("assignments.centerId","centerName centerCode").sort({createdAt:-1}).lean();
    return res.json({success:true,data:rows});
  }catch(e){return res.status(e.statusCode||500).json({success:false,message:e.message});}
};

export const createGamificationParticipant=async(req,res)=>{
  try{
    const admin=await requireAdmin(req); const {userId,assignments,isActive=true}=req.body;
    if(!validId(userId)) return res.status(400).json({success:false,message:"Valid userId is required."});
    const user=await User.findById(userId).lean(); if(!user) return res.status(404).json({success:false,message:"User not found."});
    await ensureAllowedRole(userId);
    const normalized=await validateAssignments(assignments);
    const row=await GamificationParticipant.findOneAndUpdate({userId},{assignments:normalized,isActive:Boolean(isActive),assignedBy:admin},{new:true,upsert:true,setDefaultsOnInsert:true});
    return res.status(201).json({success:true,data:row,message:"Gamification participant saved."});
  }catch(e){return res.status(e.statusCode||400).json({success:false,message:e.message});}
};

export const updateGamificationParticipant=async(req,res)=>{
  try{
    const admin=await requireAdmin(req);
    const {id}=req.params;
    if(!validId(id)) return res.status(400).json({success:false,message:"Invalid participant id."});
    const existing=await GamificationParticipant.findById(id);
    if(!existing) return res.status(404).json({success:false,message:"Gamification participant not found."});
    const userId=req.body.userId||existing.userId;
    const user=await User.findById(userId).lean(); if(!user) return res.status(404).json({success:false,message:"User not found."});
    await ensureAllowedRole(userId);
    const normalized=await validateAssignments(req.body.assignments??existing.assignments);
    const row=await GamificationParticipant.findByIdAndUpdate(id,{userId,assignments:normalized,isActive:req.body.isActive===undefined?existing.isActive:Boolean(req.body.isActive),assignedBy:admin},{new:true});
    return res.json({success:true,data:row,message:"Gamification participant updated."});
  }catch(e){return res.status(e.statusCode||400).json({success:false,message:e.message});}
};

export const deleteGamificationParticipant=async(req,res)=>{
  try{await requireAdmin(req); const {id}=req.params; if(!validId(id)) return res.status(400).json({success:false,message:"Invalid participant id."}); await GamificationParticipant.findByIdAndDelete(id); return res.json({success:true,message:"Participant removed."});}
  catch(e){return res.status(e.statusCode||500).json({success:false,message:e.message});}
};

export const getGamificationCriteria=async(req,res)=>{
  try{await requireAdmin(req); const criteria=await getOrCreateCriteria(); return res.json({success:true,data:criteria});}
  catch(e){return res.status(e.statusCode||500).json({success:false,message:e.message});}
};

export const updateGamificationCriteria=async(req,res)=>{
  try{
    const admin=await requireAdmin(req);
    const payload={...req.body,updatedBy:admin};
    if(!payload.name) payload.name="Default Gamification Criteria";
    const criteria=await GamificationCriteria.findOneAndUpdate({isActive:true},payload,{new:true,upsert:true,setDefaultsOnInsert:true});
    return res.json({success:true,data:criteria,message:"Gamification criteria updated."});
  }catch(e){return res.status(e.statusCode||400).json({success:false,message:e.message});}
};

export const initiateGamificationCalculation = async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const now = new Date();

    const month =
      clean(req.body?.month) ||
      `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
      ).padStart(2, "0")}`;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: "month must be YYYY-MM.",
      });
    }

    // Ranking actions must consume the existing point ledger only.
    // Point events are derived from user activity and must not be manually
    // recreated/deleted by an administrator ranking action.
    const result = await updateMonthlyRanking({
      month,
      initiatedBy: admin,
    });

    return res.json({
      success: true,
      data: result,
      message: "Monthly ranking calculated from existing user points.",
    });
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ success: false, message: e.message });
  }
};

export const initiateGamificationDailyCalculation = async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const date = clean(req.body?.date) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
      return res.status(400).json({ success: false, message: "date must be YYYY-MM-DD." });
    }
    // Rebuild point events for the selected date from persisted source activity,
    // then refresh the monthly rank snapshot with that date's points included.
    // This makes the daily button useful when an activity sync was missed.
    const result = await initiateGamificationDaily({
      date: new Date(`${date}T00:00:00.000Z`),
      initiatedBy: admin,
    });
    return res.json({ success: true, data: { ...result, date }, message: `Daily points and ranking recalculated for ${date}.` });
  } catch (e) { return res.status(e.statusCode || 500).json({ success: false, message: e.message }); }
};

export const updateGamificationMonthlyRanking = async (
  req,
  res
) => {
  try {
    const admin = await requireAdmin(req);
    const now = new Date();

    const month =
      clean(req.body?.month) ||
      `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
      ).padStart(2, "0")}`;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: "month must be YYYY-MM.",
      });
    }

    const result = await updateMonthlyRanking({
      month,
      initiatedBy: admin,
    });

    return res.json({
      success: true,
      data: result,
      message:
        "Monthly ranking updated from the existing point ledger.",
    });
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ success: false, message: e.message });
  }
};

export const getMyGamificationDashboard = async (
  req,
  res
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    const participant = await GamificationParticipant.findOne({
      userId: req.user._id,
      isActive: true,
    })
      .populate("assignments.programId", "programName programCode")
      .populate("assignments.batchId", "batchName")
      .populate("assignments.centerId", "centerName centerCode")
      .lean();

    if (!participant) {
      return res.json({ success: true, data: { isParticipant: false } });
    }

    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const ms = monthStart(month);
    const me = monthEnd(month);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(todayStart);

    const [savedMonthlyRank, points, assignmentPoints, activeParticipants] = await Promise.all([
      GamificationUserRank.findOne({
        userId: req.user._id,
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
      }).lean(),
      GamificationUserPoint.find({
        userId: req.user._id,
        eventDate: { $gte: ms, $lte: me },
      })
        .sort({ eventDate: -1, createdAt: -1 })
        .limit(100)
        .lean(),
      GamificationUserPoint.find({
        userId: req.user._id,
        eventDate: { $gte: ms, $lte: me },
      }).lean(),
      GamificationParticipant.find({ isActive: true }).select("userId").lean(),
    ]);

    const todayRanking = await getCurrentDayRanking(
      activeParticipants.map((item) => item.userId), todayStart, todayEnd
    );
    const currentDay = todayRanking.get(String(req.user._id)) || {
      todayPoints: 0, todayEventCount: 0, todayRank: null, eventPoints: {},
    };
    const savedBreakdown = savedMonthlyRank?.eventBreakdown || [];
    const eventTypes = ["Self Attendance", "Student Attendance", "PDF Upload", "Calling Absentee", "Marks", "Disciplinary"];
    const monthlyRank = savedMonthlyRank ? {
      ...savedMonthlyRank,
      todayPoints: currentDay.todayPoints,
      todayEventCount: currentDay.todayEventCount,
      todayRank: currentDay.todayRank,
      rankingDate: todayStart,
      eventBreakdown: eventTypes.map((eventType) => {
        const previous = savedBreakdown.find((item) => item.eventType === eventType);
        const todaysPoint = Number(currentDay.eventPoints[eventType] || 0);
        return {
          eventType,
          totalPoint: Number(previous?.totalPoint || 0),
          todaysPoint,
          pointClassification: Number(previous?.totalPoint || 0) > 0 ? "Positive" : Number(previous?.totalPoint || 0) < 0 ? "Negative" : "Neutral",
        };
      }),
    } : null;

    const classificationFor = (value) =>
      Number(value) > 0 ? "Positive" : Number(value) < 0 ? "Negative" : "Neutral";
    const assignmentBreakdown = (participant.assignments || []).map((assignment) => {
      const programId = assignment.programId?._id || assignment.programId;
      const batchId = assignment.batchId?._id || assignment.batchId;
      const centerId = assignment.centerId?._id || assignment.centerId;
      const scopedPoints = assignmentPoints.filter((point) =>
        String(point.programId || "") === String(programId || "") &&
        String(point.batchId || "") === String(batchId || "") &&
        String(point.centerId || "") === String(centerId || "")
      );
      const totalPoints = scopedPoints.reduce((sum, point) => sum + Number(point.points || 0), 0);
      const todaysPoints = scopedPoints
        .filter((point) => new Date(point.eventDate) >= todayStart && new Date(point.eventDate) <= todayEnd)
        .reduce((sum, point) => sum + Number(point.points || 0), 0);
      const eventTypes = ["Student Attendance", "PDF Upload", "Calling Absentee", "Marks", "Disciplinary"];
      const eventBreakdown = eventTypes.map((eventType) => {
        const matching = scopedPoints.filter((point) => point.eventType === eventType);
        return {
          eventType,
          totalPoint: matching.reduce((sum, point) => sum + Number(point.points || 0), 0),
          todaysPoint: matching
            .filter((point) => new Date(point.eventDate) >= todayStart && new Date(point.eventDate) <= todayEnd)
            .reduce((sum, point) => sum + Number(point.points || 0), 0),
        };
      });
      return {
        assignmentId: String(assignment._id),
        programId: String(programId || ""),
        programName: assignment.programId?.programName || "Program",
        programCode: assignment.programId?.programCode || "",
        batchId: String(batchId || ""),
        batchName: assignment.batchId?.batchName || "Batch",
        centerId: String(centerId || ""),
        centerName: assignment.centerId?.centerName || "Center",
        centerCode: assignment.centerId?.centerCode || "",
        totalPoints,
        todayPoints: todaysPoints,
        pointClassification: classificationFor(totalPoints),
        todayPointClassification: classificationFor(todaysPoints),
        eventBreakdown,
      };
    });

    return res.json({
      success: true,
      data: {
        isParticipant: true,
        month,
        monthlyRank,
        points,
        assignmentBreakdown,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

const GAMIFICATION_RANKING_EVENTS = [
  { type: "Self Attendance", column: "Self Attendance", criteriaKey: "selfAttendance" },
  { type: "Student Attendance", column: "Student Attendance", criteriaKey: "studentAttendance" },
  { type: "PDF Upload", column: "PDF Upload", criteriaKey: "pdfUpload" },
  { type: "Calling Absentee", column: "Absentee Calling", criteriaKey: "callingAbsentee" },
  { type: "Marks", column: "Marks", criteriaKey: "marks" },
  { type: "Disciplinary", column: "Disciplinary", criteriaKey: "disciplinary" },
];

const detailedRankingRows = async ({
  participants,
  periodType,
  startDate,
  endDate,
  rankingDate,
  rankByUser = new Map(),
}) => {
  const userIds = participants.map((item) => item.userId?._id || item.userId).filter(Boolean);
  if (!userIds.length) return [];

  const [pointTotals, roleRows, enrollmentCounts] = await Promise.all([
    GamificationUserPoint.aggregate([
      { $match: { userId: { $in: userIds }, eventDate: { $gte: startDate, $lte: endDate } } },
      { $group: {
        _id: { userId: "$userId", eventType: "$eventType" },
        points: { $sum: "$points" },
        eventCount: { $sum: 1 },
      } },
    ]),
    UserRole.find({ userId: { $in: userIds }, isActive: true })
      .populate("roleId", "roleName roleCode")
      .lean(),
    (async () => {
      const clauses = [];
      for (const participant of participants) {
        for (const assignment of participant.assignments || []) {
          const programId = assignment.programId?._id || assignment.programId;
          const batchId = assignment.batchId?._id || assignment.batchId;
          const centerId = assignment.centerId?._id || assignment.centerId;
          if (programId && batchId && centerId) clauses.push({ programId, batchId, centerId });
        }
      }
      const unique = [...new Map(clauses.map((item) => [
        `${item.programId}|${item.batchId}|${item.centerId}`, item,
      ])).values()];
      if (!unique.length) return new Map();
      const counts = await StudentEnrollment.aggregate([
        { $match: { status: "active", $or: unique } },
        { $group: {
          _id: { programId: "$programId", batchId: "$batchId", centerId: "$centerId" },
          total: { $sum: 1 },
        } },
      ]);
      return new Map(counts.map((item) => [
        `${item._id.programId}|${item._id.batchId}|${item._id.centerId}`,
        Number(item.total || 0),
      ]));
    })(),
  ]);

  const pointsByUser = new Map(userIds.map((id) => [String(id), {}]));
  const eventCountsByUser = new Map(userIds.map((id) => [String(id), 0]));
  for (const item of pointTotals) {
    const userKey = String(item._id.userId);
    const eventMap = pointsByUser.get(userKey);
    if (eventMap) eventMap[item._id.eventType] = Number(item.points || 0);
    eventCountsByUser.set(userKey, (eventCountsByUser.get(userKey) || 0) + Number(item.eventCount || 0));
  }
  const rolesByUser = new Map();
  for (const row of roleRows) {
    const key = String(row.userId);
    const label = row.roleId?.roleName || row.roleId?.roleCode;
    if (!label) continue;
    if (!rolesByUser.has(key)) rolesByUser.set(key, []);
    rolesByUser.get(key).push(label);
  }

  const rows = participants.map((participant) => {
    const user = participant.userId || {};
    const userId = String(user._id || participant.userId);
    const assignments = participant.assignments || [];
    const districts = new Set();
    const blocks = new Set();
    const centers = new Set();
    let totalStudentCount = 0;

    for (const assignment of assignments) {
      const center = assignment.centerId || {};
      const block = center.blockId || {};
      const district = center.districtId || {};
      if (district.districtName) districts.add(district.districtName);
      if (block.blockName) blocks.add(block.blockName);
      if (center.centerName) centers.add(center.centerName);
      const key = `${assignment.programId?._id || assignment.programId}|${assignment.batchId?._id || assignment.batchId}|${center._id || assignment.centerId}`;
      totalStudentCount += enrollmentCounts.get(key) || 0;
    }

    const eventPoints = pointsByUser.get(userId) || {};
    const totalPoints = GAMIFICATION_RANKING_EVENTS.reduce((sum, event) => sum + Number(eventPoints[event.type] || 0), 0);
    const savedRank = rankByUser.get(userId) || {};
    return {
      userId: { _id: user._id || participant.userId, userId: user.userId || "", name: user.name || "", email: user.email || "" },
      rank: Number(savedRank.rank || 0),
      role: [...new Set(rolesByUser.get(userId) || [])].join(", ") || "-",
      district: [...districts].join(", ") || "-",
      block: [...blocks].join(", ") || "-",
      center: [...centers].join(", ") || "-",
      date: periodType === "Daily" ? rankingDate : `${String(startDate.getUTCFullYear())}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}`,
      totalStudentCount,
      selfAttendance: Number(eventPoints["Self Attendance"] || 0),
      studentAttendance: Number(eventPoints["Student Attendance"] || 0),
      pdfUpload: Number(eventPoints["PDF Upload"] || 0),
      absenteeCalling: Number(eventPoints["Calling Absentee"] || 0),
      marks: Number(eventPoints.Marks || 0),
      disciplinary: Number(eventPoints.Disciplinary || 0),
      totalPoints,
      eventCount: eventCountsByUser.get(userId) || 0,
      pointClassification: totalPoints > 0 ? "Positive" : totalPoints < 0 ? "Negative" : "Neutral",
    };
  });

  rows.sort((a, b) => {
    if (periodType === "Monthly" && a.rank && b.rank && a.rank !== b.rank) return a.rank - b.rank;
    return b.totalPoints - a.totalPoints || String(a.userId?._id || "").localeCompare(String(b.userId?._id || ""));
  });
  rows.forEach((row, index) => { row.rank = index + 1; });
  return rows;
};

const populateGamificationParticipants = (query) => query
  .populate("userId", "userId name email")
  .populate({
    path: "assignments.centerId",
    select: "centerName districtId blockId",
    populate: [
      { path: "districtId", model: "District", select: "districtName" },
      { path: "blockId", model: "Block", select: "blockName" },
    ],
  })
  .lean();

export const getGamificationLeaderboard = async (req, res) => {
  try {
    const scope = clean(req.query.scope) === "all" ? "all" : "region";
    const allowedUserIds = await resolveDashboardUserIds(req, scope);
    const now = new Date();
    const month = clean(req.query.month) || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ success: false, message: "month must be YYYY-MM." });
    const periodType = String(req.query.periodType || "Monthly") === "Daily" ? "Daily" : "Monthly";
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const requestedDate = clean(req.query.date) || new Date().toISOString().slice(0, 10);
    if (periodType === "Daily" && (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || Number.isNaN(new Date(`${requestedDate}T00:00:00.000Z`).getTime()))) {
      return res.status(400).json({ success: false, message: "date must be YYYY-MM-DD." });
    }
    const startDate = periodType === "Daily" ? startOfDay(requestedDate) : monthStart(month);
    const endDate = periodType === "Daily" ? endOfDay(startDate) : monthEnd(month);
    const rankingDate = periodType === "Daily" ? startDate.toISOString().slice(0, 10) : month;

    const participantFilter = { isActive: true };
    if (Array.isArray(allowedUserIds)) participantFilter.userId = { $in: allowedUserIds };
    const participants = await populateGamificationParticipants(GamificationParticipant.find(participantFilter));
    const rankFilter = { year, month: monthNumber };
    if (Array.isArray(allowedUserIds)) rankFilter.userId = { $in: allowedUserIds };
    const savedRanks = periodType === "Monthly"
      ? await GamificationUserRank.find(rankFilter).lean()
      : [];
    const rankByUser = new Map(savedRanks.map((row) => [String(row.userId), { rank: row.monthRank }]));

    const data = await detailedRankingRows({
      participants,
      periodType,
      startDate,
      endDate,
      rankingDate,
      rankByUser,
    });
    return res.json({ success: true, data, month, date: periodType === "Daily" ? rankingDate : null, periodType });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const GAMIFICATION_REPORT_EVENTS = [
  { type: "Self Attendance", earned: "Self-Attendance", max: "Max Points - Self-Attendance", rules: "selfAttendance" },
  { type: "Student Attendance", earned: "Student Attendance", max: "Max Points - Student Attendance", rules: "studentAttendance" },
  { type: "PDF Upload", earned: "PDF Upload", max: "Max Points - PDF Upload", rules: "pdfUpload" },
  { type: "Calling Absentee", earned: "Absentee Calling", max: "Max Points - Absentee Calling", rules: "callingAbsentee" },
  { type: "Marks", earned: "Marks", max: "Max Points - Marks", rules: "marks" },
  { type: "Disciplinary", earned: "Disciplinary", max: "Max Points - Disciplinary", rules: "disciplinary" },
];

const getGamificationPointMaximum = (point, criteria) => {
  const overrides = criteria?.eventPointOverrides;
  const override = overrides instanceof Map
    ? overrides.get(point.eventType)
    : overrides?.[point.eventType];
  if (override !== undefined && override !== null && Number.isFinite(Number(override))) {
    return Number(override);
  }

  if (point.maxPoints !== undefined && point.maxPoints !== null) return Number(point.maxPoints);

  const event = GAMIFICATION_REPORT_EVENTS.find((item) => item.type === point.eventType);
  const rules = event ? criteria?.[event.rules] || [] : [];
  const rule = rules.find((item) => String(item._id) === String(point.ruleId))
    || (point.eventType === "PDF Upload" ? rules[0] : null);
  if (!rule) return Math.max(0, Number(point.points || 0));

  if (point.eventType === "Disciplinary") {
    const gradeCount = String(point.description || "").split(" + ").length;
    return Number(rule.point || 0) * 0.5 * Math.max(1, gradeCount);
  }
  const ruleMaximum = Number(rule.point || 0);
  return Number(point.points || 0) < ruleMaximum ? Number(point.points || 0) : ruleMaximum;
};

const buildCriteriaExportRows = (criteria) => {
  const rows = [];
  const sections = [
    ["Self Attendance", "selfAttendance"],
    ["Student Attendance", "studentAttendance"],
    ["PDF Upload", "pdfUpload"],
    ["Absentee Calling", "callingAbsentee"],
    ["Marks", "marks"],
    ["Disciplinary", "disciplinary"],
  ];
  for (const [label, key] of sections) {
    const rules = Array.isArray(criteria?.[key]) ? criteria[key] : [];
    for (const [index, rule] of rules.entries()) {
      rows.push({
        Category: label,
        "Rule #": index + 1,
        "Start Time": rule.startTime || "",
        "End Time": rule.endTime || "",
        "Start Range": rule.startRange ?? "",
        "End Range": rule.endRange ?? "",
        Points: rule.point ?? "",
        "Validation Time": rule.timeValidation || "",
        "Negative Points": rule.negativeMarkingOnBreakingTimeValidation ?? "",
        Description: rule.description || "",
      });
    }
  }
  const overrides = criteria?.eventPointOverrides instanceof Map
    ? Object.fromEntries(criteria.eventPointOverrides.entries())
    : (criteria?.eventPointOverrides || {});
  for (const [eventType, pointValue] of Object.entries(overrides)) {
    rows.push({
      Category: "Admin Point Override",
      "Rule #": "",
      "Start Time": "",
      "End Time": "",
      "Start Range": "",
      "End Range": "",
      Points: pointValue,
      "Validation Time": "",
      "Negative Points": "",
      Description: `${eventType} override`,
    });
  }
  return rows;
};

export const downloadGamificationReport = async (req, res) => {
  try {
    const scope = clean(req.query.scope) === "all" ? "all" : "region";
    const allowedUserIds = await resolveDashboardUserIds(req, scope);
    const permissions = await getEffectivePermissionCodes(req.user._id);
    const admin = await isAdmin(req.user._id);
    if (!admin && !(scope === "all"
      ? permissions.has("gamification.all-dashboard.export")
      : (permissions.has("gamification.dashboard.export") || permissions.has("gamification.all-dashboard.export")))) {
      return res.status(403).json({ success: false, message: "You do not have permission to export this dashboard." });
    }

    const now = new Date();
    const month = clean(req.query.month) || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ success: false, message: "month must be YYYY-MM." });
    }
    const format = clean(req.query.format).toLowerCase() || "xlsx";
    if (!["xlsx", "csv"].includes(format)) {
      return res.status(400).json({ success: false, message: "format must be xlsx or csv." });
    }

    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const monthStartDate = monthStart(month);
    const monthEndDate = monthEnd(month);
    const date = clean(req.query.date) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
      return res.status(400).json({ success: false, message: "date must be YYYY-MM-DD." });
    }
    const participantFilter = { isActive: true };
    if (Array.isArray(allowedUserIds)) participantFilter.userId = { $in: allowedUserIds };
    const participants = await populateGamificationParticipants(GamificationParticipant.find(participantFilter));

    const rankFilter = { year, month: monthNumber };
    if (Array.isArray(allowedUserIds)) rankFilter.userId = { $in: allowedUserIds };
    const [ranks, criteria] = await Promise.all([
      GamificationUserRank.find(rankFilter).lean(),
      getOrCreateCriteria(),
    ]);
    const rankByUser = new Map(ranks.map((row) => [String(row.userId), { rank: row.monthRank }]));
    const [dayRows, monthRows] = await Promise.all([
      detailedRankingRows({
        participants,
        periodType: "Daily",
        startDate: startOfDay(date),
        endDate: endOfDay(startOfDay(date)),
        rankingDate: date,
      }),
      detailedRankingRows({
        participants,
        periodType: "Monthly",
        startDate: monthStartDate,
        endDate: monthEndDate,
        rankingDate: month,
        rankByUser,
      }),
    ]);

    const headers = [
      "Rank", "Participant", "Role", "District", "Block", "Center", "Date",
      "Total Student", "Self Attendance", "Student Attendance", "PDF Upload",
      "Absentee Calling", "Marks", "Disciplinary",
    ];
    const toSheetRows = (rows) => rows.map((row) => ({
      Rank: row.rank,
      Participant: row.userId?.name || "",
      Role: row.role,
      District: row.district,
      Block: row.block,
      Center: row.center,
      Date: row.date,
      "Total Student": row.totalStudentCount,
      "Self Attendance": row.selfAttendance,
      "Student Attendance": row.studentAttendance,
      "PDF Upload": row.pdfUpload,
      "Absentee Calling": row.absenteeCalling,
      Marks: row.marks,
      Disciplinary: row.disciplinary,
    }));

    const workbook = XLSX.utils.book_new();
    const daySheet = XLSX.utils.json_to_sheet(toSheetRows(dayRows), { header: headers });
    const monthSheet = XLSX.utils.json_to_sheet(toSheetRows(monthRows), { header: headers });
    const criteriaSheet = XLSX.utils.json_to_sheet(buildCriteriaExportRows(criteria), {
      header: ["Category", "Rule #", "Start Time", "End Time", "Start Range", "End Range", "Points", "Validation Time", "Negative Points", "Description"],
    });
    XLSX.utils.book_append_sheet(workbook, daySheet, "Day Ranking");
    XLSX.utils.book_append_sheet(workbook, monthSheet, "Monthly Ranking");
    XLSX.utils.book_append_sheet(workbook, criteriaSheet, "Criteria");

    const buffer = format === "csv"
      ? XLSX.write(workbook, { type: "buffer", bookType: "csv", sheet: "Day Ranking" })
      : XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="gamification-report-${month}.${format}"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const initiateGamificationEventTypeCalculation = async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const { eventType, periodType = "Daily", date, month } = req.body || {};
    if (!eventType) return res.status(400).json({ success: false, message: "eventType is required." });
    if (String(periodType).toLowerCase() === "monthly" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) {
      return res.status(400).json({ success: false, message: "month must be YYYY-MM." });
    }
    if (String(periodType).toLowerCase() !== "monthly" && !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return res.status(400).json({ success: false, message: "date must be YYYY-MM-DD." });
    }
    const result = await initiateGamificationEventType({
      eventType, periodType, date: date ? new Date(`${date}T00:00:00.000Z`) : undefined, month, initiatedBy: admin,
    });
    return res.json({ success: true, data: result, message: `${eventType} ${periodType} ranking recalculated successfully.` });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
};

export const updateGamificationEventPointValue = async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const { eventType, pointValue } = req.body || {};
    const allowed = ["Self Attendance", "Student Attendance", "PDF Upload", "Calling Absentee", "Marks", "Disciplinary"];
    const value = Number(pointValue);
    if (!allowed.includes(eventType)) return res.status(400).json({ success: false, message: "Select a valid event type." });
    if (!Number.isFinite(value) || value < -100000 || value > 100000) return res.status(400).json({ success: false, message: "Point value must be a valid number between -100000 and 100000." });

    const criteria = await getOrCreateCriteria();
    const currentOverrides = criteria.eventPointOverrides instanceof Map
      ? Object.fromEntries(criteria.eventPointOverrides.entries())
      : { ...(criteria.eventPointOverrides || {}) };
    currentOverrides[eventType] = value;
    criteria.eventPointOverrides = currentOverrides;
    criteria.updatedBy = admin;
    await criteria.save();

    const result = await GamificationUserPoint.updateMany(
      { eventType },
      { $set: { points: value, pointClassification: value > 0 ? "Positive" : value < 0 ? "Negative" : "Neutral", description: `Admin-adjusted ${eventType} points` } }
    );
    const months = await GamificationUserPoint.aggregate([
      { $match: { eventType } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$eventDate" } } } },
    ]);
    for (const row of months) if (row._id) await updateMonthlyRanking({ month: row._id, initiatedBy: admin });
    return res.json({ success: true, data: { eventType, pointValue: value, modifiedDocuments: result.modifiedCount || 0, affectedMonths: months.length }, message: `${eventType} point value updated for all existing users and future recalculations.` });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
};
