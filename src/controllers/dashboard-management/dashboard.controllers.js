import mongoose from "mongoose";
import XLSX from "xlsx";

import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";
import { StudentAttendance } from "../../models/student-management/studentAttendance.models.js";
import { CenterWiseAttendance } from "../../models/student-management/centerWiseAttendance.models.js";
import { StudentLog } from "../../models/student-management/studentLogs.mdoels.js";
import { StudentMark } from "../../models/student-management/studentMark.models.js";
import { StudentCopyChecking } from "../../models/student-management/studentCopyChecking.models.js";
import { Exam } from "../../models/academic-management/exam.models.js";
import { CallLog } from "../../models/calling-management/callLog.models.js";
import { CallingDetails } from "../../models/calling-management/callingDetails.models.js";
import { Program } from "../../models/program-management/prgroam.models.js";
import { Batch } from "../../models/program-management/batch.models.js";
import { District } from "../../models/region-management/district.models.js";
import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { buildEnrollmentAccessFilter, buildRegionDocumentFilter, getUserScope, isAdminUser } from "../../utils/dashboard-access.utils.js";

const oid = (v) => v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : null;
const parseIds = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
const unique = (v) => [...new Set((v || []).filter(Boolean).map(String))];
const startOfDay = (v) => { const d = new Date(v); d.setHours(0,0,0,0); return d; };
const endOfDay = (v) => { const d = new Date(v); d.setHours(23,59,59,999); return d; };
const dateRange = (q, days = 1) => { const to = endOfDay(q.to || new Date()); const from = startOfDay(q.from || new Date(Date.now() - (days - 1) * 86400000)); if (from > to) throw new ApiError(400, "from cannot be after to"); return { from, to }; };

const studentFieldMap = {
  srn:"SRN", rollNumber:"Roll Number", name:"Name", fatherName:"Father Name", motherName:"Mother Name",
  personalContact:"Personal Contact", parentContact:"Parent Contact", otherContact:"Other Contact", dob:"DOB",
  gender:"Gender", category:"Category", address:"Address", class:"Class", board:"Board", status:"Enrollment Status",
  enrollmentDate:"Enrollment Date", program:"Program", batch:"Batch", district:"District", block:"Block", center:"Center", centerCode:"Center Code"
};
const defaultStudentFields = ["srn","rollNumber","name","fatherName","motherName","parentContact","gender","class","board","status","program","batch","district","block","center"];
const downloadFieldMap = { ...studentFieldMap, absentCount:"Absent Days", totalDays:"Total Days", absentPercentage:"Absent Percentage", attendanceDate:"Attendance Date", attendance:"Attendance" };

const workbookResponse = (res, sheets, filename) => {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows?.length ? rows : [{}]), String(name).slice(0,31));
  const buffer = XLSX.write(wb, { type:"buffer", bookType:"xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}-${Date.now()}.xlsx"`);
  return res.send(buffer);
};
const safeFields = (requested, allowed, defaults) => { const f = parseIds(requested).filter((x) => allowed.includes(x)); return f.length ? unique(f) : defaults; };

function lookup(name, from, localField, foreignField = "_id", as = name) {
  return { $lookup: { from, localField, foreignField, as } };
}
function unwind(path, preserve = true) { return { $unwind: { path: `$${path}`, preserveNullAndEmptyArrays: preserve } }; }
function accessMatch(req, query = {}, status = "active") { return buildEnrollmentAccessFilter(req, query, { status }); }

async function accessibleOptions(req) {
  if (isAdminUser(req)) {
    const [programs,batches,districts,blocks,centers] = await Promise.all([
      Program.find({isActive:true}).select("programName programCode").sort({programName:1}).lean(),
      Batch.find({isActive:true}).select("batchName startYear endYear programId").sort({startYear:-1,batchName:1}).lean(),
      District.find({}).select("districtName").sort({districtName:1}).lean(), Block.find({}).select("blockName districtId").sort({blockName:1}).lean(), Center.find({}).select("centerName centerCode districtId blockId").sort({centerName:1}).lean()
    ]); return {programs,batches,districts,blocks,centers};
  }
  const {programIds,batchIds,regionAccess} = await getUserScope(req.user._id);
  const [programs,batches] = await Promise.all([
    Program.find({_id:{$in:programIds.map(oid).filter(Boolean)},isActive:true}).select("programName programCode").sort({programName:1}).lean(),
    Batch.find({_id:{$in:batchIds.map(oid).filter(Boolean)},isActive:true}).select("batchName startYear endYear programId").sort({startYear:-1,batchName:1}).lean()
  ]);
  const global = regionAccess.some((x)=>String(x.scope).toLowerCase()==="global");
  if (global) {
    const [districts,blocks,centers] = await Promise.all([District.find({}).select("districtName").sort({districtName:1}).lean(),Block.find({}).select("blockName districtId").sort({blockName:1}).lean(),Center.find({}).select("centerName centerCode districtId blockId").sort({centerName:1}).lean()]);
    return {programs,batches,districts,blocks,centers};
  }
  const districtIds=unique(regionAccess.filter(x=>String(x.scope).toLowerCase()==="district"&&x.districtId).map(x=>x.districtId));
  const blockIds=unique(regionAccess.filter(x=>String(x.scope).toLowerCase()==="block"&&x.blockId).map(x=>x.blockId));
  const centerIds=unique(regionAccess.filter(x=>String(x.scope).toLowerCase()==="center"&&x.centerId).map(x=>x.centerId));
  const [districts,blocks,centers] = await Promise.all([
    District.find(districtIds.length?{_id:{$in:districtIds.map(oid)}}:{_id:{$in:[]}}).select("districtName").sort({districtName:1}).lean(),
    Block.find(blockIds.length?{_id:{$in:blockIds.map(oid)}}:{_id:{$in:[]}}).select("blockName districtId").sort({blockName:1}).lean(),
    Center.find(centerIds.length?{_id:{$in:centerIds.map(oid)}}:{_id:{$in:[]}}).select("centerName centerCode districtId blockId").sort({centerName:1}).lean()
  ]);
  const extraBlocks = districtIds.length ? await Block.find({districtId:{$in:districtIds.map(oid)}}).select("blockName districtId").lean() : [];
  const extraCenters = [...extraBlocks.length ? await Center.find({blockId:{$in:extraBlocks.map(x=>x._id)}}).select("centerName centerCode districtId blockId").lean() : [], ...centers];
  return {programs,batches,districts,blocks:[...blocks,...extraBlocks].filter((x,i,a)=>a.findIndex(y=>String(y._id)===String(x._id))===i),centers:extraCenters.filter((x,i,a)=>a.findIndex(y=>String(y._id)===String(x._id))===i)};
}

export const getDashboardOptions = asyncHandler(async (req,res)=>res.json({success:true,data:await accessibleOptions(req)}));
async function assertProgramBatchSelection(req,q){ const o=await accessibleOptions(req); if((o.programs.length>1||o.batches.length>1)&&(!oid(q.programId)||!oid(q.batchId))) throw new ApiError(400,"Program and Batch are mandatory when more than one assigned program/batch is available"); }

function studentLookups() { return [
  lookup("students","students","studentId"), unwind("students"), { $match: { "students.isActive": true } },
  lookup("programs","programs","programId"), unwind("programs"), lookup("batches","batches","batchId"), unwind("batches"),
  lookup("districts","districts","districtId"), unwind("districts"), lookup("blocks","blocks","blockId"), unwind("blocks"), lookup("centers","centers","centerId"), unwind("centers")
]; }
function studentProjection() { return {$project:{_id:1,enrollmentId:"$_id",studentId:1,programId:1,batchId:1,districtId:1,blockId:1,centerId:1,class:1,board:1,enrollmentDate:1,status:1,slcSubmitted:1,slcSubmittedAt:1,srn:"$students.studentSrn",rollNumber:"$students.rollNumber",name:"$students.name",fatherName:"$students.fatherName",motherName:"$students.motherName",personalContact:"$students.personalContact",parentContact:"$students.parentContact",otherContact:"$students.otherContact",dob:"$students.dob",gender:"$students.gender",category:"$students.category",address:"$students.address",program:"$programs.programName",batch:"$batches.batchName",district:"$districts.districtName",block:"$blocks.blockName",center:"$centers.centerName",centerCode:"$centers.centerCode"}}; }

async function studentRowsAggregate(req,q={},status="active") {
  const filter=await accessMatch(req,q,status);
  const pipeline=[{$match:filter},...studentLookups()];
  if(q.srn) pipeline.push({$match:{srn:{$regex:String(q.srn).trim(),$options:"i"}}});
  pipeline.push(studentProjection());
  return StudentEnrollment.aggregate(pipeline).allowDiskUse(true);
}

export const getStudentsDashboard = asyncHandler(async(req,res)=>{
  const rows=await studentRowsAggregate(req,req.query,"active");
  const left=await StudentEnrollment.aggregate([{$match:await accessMatch(req,req.query,"left")},{$group:{_id:{districtId:"$districtId",blockId:"$blockId",centerId:"$centerId"},totalLeft:{$sum:1}}},{$lookup:{from:"districts",localField:"_id.districtId",foreignField:"_id",as:"district"}},{$lookup:{from:"blocks",localField:"_id.blockId",foreignField:"_id",as:"block"}},{$lookup:{from:"centers",localField:"_id.centerId",foreignField:"_id",as:"center"}},{$project:{_id:0,district:{$ifNull:[{$arrayElemAt:["$district.districtName",0]},""]},block:{$ifNull:[{$arrayElemAt:["$block.blockName",0]},""]},center:{$ifNull:[{$arrayElemAt:["$center.centerName",0]},""]},totalLeft:1}}]).allowDiskUse(true);
  const enrollmentIds=rows.map(x=>x.enrollmentId);
  const logs=enrollmentIds.length?await StudentLog.aggregate([{$match:{enrollmentId:{$in:enrollmentIds},requestType:{$in:["slc-request","transfer-student"]}}},{$sort:{createdAt:-1}},{$group:{_id:{enrollmentId:"$enrollmentId",requestType:"$requestType"},status:{$first:"$status"}}}]).allowDiskUse(true):[];
  const logMap=new Map(logs.map(x=>[`${x._id.enrollmentId}:${x._id.requestType}`,x.status]));
  const cardsMap=new Map(); const tableMap=new Map();
  for(const r of rows){
    const pk=`${r.programId}:${r.batchId}`; const card=cardsMap.get(pk)||{programId:String(r.programId),batchId:String(r.batchId),programName:r.program,batchName:r.batch,totalActiveStudents:0,totalEnrolled:0,slcRequested:0,slcTaken:0,totalTransferredRequest:0,totalTransferred:0};
    card.totalActiveStudents++; card.totalEnrolled++;
    const slc=logMap.get(`${r.enrollmentId}:slc-request`), tr=logMap.get(`${r.enrollmentId}:transfer-student`);
    if(r.slcSubmitted||slc) card.slcRequested++; if(slc==="completed") card.slcTaken++; if(tr) card.totalTransferredRequest++; if(tr==="completed") card.totalTransferred++; cardsMap.set(pk,card);
    const tk=`${r.districtId}:${r.blockId}:${r.centerId}`; const t=tableMap.get(tk)||{district:r.district,block:r.block,center:r.center,totalEnrolled:0,totalSlcRequested:0,totalSlcTaken:0,totalTransferRequested:0,totalTransferred:0,totalLeft:0};
    t.totalEnrolled++; if(r.slcSubmitted||slc)t.totalSlcRequested++; if(slc==="completed")t.totalSlcTaken++; if(tr)t.totalTransferRequested++; if(tr==="completed")t.totalTransferred++; tableMap.set(tk,t);
  }
  for(const x of left){const k=`${x.district}:${x.block}:${x.center}`;const t=tableMap.get(k)||{district:x.district,block:x.block,center:x.center,totalEnrolled:0,totalSlcRequested:0,totalSlcTaken:0,totalTransferRequested:0,totalTransferred:0,totalLeft:0};t.totalLeft+=x.totalLeft;tableMap.set(k,t);}
  const count=(key)=>{const m=new Map();for(const r of rows){const k=r[key]||"Unassigned";m.set(k,(m.get(k)||0)+1);}return [...m].map(([label,students])=>({label,students}));};
  res.json({success:true,data:{cards:[...cardsMap.values()],table:[...tableMap.values()],rows,fieldOptions:studentFieldMap,counts:{district:count("district"),block:count("block"),center:count("center"),class:count("class"),board:count("board")}}});
});

export const exportStudentsDashboard=asyncHandler(async(req,res)=>{const rows=await studentRowsAggregate(req,req.query,"active");const fields=safeFields(req.query.fields,Object.keys(studentFieldMap),defaultStudentFields);const out=rows.map(r=>Object.fromEntries(fields.map(f=>[studentFieldMap[f],r[f]??""])));return workbookResponse(res,[["Students",out]],"students-dashboard");});

function attendanceLookup(from,to){return {$lookup:{from:"studentattendances",let:{enrollmentId:"$_id"},pipeline:[{$match:{$expr:{$and:[{$eq:["$enrollmentId","$$enrollmentId"]},{$gte:["$date",from]},{$lte:["$date",to]}]}}},{$sort:{date:-1,createdAt:-1}},{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$date"}},status:{$first:"$status"},date:{$first:"$date"}}}],as:"attendance"}};}
async function attendanceEnrollmentPipeline(req,q,from,to){return [{$match:await accessMatch(req,q,"active")},attendanceLookup(from,to),{$addFields:{presentDays:{$size:{$filter:{input:"$attendance",as:"a",cond:{$eq:["$$a.status","Present"]}}}},markedDays:{$size:"$attendance"}}}];}
async function attendanceGrouped(req, q, from, to) {
  const days = Math.floor((startOfDay(to) - startOfDay(from)) / 86400000) + 1;
  const pipe = await attendanceEnrollmentPipeline(req, q, from, to);
  pipe.push(
    ...studentLookups(),
    {
      $group: {
        _id: {
          programId: "$programId",
          batchId: "$batchId",
          districtId: "$districtId",
          blockId: "$blockId",
          centerId: "$centerId",
        },
        program: { $first: "$programs.programName" },
        batch: { $first: "$batches.batchName" },
        district: { $first: "$districts.districtName" },
        block: { $first: "$blocks.blockName" },
        center: { $first: "$centers.centerName" },
        totalStudent: { $sum: 1 },
        totalPresent: { $sum: "$presentDays" },
        totalMarked: { $sum: "$markedDays" },
      },
    },
    {
      $project: {
        _id: 0,
        programId: "$_id.programId",
        batchId: "$_id.batchId",
        districtId: "$_id.districtId",
        blockId: "$_id.blockId",
        centerId: "$_id.centerId",
        program: 1,
        batch: 1,
        district: 1,
        block: 1,
        center: 1,
        totalStudent: 1,
        totalPresent: 1,
        totalAbsent: {
          $max: [
            { $subtract: [{ $multiply: ["$totalStudent", days] }, "$totalPresent"] },
            0,
          ],
        },
        totalMarked: 1,
        notMarked: { $eq: ["$totalMarked", 0] },
      },
    },
  );
  return StudentEnrollment.aggregate(pipe).allowDiskUse(true);
}

export const getAttendanceDashboard=asyncHandler(async(req,res)=>{const d=startOfDay(req.query.date||new Date());const rows=await attendanceGrouped(req,req.query,d,endOfDay(d));const cardsMap=new Map();for(const r of rows){const k=`${r.programId}:${r.batchId}`;const c=cardsMap.get(k)||{programId:String(r.programId),batchId:String(r.batchId),programName:r.program,batchName:r.batch,totalStudent:0,totalPresent:0,totalAbsent:0};c.totalStudent+=r.totalStudent;c.totalPresent+=r.totalPresent;c.totalAbsent+=r.totalAbsent;cardsMap.set(k,c);}res.json({success:true,data:{date:d,cards:[...cardsMap.values()]}});});
export const exportAttendanceDashboard=asyncHandler(async(req,res)=>{const d=startOfDay(req.query.date||new Date());const rows=await attendanceGrouped(req,req.query,d,endOfDay(d));const cardsMap=new Map();for(const r of rows){const k=`${r.programId}:${r.batchId}`;const c=cardsMap.get(k)||{program:r.program,batch:r.batch,totalStudent:0,totalPresent:0,totalAbsent:0};c.totalStudent+=r.totalStudent;c.totalPresent+=r.totalPresent;c.totalAbsent+=r.totalAbsent;cardsMap.set(k,c);}return workbookResponse(res,[["Attendance",[...cardsMap.values()]]],"attendance-dashboard");});

async function regionAttendanceData(req) {
  const { from, to } = dateRange(req.query, 1);
  const grouped = await attendanceGrouped(req, req.query, from, to);
  let table = grouped;
  if (String(req.query.notMarked).toLowerCase() === "true") table = table.filter((x) => x.totalMarked === 0);
  const summary = grouped.reduce((a, x) => ({ totalStudent: a.totalStudent + x.totalStudent, totalPresent: a.totalPresent + x.totalPresent, totalAbsent: a.totalAbsent + x.totalAbsent }), { totalStudent: 0, totalPresent: 0, totalAbsent: 0 });
  const level = (field) => {
    const m = new Map();
    for (const r of grouped) {
      const id = String(r[`${field}Id`]);
      const x = m.get(id) || { label: r[field], total: 0, present: 0, absent: 0 };
      x.total += r.totalStudent; x.present += r.totalPresent; x.absent += r.totalAbsent; m.set(id, x);
    }
    return [...m.values()].map((x) => ({ ...x, attendanceRate: x.total ? Number((x.present / x.total * 100).toFixed(2)) : 0 }));
  };
  const trendPipe = await attendanceEnrollmentPipeline(req, req.query, from, to);
  trendPipe.push(
    { $unwind: { path: "$attendance", preserveNullAndEmptyArrays: false } },
    { $project: { date: "$attendance.date", present: { $cond: [{ $eq: ["$attendance.status", "Present"] }, 1, 0] }, marked: 1 } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, present: { $sum: "$present" }, marked: { $sum: 1 } } },
    { $project: { _id: 0, date: "$_id", present: 1, total: "$marked", absent: { $subtract: ["$marked", "$present"] }, attendanceRate: { $cond: [{ $gt: ["$marked", 0] }, { $round: [{ $multiply: [{ $divide: ["$present", "$marked"] }, 100] }, 2] }, 0] } } },
    { $sort: { date: 1 } },
  );
  const trend = await StudentEnrollment.aggregate(trendPipe).allowDiskUse(true);
  return { from, to, summary: { ...summary, centers: table.length }, table, trend, district: level("district"), block: level("block"), center: level("center") };
}

export const getStudentAttendanceDashboard=asyncHandler(async(req,res)=>{await assertProgramBatchSelection(req,req.query);const d=await regionAttendanceData(req);res.json({success:true,data:d});});
export const exportStudentAttendanceDashboard=asyncHandler(async(req,res)=>{await assertProgramBatchSelection(req,req.query);const d=await regionAttendanceData(req);return workbookResponse(res,[["Attendance",d.table],["District",d.district],["Block",d.block],["Center",d.center]],"student-attendance-dashboard");});

export const exportAttendanceStudentData=asyncHandler(async(req,res)=>{await assertProgramBatchSelection(req,req.query);const {from,to}=dateRange(req.query,1);const pipe=await attendanceEnrollmentPipeline(req,req.query,from,to);pipe.push(...studentLookups(),{$project:{program:"$programs.programName",batch:"$batches.batchName",srn:"$students.studentSrn",name:"$students.name",father:"$students.fatherName",district:"$districts.districtName",block:"$blocks.blockName",center:"$centers.centerName",attendance:"$attendance"}},{$unwind:{path:"$attendance",preserveNullAndEmptyArrays:true}},{$project:{Program:"$program",Batch:"$batch",SRN:"$srn",Name:"$name",Father:"$father",District:"$district",Block:"$block",Center:"$center",Date:"$attendance.date", "Attendance Data":{$cond:[{$ifNull:["$attendance.date",false]},"Marked","Not Marked"]},Attendance:{$ifNull:["$attendance.status","Absent"]}}});const rows=await StudentEnrollment.aggregate(pipe).allowDiskUse(true);return workbookResponse(res,[["Student Attendance",rows]],"attendance-student-data");});

function callingStatusExpr() {
  const status = { $toLower: { $trim: { input: { $ifNull: ["$lastCall.callingStatus", "$callingDetail.callingStatus"] } } } };
  return { $switch: { branches: [
    { case: { $eq: [status, "connected"] }, then: "Connected" },
    { case: { $in: [status, ["not connected", "wrong number"]] }, then: "Not Connected" },
  ], default: "Pending" } };
}

async function callingRows(req) {
  const { from, to } = dateRange(req.query, 1);
  const days = Math.floor((startOfDay(to) - startOfDay(from)) / 86400000) + 1;
  const pipe = await attendanceEnrollmentPipeline(req, req.query, from, to);
  pipe.push(
    { $match: { $expr: { $lt: ["$presentDays", days] } } },
    ...studentLookups(),
    { $lookup: { from: "callingdetails", let: { eid: "$_id" }, pipeline: [
      { $match: { $expr: { $eq: ["$enrollmentId", "$$eid"] } } },
      { $sort: { updatedAt: -1, createdAt: -1 } }, { $limit: 1 }
    ], as: "callingDetail" } },
    { $unwind: { path: "$callingDetail", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "calllogs", let: { cid: "$callingDetail._id" }, pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ["$callingDetailId", "$$cid"] }, { $gte: ["$createdAt", from] }, { $lte: ["$createdAt", to] }
      ] } } },
      { $sort: { createdAt: -1 } }, { $limit: 1 }
    ], as: "lastCall" } },
    { $unwind: { path: "$lastCall", preserveNullAndEmptyArrays: true } },
    { $project: {
      enrollmentId: "$_id", programId: 1, batchId: 1,
      program: "$programs.programName", batch: "$batches.batchName",
      srn: "$students.studentSrn", name: "$students.name", father: "$students.fatherName",
      contactDetails: { $reduce: {
        input: ["$students.parentContact", "$students.personalContact", "$callingDetail.calledTo", "$callingDetail.contact1", "$callingDetail.contact2", "$callingDetail.contact3"],
        initialValue: "",
        in: { $cond: [
          { $and: [{ $ne: ["$$this", null] }, { $ne: ["$$this", ""] }] },
          { $cond: [{ $eq: ["$$value", ""] }, "$$this", { $concat: ["$$value", " / ", "$$this"] }] },
          "$$value"
        ] }
      } },
      district: "$districts.districtName", block: "$blocks.blockName", center: "$centers.centerName",
      status: callingStatusExpr(),
      callCount: { $cond: [{ $ifNull: ["$lastCall._id", false] }, 1, 0] },
      remark: { $ifNull: ["$lastCall.remark", "$callingDetail.remark"] },
      comment: { $ifNull: ["$lastCall.comment", "$callingDetail.comment"] },
      followUpDate: "$lastCall.followUpDate"
    } }
  );
  return { from, to, rows: await StudentEnrollment.aggregate(pipe).allowDiskUse(true) };
}

export const getAbsenteeCallingDashboard=asyncHandler(async(req,res)=>{const d=await callingRows(req);let rows=d.rows;if(String(req.query.notMarked).toLowerCase()==="true")rows=rows.filter(x=>!x.callCount);const m=new Map();for(const r of rows){const k=`${r.district}:${r.block}:${r.center}`;const x=m.get(k)||{district:r.district,block:r.block,center:r.center,totalStudent:0,totalAbsent:0,connected:0,notConnected:0,pendingCalls:0};x.totalStudent++;x.totalAbsent++;if(r.status==="Connected")x.connected++;else if(r.status==="Not Connected")x.notConnected++;else x.pendingCalls++;m.set(k,x);}return res.json({success:true,data:{from:d.from,to:d.to,summary:{totalStudent:d.rows.length,totalAbsent:d.rows.length,connected:d.rows.filter(x=>x.status==="Connected").length,notConnected:d.rows.filter(x=>x.status==="Not Connected").length,pending:d.rows.filter(x=>x.status==="Pending").length},table:[...m.values()],rows:d.rows}});});
export const exportAbsenteeCallingDashboard=asyncHandler(async(req,res)=>{const d=await callingRows(req);return workbookResponse(res,[["Calling",d.rows]],"absentee-calling-dashboard");});
export const exportCallingStudentData=asyncHandler(async(req,res)=>{const d=await callingRows(req);return workbookResponse(res,[["Absent Calling",d.rows]],"absentee-calling-student-data");});
export const getAbsenteeCallingOverviewDashboard=asyncHandler(async(req,res)=>{const d=startOfDay(req.query.date||new Date());const rows=await attendanceGrouped(req,req.query,d,endOfDay(d));const cards=new Map();for(const r of rows){const k=`${r.programId}:${r.batchId}`;const x=cards.get(k)||{programId:String(r.programId),batchId:String(r.batchId),programName:r.program,batchName:r.batch,totalStudent:0,totalPresent:0,totalAbsent:0};x.totalStudent+=r.totalStudent;x.totalPresent+=r.totalPresent;x.totalAbsent+=r.totalAbsent;cards.set(k,x);}res.json({success:true,data:{date:d,cards:[...cards.values()]}});});
export const exportAbsenteeCallingOverviewDashboard=asyncHandler(async(req,res)=>{const d=startOfDay(req.query.date||new Date());const rows=await attendanceGrouped(req,req.query,d,endOfDay(d));return workbookResponse(res,[["Absentee Calling Overview",rows]],"absentee-calling-overview");});

async function centerUploadData(req) {
  await assertProgramBatchSelection(req, req.query);
  const { from, to } = dateRange(req.query, 1);
  const enrollmentFilter = await accessMatch(req, req.query, "active");
  const pipe = [
    { $match: enrollmentFilter },
    { $group: { _id: { districtId: "$districtId", blockId: "$blockId", centerId: "$centerId", batchId: "$batchId", programId: "$programId" } } },
    { $lookup: { from: "districts", localField: "_id.districtId", foreignField: "_id", as: "district" } },
    { $lookup: { from: "blocks", localField: "_id.blockId", foreignField: "_id", as: "block" } },
    { $lookup: { from: "centers", localField: "_id.centerId", foreignField: "_id", as: "center" } },
    { $lookup: { from: "batches", localField: "_id.batchId", foreignField: "_id", as: "batch" } },
    { $lookup: { from: "programs", localField: "_id.programId", foreignField: "_id", as: "program" } },
    { $lookup: { from: "centerwiseattendances", let: { districtId: "$_id.districtId", blockId: "$_id.blockId", centerId: "$_id.centerId", batchId: "$_id.batchId" }, pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ["$districtId", "$$districtId"] }, { $eq: ["$blockId", "$$blockId"] }, { $eq: ["$centerId", "$$centerId"] }, { $eq: ["$batchId", "$$batchId"] }, { $gte: ["$date", from] }, { $lte: ["$date", to] }
      ] } } }, { $sort: { date: -1 } }
    ], as: "uploads" } },
    { $project: {
      _id: 0, districtId: "$_id.districtId", blockId: "$_id.blockId", centerId: "$_id.centerId", batchId: "$_id.batchId", programId: "$_id.programId",
      district: { $ifNull: [{ $arrayElemAt: ["$district.districtName", 0] }, ""] },
      block: { $ifNull: [{ $arrayElemAt: ["$block.blockName", 0] }, ""] },
      center: { $ifNull: [{ $arrayElemAt: ["$center.centerName", 0] }, ""] },
      batch: { $ifNull: [{ $arrayElemAt: ["$batch.batchName", 0] }, ""] },
      program: { $ifNull: [{ $arrayElemAt: ["$program.programName", 0] }, ""] },
      uploaded: { $cond: [{ $gt: [{ $size: "$uploads" }, 0] }, 1, 0] },
      latestUpload: { $arrayElemAt: ["$uploads.date", 0] },
      fileName: { $arrayElemAt: ["$uploads.file.fileName", 0] },
      fileUrl: { $arrayElemAt: ["$uploads.file.url", 0] }
    } }
  ];
  const allTable = await StudentEnrollment.aggregate(pipe).allowDiskUse(true);
  let table = allTable;
  if (["true", "1"].includes(String(req.query.notUploaded || req.query.notMarked).toLowerCase())) table = table.filter(x => !x.uploaded);
  const summary = { total: allTable.length, uploaded: allTable.filter(x => x.uploaded).length, pending: allTable.filter(x => !x.uploaded).length };
  return { from, to, summary, table, uploads: [], history: table, byCenter: table };
}

export const getCenterAttendanceUploadDashboard=asyncHandler(async(req,res)=>res.json({success:true,data:await centerUploadData(req)}));
export const exportCenterAttendanceUploadDashboard=asyncHandler(async(req,res)=>{const d=await centerUploadData(req);return workbookResponse(res,[["Center Upload Status",d.table]],"center-attendance-upload-dashboard");});

async function downloadStudentRows(req){const type=String(req.query.type||"student-details");const rows=await studentRowsAggregate(req,req.query,"active");if(type==="student-details")return rows;const {from,to}=dateRange(req.query,1);const days=Math.floor((startOfDay(to)-startOfDay(from))/86400000)+1;const pipe=[{$match:await accessMatch(req,req.query,"active")},attendanceLookup(from,to),...studentLookups(),{$project:{enrollmentId:"$_id",studentId:1,program:"$programs.programName",batch:"$batches.batchName",srn:"$students.studentSrn",name:"$students.name",fatherName:"$students.fatherName",district:"$districts.districtName",block:"$blocks.blockName",center:"$centers.centerName",attendance:"$attendance"}}];if(type==="attendance-details")pipe.push({$unwind:{path:"$attendance",preserveNullAndEmptyArrays:true}},{$project:{enrollmentId:1,program:1,batch:1,srn:1,name:1,fatherName:1,district:1,block:1,center:1,attendanceDate:"$attendance.date",attendance:{$ifNull:["$attendance.status","Absent"]}}});else pipe.push({$project:{enrollmentId:1,program:1,batch:1,srn:1,name:1,fatherName:1,district:1,block:1,center:1,absentCount:{$subtract:[days,{$size:{$filter:{input:"$attendance",as:"a",cond:{$eq:["$$a.status","Present"]}}}}]},totalDays:{$literal:days}}},{$addFields:{absentPercentage:{$cond:[{$gt:["$totalDays",0]},{$round:[{$multiply:[{$divide:["$absentCount","$totalDays"]},100]},2]},0]}}});const out=await StudentEnrollment.aggregate(pipe).allowDiskUse(true);if(type==="continuous-absentee")return out.filter(x=>x.absentCount===x.totalDays);if(type==="mostly-absent")return out.sort((a,b)=>b.absentPercentage-a.absentPercentage||b.absentCount-a.absentCount);return out;}
export const getDownloadStudentsOptions=asyncHandler(async(req,res)=>res.json({success:true,data:{fieldOptions:downloadFieldMap,types:[{value:"student-details",label:"Student Details"},{value:"continuous-absentee",label:"Continuous Absentee Students Detail"},{value:"mostly-absent",label:"Mostly Absent Students Detail"},{value:"attendance-details",label:"Student Attendance Details"}]}}));
export const downloadStudentsDashboard=asyncHandler(async(req,res)=>{await assertProgramBatchSelection(req,req.query);const type=String(req.query.type||"student-details");if(type!=="student-details"&&!req.query.from&&!req.query.to)throw new ApiError(400,"Date range is mandatory for this download type");const rows=await downloadStudentRows(req);const allowed=Object.keys(downloadFieldMap).filter(x=>type==="attendance-details"||!['attendanceDate','attendance'].includes(x));const defaults=type==="attendance-details"?[...defaultStudentFields,"attendanceDate","attendance"]:defaultStudentFields;const fields=safeFields(req.query.fields,allowed,defaults);return workbookResponse(res,[["Students",rows.map(r=>Object.fromEntries(fields.map(f=>[downloadFieldMap[f],r[f]??""]))) ]],`students-${type}`);});

async function accessibleExams(req,q={}){const filter={isActive:true};if(!isAdminUser(req)){const {programIds,batchIds}=await getUserScope(req.user._id);filter.programId={$in:programIds.map(oid).filter(Boolean)};filter.batchId={$in:batchIds.map(oid).filter(Boolean)};}for(const f of ["programId","batchId"]){if(oid(q[f]))filter[f]=oid(q[f]);}if(q.subject)filter.subject=q.subject;if(q.examType)filter.examType=q.examType;if(q.from||q.to){const {from,to}=dateRange(q,1);filter.examDate={$gte:from,$lte:to};}return Exam.find(filter).select("_id examName examCode examDate subject examType maximumMarks programId batchId isActive").sort({examDate:-1}).lean();}

async function copyCheckingData(req) {
  await assertProgramBatchSelection(req, req.query);
  const { from, to } = dateRange(req.query, 1);
  const copyDateMatch = {
    $expr: {
      $and: [
        { $eq: ["$enrollmentId", "$$enrollmentId"] },
        { $gte: ["$checkDate", from] },
        { $lte: ["$checkDate", to] },
      ],
    },
  };

  const pipeline = [
    { $match: await accessMatch(req, req.query, "active") },
    ...studentLookups(),
    {
      $lookup: {
        from: "studentcopycheckings",
        let: { enrollmentId: "$_id" },
        pipeline: [
          { $match: copyDateMatch },
          { $project: { subjectId: 1, workType: 1, status: 1, remarks: 1, checkDate: 1 } },
        ],
        as: "copyChecks",
      },
    },
    {
      $addFields: {
        hasCopyChecked: { $gt: [{ $size: "$copyChecks" }, 0] },
        hasClassWorkChecked: {
          $gt: [
            { $size: { $filter: { input: "$copyChecks", as: "copy", cond: { $eq: ["$$copy.workType", "Class Work"] } } } },
            0,
          ],
        },
        hasHomeWorkChecked: {
          $gt: [
            { $size: { $filter: { input: "$copyChecks", as: "copy", cond: { $eq: ["$$copy.workType", "Home Work"] } } } },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          districtId: "$districtId",
          blockId: "$blockId",
          centerId: "$centerId",
        },
        district: { $first: "$districts.districtName" },
        block: { $first: "$blocks.blockName" },
        center: { $first: "$centers.centerName" },
        totalStudents: { $sum: 1 },
        totalCopyChecked: { $sum: { $cond: ["$hasCopyChecked", 1, 0] } },
        classWorkChecked: { $sum: { $cond: ["$hasClassWorkChecked", 1, 0] } },
        homeWorkChecked: { $sum: { $cond: ["$hasHomeWorkChecked", 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        districtId: "$_id.districtId",
        blockId: "$_id.blockId",
        centerId: "$_id.centerId",
        district: 1,
        block: 1,
        center: 1,
        totalStudents: 1,
        totalCopyChecked: 1,
        classWorkChecked: 1,
        homeWorkChecked: 1,
      },
    },
    { $sort: { district: 1, block: 1, center: 1 } },
  ];

  const table = await StudentEnrollment.aggregate(pipeline).allowDiskUse(true);
  const totals = table.reduce(
    (acc, row) => ({
      totalStudents: acc.totalStudents + row.totalStudents,
      totalCopyChecked: acc.totalCopyChecked + row.totalCopyChecked,
      classWorkChecked: acc.classWorkChecked + row.classWorkChecked,
      homeWorkChecked: acc.homeWorkChecked + row.homeWorkChecked,
    }),
    { totalStudents: 0, totalCopyChecked: 0, classWorkChecked: 0, homeWorkChecked: 0 },
  );

  return { from, to, totals, table };
}

export const getCopyCheckingDashboard = asyncHandler(async (req, res) => {
  const data = await copyCheckingData(req);
  res.json({ success: true, data });
});

export const exportCopyCheckingDashboard = asyncHandler(async (req, res) => {
  const data = await copyCheckingData(req);
  return workbookResponse(res, [["Copy Checking", data.table], ["Summary", [data.totals]]], "copy-checking-dashboard");
});

export const exportCopyCheckingStudentData = asyncHandler(async (req, res) => {
  await assertProgramBatchSelection(req, req.query);
  const { from, to } = dateRange(req.query, 1);
  const pipeline = [
    { $match: await accessMatch(req, req.query, "active") },
    ...studentLookups(),
    {
      $lookup: {
        from: "studentcopycheckings",
        let: { enrollmentId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$enrollmentId", "$$enrollmentId"] },
                  { $gte: ["$checkDate", from] },
                  { $lte: ["$checkDate", to] },
                ],
              },
            },
          },
          { $project: { subjectId: 1, workType: 1, status: 1, remarks: 1, checkDate: 1 } },
          { $sort: { checkDate: 1, subjectId: 1, workType: 1 } },
        ],
        as: "copyChecks",
      },
    },
    { $unwind: { path: "$copyChecks", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "subjects",
        let: { subjectCode: "$copyChecks.subjectId" },
        pipeline: [
          { $match: { $expr: { $or: [
            { $eq: ["$subjectCode", "$$subjectCode"] },
            { $eq: ["$subjectName", "$$subjectCode"] },
          ] } } },
          { $project: { _id: 0, subjectName: 1, subjectCode: 1 } },
          { $limit: 1 },
        ],
        as: "subject",
      },
    },
    {
      $project: {
        _id: 0,
        SRN: "$students.studentSrn",
        Name: "$students.name",
        Father: "$students.fatherName",
        District: "$districts.districtName",
        Block: "$blocks.blockName",
        Center: "$centers.centerName",
        Subject: { $ifNull: [{ $arrayElemAt: ["$subject.subjectName", 0] }, { $ifNull: ["$copyChecks.subjectId", ""] }] },
        "Work Type": { $ifNull: ["$copyChecks.workType", ""] },
        "Check Date": { $ifNull: ["$copyChecks.checkDate", ""] },
        Status: { $ifNull: ["$copyChecks.status", ""] },
        Remark: { $ifNull: ["$copyChecks.remarks", ""] },
      },
    },
  ];
  const rows = await StudentEnrollment.aggregate(pipeline).allowDiskUse(true);
  return workbookResponse(res, [["Copy Checking Students", rows]], "copy-checking-student-data");
});

export const getExamsMarksDashboard=asyncHandler(async(req,res)=>{const exams=await accessibleExams(req,req.query);const ids=exams.map(x=>x._id);const rows=await StudentEnrollment.aggregate([{$match:await accessMatch(req,req.query,"active")},{$match:{$expr:{$in:["$programId",exams.map(x=>x.programId)]}}},{$group:{_id:{programId:"$programId",batchId:"$batchId"},totalEnrolled:{$sum:1}}}]).allowDiskUse(true);const markCounts=await StudentMark.aggregate([{$match:{examId:{$in:ids}}},{$group:{_id:"$examId",marksUpdated:{$sum:1}}}]);const ec=new Map(markCounts.map(x=>[String(x._id),x.marksUpdated]));const result=exams.map(e=>{const total=rows.find(r=>String(r._id.programId)===String(e.programId)&&String(r._id.batchId)===String(e.batchId))?.totalEnrolled||0;const updated=ec.get(String(e._id))||0;return {examId:String(e._id),examName:e.examName,examCode:e.examCode,examDate:e.examDate,subject:e.subject,examType:e.examType,maximumMarks:e.maximumMarks,totalEnrolled:total,marksUpdated:Math.min(updated,total),pendingMarks:Math.max(total-updated,0)};});res.json({success:true,data:{rows:result,filters:{exams}}});});

async function examReport(req){const examId=oid(req.query.examId);if(!examId)throw new ApiError(400,"examId is required");const exams=await accessibleExams(req,{});const exam=exams.find(x=>String(x._id)===String(examId));if(!exam)throw new ApiError(403,"Exam is outside your assigned access");const q={...req.query,programId:String(exam.programId),batchId:String(exam.batchId)};const pipe=[{$match:await accessMatch(req,q,"active")},{$lookup:{from:"studentmarks",let:{eid:"$_id"},pipeline:[{$match:{$expr:{$and:[{$eq:["$enrollmentId","$$eid"]},{$eq:["$examId",examId]}]}}},{$limit:1}],as:"mark"}},{$unwind:{path:"$mark",preserveNullAndEmptyArrays:true}},...studentLookups(),{$project:{srn:"$students.studentSrn",name:"$students.name",father:"$students.fatherName",district:"$districts.districtName",block:"$blocks.blockName",center:"$centers.centerName",examId:exam.examCode,examName:exam.examName,totalMarks:exam.maximumMarks,obtainedMarks:{$ifNull:["$mark.obtainedMarks",0]},marksUploaded:{$cond:[{$ifNull:["$mark._id",false]},true,false]}}}];const table=await StudentEnrollment.aggregate(pipe).allowDiskUse(true);return {exam,table};}
export const getExamMarksReport=asyncHandler(async(req,res)=>res.json({success:true,data:await examReport(req)}));
export const exportExamMarksReport=asyncHandler(async(req,res)=>{const d=await examReport(req);return workbookResponse(res,[["Exam Report",d.table]],"exam-marks-report");});
export const exportExamStudentsData=asyncHandler(async(req,res)=>{const d=await examReport(req);return workbookResponse(res,[["Exam Students",d.table]],"exam-students-data");});

export const getDashboardAnalytics=asyncHandler(async(req,res)=>{const [s,a,c,u]=await Promise.all([studentRowsAggregate(req,req.query,"active"),regionAttendanceData(req),callingRows(req),centerUploadData(req)]);res.json({success:true,data:{summary:{activeStudents:unique(s.map(x=>x.studentId)).length,attendanceRecords:a.summary.totalStudent,present:a.summary.totalPresent,absent:a.summary.totalAbsent,callingLogs:c.rows.length,pdfUploads:u.summary.uploaded}}});});
export const exportDashboardAnalytics=asyncHandler(async(req,res)=>{const [s,a,c,u]=await Promise.all([studentRowsAggregate(req,req.query,"active"),regionAttendanceData(req),callingRows(req),centerUploadData(req)]);return workbookResponse(res,[["Students",s],["Attendance",a.table],["Calling",c.rows],["CenterUploads",u.table]],"erp-dashboard");});
