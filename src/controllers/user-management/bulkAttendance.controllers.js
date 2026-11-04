import mongoose from "mongoose";
import XLSX from "xlsx";
import { User } from "../../models/user.models.js";
import { UserAttendance } from "../../models/user-management/userAttendance.models.js";

const TYPES = ["Daily Attendance","Orientation","Feild Visit","Event","Center Visit","Half Day"];
const STATUSES = ["Present","WFH","Absent"];
const dateOnly = value => { const d=new Date(value); if(Number.isNaN(d.getTime())) return null; d.setUTCHours(0,0,0,0); return d; };
const parseTime = (value, day) => {
 if(value===undefined||value===null||value==="") return null;
 if(value instanceof Date){const d=new Date(day);d.setUTCHours(value.getUTCHours(),value.getUTCMinutes(),0,0);return d;}
 const text=String(value).trim();
 const m=text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/); if(!m)return null;
 const d=new Date(day);d.setUTCHours(Number(m[1]),Number(m[2]),Number(m[3]||0),0);return d;
};
export const downloadBulkAttendanceTemplate = async (req,res) => {
 const wb=XLSX.utils.book_new();
 const rows=[["User Object ID","Date (YYYY-MM-DD)","Attendance Type","Status","Check In (HH:mm)","Check Out (HH:mm)","Visited Location","Manual Attendance Reason","Remarks"],
 ["PASTE_USER_OBJECT_ID","2026-11-03","Daily Attendance","Present","09:30","17:30","","Bulk attendance marked by HR",""]];
 const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=[{wch:28},{wch:20},{wch:22},{wch:14},{wch:18},{wch:18},{wch:28},{wch:36},{wch:36}];
 XLSX.utils.book_append_sheet(wb,ws,"Bulk Attendance");
 const guide=XLSX.utils.aoa_to_sheet([["Field","Instruction"],["User Object ID","Required: exact MongoDB User _id from Users collection"],["Date","Required: YYYY-MM-DD"],["Attendance Type",TYPES.join(" | ")],["Status",STATUSES.join(" | ")],["Check In / Check Out","Optional; HH:mm, 24-hour format"],["Visited Location","Optional; required for Orientation, Feild Visit, Event and Center Visit"],["Manual Attendance Reason","Required for bulk marking"],["Remarks","Optional"],["Existing record","Same user + date + attendance type is updated, not duplicated"],["Leave","Approved leave records cannot be overwritten by bulk attendance"]]);
 XLSX.utils.book_append_sheet(wb,guide,"Instructions");
 const buffer=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
 res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 res.setHeader("Content-Disposition",'attachment; filename="bulk-attendance-template.xlsx"');res.send(buffer);
};
export const uploadBulkAttendance = async (req,res) => {
 try{
  if(!req.file?.buffer)return res.status(400).json({success:false,message:"Upload an Excel template file."});
  const wb=XLSX.read(req.file.buffer,{type:"buffer",cellDates:true});
  const sheet=wb.Sheets[wb.SheetNames[0]], rows=XLSX.utils.sheet_to_json(sheet,{defval:""});
  const actor=req.user?._id;if(!actor)return res.status(401).json({success:false,message:"Unauthorized."});
  const results={created:0,updated:0,failed:[],total:rows.length};
  for(let i=0;i<rows.length;i++){
   const r=rows[i],line=i+2,userId=String(r["User Object ID"]||"").trim(),type=String(r["Attendance Type"]||"").trim(),status=String(r["Status"]||"").trim();
   const date=dateOnly(r["Date (YYYY-MM-DD)"] || req.body.date);
   const finalType=type || String(req.body.attendanceType||"").trim();
   const finalStatus=status || String(req.body.status||"").trim();
   if(!mongoose.Types.ObjectId.isValid(userId)){results.failed.push({row:line,userId,message:"Invalid User Object ID"});continue;}
   if(!date||!TYPES.includes(finalType)||!STATUSES.includes(finalStatus)){results.failed.push({row:line,userId,message:"Invalid date, attendance type or status"});continue;}
   const user=await User.findOne({_id:userId,isActive:true}).select("_id");
   if(!user){results.failed.push({row:line,userId,message:"Active user not found"});continue;}
   const reason=String(r["Manual Attendance Reason"]||"Bulk attendance marked by HR").trim();
   const remarks=String(r["Remarks"]||"").trim();
   const location=String(r["Visited Location"]||req.body.visitedLocation||"").trim();
   if(!reason){results.failed.push({row:line,userId,message:"Manual Attendance Reason is required"});continue;}
   if(["Orientation","Feild Visit","Event","Center Visit"].includes(finalType)&&!location){results.failed.push({row:line,userId,message:"Visited Location is required for this attendance type"});continue;}
   const existing=await UserAttendance.findOne({userId,date,attendanceType:finalType});
   if(existing?.attendanceSource==="Leave"){results.failed.push({row:line,userId,message:"Approved leave cannot be overwritten"});continue;}
   const checkIn=parseTime(r["Check In (HH:mm)"],date),checkOut=parseTime(r["Check Out (HH:mm)"],date);
   if(r["Check In (HH:mm)"]&&!checkIn||r["Check Out (HH:mm)"]&&!checkOut){results.failed.push({row:line,userId,message:"Time must use HH:mm 24-hour format"});continue;}
   const payload={userId,date,attendanceType:finalType,status:finalStatus,attendanceSource:"Bulk",checkIn,checkOut,visitedLocation:location||null,latitude:0,longitude:0,markedBy:actor,manualAttendanceReason:reason,remarks:remarks||null,leaveId:null};
   if(existing){Object.assign(existing,payload);await existing.save();results.updated++;}
   else{await UserAttendance.create(payload);results.created++;}
  }
  return res.status(200).json({success:true,message:"Bulk attendance processed.",data:results});
 }catch(error){console.error("Bulk attendance upload:",error);return res.status(500).json({success:false,message:error.message||"Bulk attendance failed."});}
};
