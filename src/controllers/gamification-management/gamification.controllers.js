import mongoose from "mongoose";
import XLSX from "xlsx";
import { User } from "../../models/user.models.js";
import { Role } from "../../models/permissions-management/role.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { Program } from "../../models/program-management/prgroam.models.js";
import { Batch } from "../../models/program-management/batch.models.js";
import { Center } from "../../models/region-management/center.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";
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

export const getGamificationLeaderboard = async (req, res) => {
  try {
    const scope = clean(req.query.scope) === "all" ? "all" : "region";
    const allowedUserIds = await resolveDashboardUserIds(req, scope);
    const now = new Date();
    const month = clean(req.query.month) || `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ success:false, message:"month must be YYYY-MM." });
    const requestedType = String(req.query.periodType || "Monthly") === "Daily" ? "Daily" : "Monthly";

    if (requestedType === "Daily") {
      const date = clean(req.query.date) || new Date().toISOString().slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success:false, message:"date must be YYYY-MM-DD." });
      const dayStart = startOfDay(date), dayEnd = endOfDay(dayStart);
      const participantFilter = { isActive: true };
      if (Array.isArray(allowedUserIds)) participantFilter.userId = { $in: allowedUserIds };
      const participants = await GamificationParticipant.find(participantFilter).select("userId").lean();
      const userIds = participants.map((x) => x.userId);
      const aggregated = userIds.length ? await GamificationUserPoint.aggregate([
        { $match: { userId: { $in: userIds }, eventDate: { $gte: dayStart, $lte: dayEnd }, ...(clean(req.query.eventType) ? { eventType: clean(req.query.eventType) } : {}) } },
        { $group: { _id: "$userId", totalPoints: { $sum: "$points" }, eventCount: { $sum: 1 } } },
      ]) : [];
      const byUser = new Map(aggregated.map((x) => [String(x._id), x]));
      const users = await User.find({ _id: { $in: userIds } }).select("userId name email").lean();
      const userById = new Map(users.map((x) => [String(x._id), x]));
      const rows = participants.map((participant) => {
        const aggregate = byUser.get(String(participant.userId)) || {};
        const totalPoints = Number(aggregate.totalPoints || 0);
        return { userId: userById.get(String(participant.userId)) || null, totalPoints, todayPoints: totalPoints, eventCount: Number(aggregate.eventCount || 0), todayEventCount: Number(aggregate.eventCount || 0), pointClassification: totalPoints > 0 ? "Positive" : totalPoints < 0 ? "Negative" : "Neutral" };
      }).sort((a,b) => b.totalPoints-a.totalPoints || String(a.userId?._id || "").localeCompare(String(b.userId?._id || "")));
      const rankingRows = rows.map((row,index) => ({ ...row, rank:index+1, todayRank:index+1 }));
      return res.json({ success:true, data:rankingRows, month, date, periodType:"Daily", eventType:clean(req.query.eventType) || null });
    }

    const selectedEventType = clean(req.query.eventType);
    if (selectedEventType) {
      const ms = monthStart(month), me = monthEnd(month);
      const participantFilter = { isActive: true };
      if (Array.isArray(allowedUserIds)) participantFilter.userId = { $in: allowedUserIds };
      const participants = await GamificationParticipant.find(participantFilter).select("userId").lean();
      const userIds = participants.map((x) => x.userId);
      const aggregated = userIds.length ? await GamificationUserPoint.aggregate([
        { $match: { userId: { $in: userIds }, eventDate: { $gte: ms, $lte: me }, eventType: selectedEventType } },
        { $group: { _id: "$userId", totalPoints: { $sum: "$points" }, eventCount: { $sum: 1 } } },
      ]) : [];
      const byUser = new Map(aggregated.map((x) => [String(x._id), x]));
      const users = await User.find({ _id: { $in: userIds } }).select("userId name email").lean();
      const userById = new Map(users.map((x) => [String(x._id), x]));
      const rankingRows = participants.map((participant) => {
        const row = byUser.get(String(participant.userId)) || {};
        const totalPoints = Number(row.totalPoints || 0);
        return { userId: userById.get(String(participant.userId)) || null, totalPoints, eventCount: Number(row.eventCount || 0), pointClassification: totalPoints > 0 ? "Positive" : totalPoints < 0 ? "Negative" : "Neutral" };
      }).sort((a,b) => b.totalPoints-a.totalPoints || String(a.userId?._id || "").localeCompare(String(b.userId?._id || "")))
        .map((row,index) => ({ ...row, rank:index+1 }));
      return res.json({ success:true, data:rankingRows, month, periodType:"Monthly", eventType:selectedEventType });
    }

    const rankFilter = { year:Number(month.split("-")[0]), month:Number(month.split("-")[1]) };
    if (Array.isArray(allowedUserIds)) rankFilter.userId = { $in: allowedUserIds };
    const rows = await GamificationUserRank.find(rankFilter).populate("userId","userId name email").lean();
    const rankingRows = rows.map((row) => ({ ...row, rank:row.monthRank, totalPoints:row.totalPoints, eventCount:row.eventCount }))
      .sort((a,b) => Number(a.rank)-Number(b.rank));
    return res.json({ success:true, data:rankingRows, month, date:null, periodType:"Monthly" });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ success:false, message:e.message });
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
    const month = clean(req.query.month)
      || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ success: false, message: "month must be YYYY-MM." });
    }
    const format = clean(req.query.format).toLowerCase() || "xlsx";
    if (!["xlsx", "csv"].includes(format)) {
      return res.status(400).json({ success: false, message: "format must be xlsx or csv." });
    }

    const ms = monthStart(month);
    const me = monthEnd(month);
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));

    const participantFilter = { isActive: true };
    const pointFilter = { eventDate: { $gte: ms, $lte: me } };
    const rankFilter = { year, month: monthNumber };
    if (Array.isArray(allowedUserIds)) {
      participantFilter.userId = { $in: allowedUserIds };
      pointFilter.userId = { $in: allowedUserIds };
      rankFilter.userId = { $in: allowedUserIds };
    }

    const [participants, points, ranks, criteria] = await Promise.all([
      GamificationParticipant.find(participantFilter)
        .populate("userId", "userId name email")
        .populate("assignments.programId", "programName")
        .populate("assignments.batchId", "batchName")
        .populate("assignments.centerId", "centerName")
        .lean(),
      GamificationUserPoint.find(pointFilter)
        .populate("userId", "userId name email")
        .populate("programId", "programName")
        .populate("batchId", "batchName")
        .populate("centerId", "centerName")
        .sort({ eventDate: 1, eventTime: 1 })
        .lean(),
      GamificationUserRank.find(rankFilter).lean(),
      getOrCreateCriteria(),
    ]);

    const participantById = new Map(
      participants.filter((p) => p.userId?._id).map((p) => [String(p.userId._id), p])
    );
    const participantIds = [...participantById.keys()];
    const assignmentClauses = [];
    for (const participant of participants) {
      for (const assignment of participant.assignments || []) {
        if (assignment.programId?._id && assignment.batchId?._id && assignment.centerId?._id) {
          assignmentClauses.push({
            programId: assignment.programId._id,
            batchId: assignment.batchId._id,
            centerId: assignment.centerId._id,
          });
        }
      }
    }
    const uniqueAssignmentClauses = [...new Map(
      assignmentClauses.map((item) => [`${item.programId}|${item.batchId}|${item.centerId}`, item])
    ).values()];
    const enrollmentCounts = uniqueAssignmentClauses.length
      ? await StudentEnrollment.aggregate([
          { $match: { status: { $nin: ["left", "completed"] }, $or: uniqueAssignmentClauses } },
          { $group: { _id: { programId: "$programId", batchId: "$batchId", centerId: "$centerId" }, total: { $sum: 1 } } },
        ])
      : [];
    const countByAssignment = new Map(enrollmentCounts.map((item) => [
      `${item._id.programId}|${item._id.batchId}|${item._id.centerId}`,
      Number(item.total || 0),
    ]));

    const monthlyRankByUser = new Map(ranks.map((row) => [String(row.userId), Number(row.monthRank || row.rank || 0)]));
    const monthlyPointsByUser = new Map();
    const dailyPointsByUserDate = new Map();
    const reportGroups = new Map();

    for (const point of points) {
      const userId = String(point.userId?._id || point.userId || "");
      if (!userId || !participantById.has(userId)) continue;
      const date = new Date(point.eventDate).toISOString().slice(0, 10);
      const eventConfig = GAMIFICATION_REPORT_EVENTS.find((event) => event.type === point.eventType);
      const maximum = getGamificationPointMaximum(point, criteria);
      const earned = Number(point.points || 0);

      monthlyPointsByUser.set(userId, (monthlyPointsByUser.get(userId) || 0) + earned);
      const dailyKey = `${date}|${userId}`;
      dailyPointsByUserDate.set(dailyKey, (dailyPointsByUserDate.get(dailyKey) || 0) + earned);

      const groupKey = `${date}|${userId}`;
      if (!reportGroups.has(groupKey)) {
        reportGroups.set(groupKey, {
          date,
          userId,
          user: point.userId,
          earned: {},
          maximum: {},
        });
      }
      const group = reportGroups.get(groupKey);
      if (eventConfig) {
        group.earned[eventConfig.type] = (group.earned[eventConfig.type] || 0) + earned;
        group.maximum[eventConfig.type] = (group.maximum[eventConfig.type] || 0) + maximum;
      }
    }

    // Monthly rank fallback keeps the export useful before the rank snapshot is refreshed.
    const computedMonthlyRanks = [...participantIds]
      .sort((a, b) => (monthlyPointsByUser.get(b) || 0) - (monthlyPointsByUser.get(a) || 0) || a.localeCompare(b));
    computedMonthlyRanks.forEach((id, index) => {
      if (!monthlyRankByUser.get(id)) monthlyRankByUser.set(id, index + 1);
    });

    const dailyRankByUserDate = new Map();
    const dailyDates = [...new Set([...dailyPointsByUserDate.keys()].map((key) => key.split("|")[0]))];
    for (const date of dailyDates) {
      const ranked = participantIds
        .map((id) => ({ id, points: dailyPointsByUserDate.get(`${date}|${id}`) || 0 }))
        .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
      ranked.forEach((item, index) => dailyRankByUserDate.set(`${date}|${item.id}`, index + 1));
    }

    const reportRows = [...reportGroups.values()].map((group) => {
      const participant = participantById.get(group.userId);
      const assignments = participant?.assignments || [];
      const centerBatch = [];
      let totalStudentCount = 0;
      for (const assignment of assignments) {
        const center = assignment.centerId?.centerName || "Center";
        const batch = assignment.batchId?.batchName || "Batch";
        const key = `${assignment.programId?._id || assignment.programId}|${assignment.batchId?._id || assignment.batchId}|${assignment.centerId?._id || assignment.centerId}`;
        const count = countByAssignment.get(key) || 0;
        totalStudentCount += count;
        centerBatch.push(`${center} - ${batch}`);
      }

      const row = {
        "S.NO": 0,
        Participant: group.user?.name || participant?.userId?.name || "",
        "Center batch": [...new Set(centerBatch)].join(", "),
        Date: group.date,
        "Total Student Count": totalStudentCount,
      };
      for (const event of GAMIFICATION_REPORT_EVENTS) {
        row[event.earned] = Number(group.earned[event.type] || 0);
        row[event.max] = Number(group.maximum[event.type] || 0);
      }
      row["Today Rank"] = dailyRankByUserDate.get(`${group.date}|${group.userId}`) || "";
      row["Monthly Rank"] = monthlyRankByUser.get(group.userId) || "";
      return row;
    }).sort((a, b) => String(a.Date).localeCompare(String(b.Date)) || Number(a["Today Rank"] || 999999) - Number(b["Today Rank"] || 999999));

    reportRows.forEach((row, index) => { row["S.NO"] = index + 1; });

    const reportHeaders = [
      "S.NO", "Participant", "Center batch", "Date", "Total Student Count",
      "Self-Attendance", "Max Points - Self-Attendance",
      "Student Attendance", "Max Points - Student Attendance",
      "PDF Upload", "Max Points - PDF Upload",
      "Absentee Calling", "Max Points - Absentee Calling",
      "Marks", "Max Points - Marks",
      "Disciplinary", "Max Points - Disciplinary",
      "Today Rank", "Monthly Rank",
    ];

    const monthlyRows = ranks.map((row) => {
      const participant = participantById.get(String(row.userId));
      return {
        Rank: row.monthRank,
        TodayRank: row.todayRank,
        UserId: participant?.userId?.userId || "",
        Name: participant?.userId?.name || "",
        TotalPoints: row.totalPoints,
        TodayPoints: row.todayPoints,
        PositivePoints: row.positivePoints,
        NegativePoints: row.negativePoints,
        Events: row.eventCount,
        Classification: row.pointClassification,
      };
    });

    const reportDate = clean(req.query.date) || new Date().toISOString().slice(0, 10);
    const dailyRows = [...dailyPointsByUserDate.entries()]
      .filter(([key]) => key.startsWith(`${reportDate}|`))
      .map(([key, totalPoints]) => {
        const [, userId] = key.split("|");
        const participant = participantById.get(userId);
        return {
          Date: reportDate,
          Rank: dailyRankByUserDate.get(key) || "",
          UserId: participant?.userId?.userId || "",
          Name: participant?.userId?.name || "",
          TodayPoints: totalPoints,
        };
      });

    const pointRows = points.map((point) => ({
      Date: new Date(point.eventDate).toISOString().slice(0, 10),
      UserId: point.userId?.userId || "",
      Name: point.userId?.name || "",
      EventType: point.eventType,
      Points: point.points,
      MaxPoints: getGamificationPointMaximum(point, criteria),
      Classification: point.pointClassification,
      Metric: point.metricValue ?? "",
      Program: point.programId?.programName || "",
      Batch: point.batchId?.batchName || "",
      Center: point.centerId?.centerName || "",
      Description: point.description || "",
    }));

    const workbook = XLSX.utils.book_new();
    const dailyPerformanceSheet = XLSX.utils.json_to_sheet(reportRows, { header: reportHeaders });
    XLSX.utils.book_append_sheet(workbook, dailyPerformanceSheet, "Daily Performance");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(monthlyRows), "Monthly Ranking");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dailyRows), "Current Day Ranking");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pointRows), "Point Ledger");

    const buffer = format === "csv"
      ? XLSX.write(workbook, { type: "buffer", bookType: "csv", sheet: "Daily Performance" })
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
