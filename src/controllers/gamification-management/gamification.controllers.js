import mongoose from "mongoose";
import XLSX from "xlsx";
import { User } from "../../models/user.models.js";
import { Role } from "../../models/permissions-management/role.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { Program } from "../../models/program-management/prgroam.models.js";
import { Batch } from "../../models/program-management/batch.models.js";
import { Center } from "../../models/region-management/center.models.js";
import { GamificationRoleAccess } from "../../models/gamification-management/gamificationRoleAccess.models.js";
import { GamificationParticipant } from "../../models/gamification-management/gamificationParticipant.models.js";
import { GamificationCriteria } from "../../models/gamification-management/gamificationCriteria.models.js";
import { GamificationUserPoint } from "../../models/gamification-management/gamificationUserPoints.models.js";
import { GamificationUserRank } from "../../models/gamification-management/gamificationUserRanks.models.js";
import { getOrCreateCriteria, initiateGamification, updateMonthlyRanking, monthStart, monthEnd } from "../../services/gamification-management/gamificationCalculation.services.js";

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

    const result = await initiateGamification({
      month,
      initiatedBy: admin,
    });

    return res.json({
      success: true,
      data: result,
      message:
        "Gamification source data recalculated and monthly ranking updated.",
    });
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ success: false, message: e.message });
  }
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

    const participant =
      await GamificationParticipant.findOne({
        userId: req.user._id,
        isActive: true,
      }).lean();

    if (!participant) {
      return res.json({
        success: true,
        data: { isParticipant: false },
      });
    }

    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1
    ).padStart(2, "0")}`;

    const ms = monthStart(month);
    const me = monthEnd(month);

    const [monthlyRank, points] = await Promise.all([
      GamificationUserRank.findOne({
        userId: req.user._id,
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
      }).lean(),

      GamificationUserPoint.find({
        userId: req.user._id,
        eventDate: {
          $gte: ms,
          $lte: me,
        },
      })
        .sort({ eventDate: -1, createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    return res.json({
      success: true,
      data: {
        isParticipant: true,
        month,
        monthlyRank,
        points,
      },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

export const getGamificationLeaderboard = async (
  req,
  res
) => {
  try {
    await requireAdmin(req);

    const now = new Date();

    const month =
      clean(req.query.month) ||
      `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
      ).padStart(2, "0")}`;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: "month must be YYYY-MM.",
      });
    }

    const rows = await GamificationUserRank.find({
      year: Number(month.split("-")[0]),
      month: Number(month.split("-")[1]),
    })
      .populate("userId", "userId name email")
      .lean();

    const requestedType =
      String(req.query.periodType || "Monthly") ===
      "Daily"
        ? "Daily"
        : "Monthly";

    const rankingRows = rows
      .map((row) => ({
        ...row,
        rank:
          requestedType === "Daily"
            ? row.todayRank
            : row.monthRank,
        totalPoints:
          requestedType === "Daily"
            ? row.todayPoints
            : row.totalPoints,
        eventCount:
          requestedType === "Daily"
            ? row.todayEventCount
            : row.eventCount,
      }))
      .sort((a, b) => Number(a.rank) - Number(b.rank));

    return res.json({
      success: true,
      data: rankingRows,
      month,
      date: rows[0]?.rankingDate
        ? new Date(rows[0].rankingDate)
            .toISOString()
            .slice(0, 10)
        : null,
      periodType: requestedType,
    });
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ success: false, message: e.message });
  }
};

export const downloadGamificationReport = async (
  req,
  res
) => {
  try {
    await requireAdmin(req);

    const now = new Date();

    const month =
      clean(req.query.month) ||
      `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
      ).padStart(2, "0")}`;

    const format =
      clean(req.query.format).toLowerCase() || "xlsx";

    const ms = monthStart(month);
    const me = monthEnd(month);

    const [ranks, points] = await Promise.all([
      GamificationUserRank.find({
        year: Number(month.split("-")[0]),
        month: Number(month.split("-")[1]),
      })
        .populate("userId", "userId name email")
        .sort({ monthRank: 1 })
        .lean(),

      GamificationUserPoint.find({
        eventDate: {
          $gte: ms,
          $lte: me,
        },
      })
        .populate("userId", "userId name email")
        .populate("programId", "programName")
        .populate("batchId", "batchName")
        .populate("centerId", "centerName")
        .sort({ eventDate: 1 })
        .lean(),
    ]);

    const monthlyRows = ranks.map((row) => ({
      Rank: row.monthRank,
      TodayRank: row.todayRank,
      UserId: row.userId?.userId || "",
      Name: row.userId?.name || "",
      Email: row.userId?.email || "",
      TotalPoints: row.totalPoints,
      TodayPoints: row.todayPoints,
      PositivePoints: row.positivePoints,
      NegativePoints: row.negativePoints,
      Events: row.eventCount,
      Classification: row.pointClassification,
    }));

    const dailyRows = ranks
      .map((row) => ({
        Date: row.rankingDate
          ? new Date(row.rankingDate)
              .toISOString()
              .slice(0, 10)
          : "",
        Rank: row.todayRank,
        UserId: row.userId?.userId || "",
        Name: row.userId?.name || "",
        TodayPoints: row.todayPoints,
        Events: row.todayEventCount,
        Classification:
          row.pointClassification || "Neutral",
      }))
      .sort((a, b) => Number(a.Rank) - Number(b.Rank));

    const pointRows = points.map((p) => ({
      Date: p.eventDate
        ? new Date(p.eventDate).toISOString().slice(0, 10)
        : "",
      UserId: p.userId?.userId || "",
      Name: p.userId?.name || "",
      EventType: p.eventType,
      Points: p.points,
      Classification: p.pointClassification,
      Metric: p.metricValue ?? "",
      Program: p.programId?.programName || "",
      Batch: p.batchId?.batchName || "",
      Center: p.centerId?.centerName || "",
      Description: p.description || "",
    }));

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(monthlyRows),
      "Monthly Ranking"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dailyRows),
      "Current Day Ranking"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(pointRows),
      "Point Ledger"
    );

    const isCsv = format === "csv";

    const buffer = isCsv
      ? XLSX.write(wb, {
          type: "buffer",
          bookType: "csv",
          sheet: wb.SheetNames[0],
        })
      : XLSX.write(wb, {
          type: "buffer",
          bookType: "xlsx",
        });

    res.setHeader(
      "Content-Type",
      isCsv
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="gamification-report-${month}.${
        isCsv ? "csv" : "xlsx"
      }"`
    );

    return res.send(buffer);
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ success: false, message: e.message });
  }
};
