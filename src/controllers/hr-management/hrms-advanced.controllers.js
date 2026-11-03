import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import { Payroll } from "../../models/hr-management/payroll.models.js";
import { HRRecord } from "../../models/hr-management/hrRecord.models.js";
import { UserAttendance } from "../../models/user-management/userAttendance.models.js";
import { UserLeave } from "../../models/user-management/userLeave.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { User } from "../../models/user.models.js";
import { ApiResponse } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

async function adminOnly(req) {
  if (req.user?.isAdmin === true) return true;
  const roles = await UserRole.find({ userId: req.user._id, isActive: true }).populate("roleId", "roleCode roleName").lean();
  return roles.some(({ roleId }) => [roleId?.roleCode, roleId?.roleName].filter(Boolean).some(v => ["admin", "administrator"].includes(String(v).toLowerCase())));
}
function requireAdmin(ok) { if (!ok) throw new ApiError(403, "Administrator access is required for payroll operations"); }
function monthRange(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ""))) throw new ApiError(400, "period must use YYYY-MM format");
  const [y,m] = period.split("-").map(Number);
  return { start: new Date(y,m-1,1), end: new Date(y,m,1) };
}
const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v, d=0) => Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d;

async function attendanceSnapshot(employeeId, period) {
  const {start,end} = monthRange(period);
  const rows = await UserAttendance.aggregate([
    {$match:{userId:new mongoose.Types.ObjectId(employeeId), date:{$gte:start,$lt:end}}},
    {$group:{_id:"$status", count:{$sum:1}}}
  ]);
  const counts = Object.fromEntries(rows.map(r=>[r._id,r.count]));
  const approvedLeaves = await UserLeave.find({
    userId: employeeId, status:"Approved", fromDate:{$lt:end}, toDate:{$gte:start}
  }).select("numberOfDays durationType").lean();
  return {
    presentDays: (counts.Present||0)+(counts.WFH||0),
    leaveDays: Math.max(counts.Leave||0, approvedLeaves.reduce((s,l)=>s+num(l.numberOfDays, l.durationType==="Half Day"?0.5:0),0)),
    absentDays: counts.Absent||0,
    unpaidLeaveDays: 0
  };
}
function calculate(components, snapshot) {
  const c = {...components};
  const earnings = ["basic","hra","allowances","bonus","overtime","otherEarnings"].reduce((s,k)=>s+Math.max(0,num(c[k])),0);
  const basic = Math.max(0,num(c.basic));
  const pfBase = Math.min(basic, Math.max(0,num(c.pfWageCeiling,15000)));
  const pfEmployee = round(pfBase * Math.max(0,num(c.pfEmployeeRate,12))/100);
  const pfEmployer = round(pfBase * Math.max(0,num(c.pfEmployerRate,12))/100);
  const esiBase = earnings;
  const esiEligible = esiBase <= Math.max(0,num(c.esiWageCeiling,21000));
  const esiEmployee = esiEligible ? round(esiBase * Math.max(0,num(c.esiEmployeeRate,0.75))/100) : 0;
  const esiEmployer = esiEligible ? round(esiBase * Math.max(0,num(c.esiEmployerRate,3.25))/100) : 0;
  const unpaidLeaveDeduction = round((Math.max(0,num(c.basic))+Math.max(0,num(c.hra))+Math.max(0,num(c.allowances))) / Math.max(1,num(c.workingDays,30)) * Math.max(0,num(c.unpaidLeaveDays, snapshot.unpaidLeaveDays)));
  const professionalTax = Math.max(0,num(c.professionalTax));
  const tds = Math.max(0,num(c.tds));
  const otherDeductions = Math.max(0,num(c.otherDeductions));
  const totalDeductions = round(pfEmployee+esiEmployee+professionalTax+tds+otherDeductions+unpaidLeaveDeduction);
  return { totals:{gross:round(earnings),pfEmployee,esiEmployee,professionalTax,tds,otherDeductions,unpaidLeaveDeduction,totalDeductions,netPay:round(earnings-totalDeductions),pfEmployer,esiEmployer},
    notes:[
      "PF/ESI figures use the rates and wage ceilings stored on this payroll record; validate eligibility and current statutory rules before payment.",
      "TDS is entered as a payroll input; this endpoint does not calculate annual income tax or file statutory returns.",
      "Professional Tax is configured as a payroll input because rules vary by state.",
      "Attendance and approved leave are a snapshot from the existing ERP records. Unpaid leave deduction is applied only when unpaidLeaveDays is explicitly configured."
    ]};
}

export const getAttendanceLeaveIntegration = asyncHandler(async (req,res) => {
  const employeeId = req.query.employeeId || req.user._id;
  if (!mongoose.isValidObjectId(employeeId)) throw new ApiError(400,"Invalid employeeId");
  const admin = await adminOnly(req);
  if (!admin && String(employeeId)!==String(req.user._id)) throw new ApiError(403,"You can only view your own attendance and leave summary");
  const period = String(req.query.period || new Date().toISOString().slice(0,7));
  const snapshot = await attendanceSnapshot(employeeId,period);
  res.status(200).json(new ApiResponse(200,{employeeId,period,...snapshot},"Attendance and approved leave summary fetched from existing ERP records"));
});

export const createPayroll = asyncHandler(async(req,res)=>{
  requireAdmin(await adminOnly(req));
  const {employeeId,period,components={}}=req.body;
  if(!mongoose.isValidObjectId(employeeId)) throw new ApiError(400,"Valid employeeId is required");
  const employee=await User.findById(employeeId).select("_id name email userId isActive").lean();
  if(!employee || employee.isActive===false) throw new ApiError(404,"Active employee/user not found");
  monthRange(period);
  const allowed=["basic","hra","allowances","bonus","overtime","otherEarnings","pfEmployeeRate","pfEmployerRate","pfWageCeiling","esiEmployeeRate","esiEmployerRate","esiWageCeiling","professionalTax","tds","otherDeductions","unpaidLeaveDays","workingDays"];
  const clean={}; for(const k of allowed) if(components[k]!==undefined) clean[k]=num(components[k]);
  const snapshot=await attendanceSnapshot(employeeId,period);
  const result=calculate(clean,snapshot);
  const record=await Payroll.findOneAndUpdate({employeeId,period},{employeeId,period,components:clean,attendanceSnapshot:snapshot,totals:result.totals,calculationNotes:result.notes,status:"Calculated",updatedBy:req.user._id,createdBy:req.user._id},{new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true});
  res.status(201).json(new ApiResponse(201,{payroll:record,employee:{name:employee.name,email:employee.email,userId:employee.userId}},"Payroll calculated using existing attendance and approved leave records"));
});

export const listPayroll = asyncHandler(async(req,res)=>{
  requireAdmin(await adminOnly(req));
  const filter={isArchived:false};
  if(req.query.period) filter.period=String(req.query.period);
  if(req.query.employeeId && mongoose.isValidObjectId(req.query.employeeId)) filter.employeeId=req.query.employeeId;
  if(req.query.status) filter.status=String(req.query.status);
  const rows=await Payroll.find(filter).sort({period:-1,updatedAt:-1}).populate("employeeId","name email userId").limit(Math.min(200,Math.max(1,num(req.query.limit,100)))).lean();
  res.status(200).json(new ApiResponse(200,rows,"Payroll records fetched"));
});

export const updatePayrollStatus = asyncHandler(async(req,res)=>{
  requireAdmin(await adminOnly(req));
  const {status}=req.body;
  if(!["Draft","Calculated","Approved","Paid","Cancelled"].includes(status)) throw new ApiError(400,"Invalid payroll status");
  const record=await Payroll.findOne({_id:req.params.id,isArchived:false});
  if(!record) throw new ApiError(404,"Payroll record not found");
  if(status==="Approved" && !record.totals) throw new ApiError(400,"Calculate payroll before approval");
  if(status==="Paid" && record.status!=="Approved") throw new ApiError(400,"Only approved payroll can be marked Paid");
  record.status=status; record.updatedBy=req.user._id;
  if(status==="Approved"){record.approvedBy=req.user._id;record.approvedAt=new Date();}
  if(status==="Paid") record.paidAt=new Date();
  await record.save();
  res.status(200).json(new ApiResponse(200,record,"Payroll status updated"));
});

export const downloadPayslip = asyncHandler(async(req,res)=>{
  const record=await Payroll.findOne({_id:req.params.id,isArchived:false}).populate("employeeId","name email userId").lean();
  if(!record) throw new ApiError(404,"Payslip not found");
  const admin=await adminOnly(req);
  if(!admin && String(record.employeeId?._id)!==String(req.user._id)) throw new ApiError(403,"You can only access your own payslip");
  if(!admin && !["Approved","Paid"].includes(record.status)) throw new ApiError(403,"Payslip is not yet released");
  res.setHeader("Content-Type","application/pdf");
  res.setHeader("Content-Disposition",`attachment; filename="payslip-${record.period}-${record.employeeId?.userId||record.employeeId?._id}.pdf"`);
  const doc=new PDFDocument({margin:48,size:"A4"});
  doc.pipe(res);
  doc.fontSize(20).text("Vikalpa ERP — Payslip",{align:"center"});
  doc.moveDown().fontSize(11).text(`Pay period: ${record.period}`);
  doc.text(`Employee: ${record.employeeId?.name||"Employee"}`);
  doc.text(`Employee ID: ${record.employeeId?.userId||record.employeeId?._id}`);
  doc.text(`Email: ${record.employeeId?.email||""}`);
  doc.text(`Status: ${record.status}`);
  doc.moveDown().fontSize(14).text("Earnings");
  const c=record.components||{}, t=record.totals||{};
  for(const [label,key] of [["Basic","basic"],["HRA","hra"],["Allowances","allowances"],["Bonus","bonus"],["Overtime","overtime"],["Other earnings","otherEarnings"]]) doc.fontSize(10).text(`${label}: INR ${round(num(c[key])).toFixed(2)}`);
  doc.moveDown().fontSize(14).text("Deductions");
  for(const [label,key] of [["Employee PF","pfEmployee"],["Employee ESI","esiEmployee"],["Professional Tax","professionalTax"],["TDS","tds"],["Other deductions","otherDeductions"],["Unpaid leave","unpaidLeaveDeduction"]]) doc.fontSize(10).text(`${label}: INR ${round(num(t[key])).toFixed(2)}`);
  doc.moveDown().fontSize(12).text(`Gross earnings: INR ${round(num(t.gross)).toFixed(2)}`);
  doc.text(`Total deductions: INR ${round(num(t.totalDeductions)).toFixed(2)}`);
  doc.fontSize(16).text(`Net pay: INR ${round(num(t.netPay)).toFixed(2)}`);
  doc.moveDown().fontSize(8).text("Generated by Vikalpa ERP. Verify statutory calculations and payroll inputs before use as an official tax or compliance document.");
  doc.end();
});

export const getHRAnalytics = asyncHandler(async(req,res)=>{
  requireAdmin(await adminOnly(req));
  const [moduleCounts,payrollStats,recruitmentStages,performanceStats,onboardingStats]=await Promise.all([
    HRRecord.aggregate([{$match:{isArchived:false}},{$group:{_id:"$module",total:{$sum:1},pending:{$sum:{$cond:[{$in:["$status",["Open","Pending","Submitted","In Progress"]]},1,0]}}}}]),
    Payroll.aggregate([{$match:{isArchived:false}},{$group:{_id:"$period",payrolls:{$sum:1},gross:{$sum:"$totals.gross"},netPay:{$sum:"$totals.netPay"},employerContributions:{$sum:{$add:["$totals.pfEmployer","$totals.esiEmployer"]}}}},{$sort:{_id:-1}},{$limit:12}]),
    HRRecord.aggregate([{$match:{module:"recruitment",isArchived:false}},{$group:{_id:"$status",count:{$sum:1}}}]),
    HRRecord.aggregate([{$match:{module:"performance",isArchived:false}},{$group:{_id:"$status",count:{$sum:1}}}]),
    HRRecord.aggregate([{$match:{module:"onboarding",isArchived:false}},{$group:{_id:"$status",count:{$sum:1}}}])
  ]);
  res.status(200).json(new ApiResponse(200,{moduleCounts,payrollStats,recruitmentStages,performanceStats,onboardingStats,generatedAt:new Date()},"HR analytics fetched"));
});
