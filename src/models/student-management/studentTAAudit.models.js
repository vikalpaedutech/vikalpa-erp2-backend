import mongoose, { Schema } from "mongoose";
const studentTAAuditSchema = new Schema({ studentId: {type: Schema.Types.ObjectId, ref:"Student", required:true}, enrollmentId:{type:Schema.Types.ObjectId,ref:"StudentEnrollment"}, attendanceId:{type:Schema.Types.ObjectId,ref:"StudentAttendance"}, date:{type:Date,required:true}, oldStatus:{type:String,enum:["Present","Absent"]}, newStatus:{type:String,enum:["Present","Absent"],required:true}, changedBy:{type:Schema.Types.ObjectId,ref:"User",required:true}, reason:{type:String,default:"TA attendance correction"} },{timestamps:true});
studentTAAuditSchema.index({studentId:1,date:-1});
export const StudentTAAudit = mongoose.model("StudentTAAudit",studentTAAuditSchema);
