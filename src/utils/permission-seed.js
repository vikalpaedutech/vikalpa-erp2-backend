import { Permission } from "../models/permissions-management/permissions.models.js";

const definitions = [
  ["Attendance Management","attendance.manage","attendance","manage"],
  ["Attendance Access Manage","attendance.access.manage","attendance_access","manage"],
  ["Leave Type Manage","leave.type.manage","leave_type","manage"],
  ["Leave Rule Manage","leave.rule.manage","leave_rule","manage"],
  ["Leave Balance Manage","leave.balance.manage","leave_balance","manage"],

  ["Dashboard View","dashboard.view","dashboard","view"],
  ["Dashboard Export","dashboard.export","dashboard","export"],
  ["Students Dashboard View","dashboard.students.view","dashboard_students","view"],
  ["Students Dashboard Export","dashboard.students.export","dashboard_students","export"],
  ["Attendance Dashboard View","dashboard.attendance.view","dashboard_attendance","view"],
  ["Attendance Dashboard Export","dashboard.attendance.export","dashboard_attendance","export"],
  ["Student Attendance Dashboard View","dashboard.student-attendance.view","dashboard_student_attendance","view"],
  ["Student Attendance Dashboard Export","dashboard.student-attendance.export","dashboard_student_attendance","export"],
  ["Student Attendance Student Export","dashboard.student-attendance.student-export","dashboard_student_attendance","student_export"],
  ["Absentee Calling Overview Dashboard View","dashboard.absentee-calling-overview.view","dashboard_absentee_calling_overview","view"],
  ["Absentee Calling Overview Dashboard Export","dashboard.absentee-calling-overview.export","dashboard_absentee_calling_overview","export"],
  ["Absentee Calling Dashboard View","dashboard.absentee-calling.view","dashboard_absentee_calling","view"],
  ["Absentee Calling Dashboard Export","dashboard.absentee-calling.export","dashboard_absentee_calling","export"],
  ["Absentee Calling Student Export","dashboard.absentee-calling.student-export","dashboard_absentee_calling","student_export"],
  ["Center Attendance Upload Dashboard View","dashboard.center-attendance-upload.view","dashboard_center_attendance_upload","view"],
  ["Center Attendance Upload Dashboard Export","dashboard.center-attendance-upload.export","dashboard_center_attendance_upload","export"],
  ["Download Students Dashboard View","dashboard.download-students.view","dashboard_download_students","view"],
  ["Download Students Dashboard Export","dashboard.download-students.export","dashboard_download_students","export"],
  ["Exams & Marks Dashboard View","dashboard.exams-marks.view","dashboard_exams_marks","view"],
  ["Exams & Marks Dashboard Export","dashboard.exams-marks.export","dashboard_exams_marks","export"],
  ["Exams & Marks Student Export","dashboard.exams-marks.student-export","dashboard_exams_marks","student_export"],
  ["Copy Checking Dashboard View","dashboard.copy-checking.view","dashboard_copy_checking","view"],
  ["Copy Checking Dashboard Export","dashboard.copy-checking.export","dashboard_copy_checking","export"],
  ["Copy Checking Student Export","dashboard.copy-checking.student-export","dashboard_copy_checking","student_export"],

  ["Student View","student.view","student","view"],["Student Create","student.create","student","create"],["Student Bulk Create","student.bulk.create","student","bulk_create"],["Student Request View","student.request.view","student_request","view"],
  ["Student Attendance View","student-attendance.view","student_attendance","view"],["Center Attendance View","center-attendance.view","center_attendance","view"],["Copy Checking View","copy-checking.view","copy_checking","view"],["Class Interaction View","class-interaction.view","class_interaction","view"],["Monitoring View","monitoring.view","monitoring","view"],["Monitoring Report View","monitoring.report.view","monitoring_report","view"],["Monitoring Manage","monitoring.manage","monitoring","manage"],
  ["Finance Bill View","finance.bill.view","finance_bill","view"],["Finance Bill Verify","finance.bill.verify","finance_bill","verify"],["Finance Bill Approve","finance.bill.approve","finance_bill","approve"],["Finance Dashboard View","finance.dashboard.view","finance_dashboard","view"],["Finance Auditor Manage","finance.auditor.manage","finance_auditor","manage"],
  ["Program View","program.view","program","view"],["Batch View","batch.view","batch","view"],["District View","region.district.view","region_district","view"],["Block View","region.block.view","region_block","view"],["Center View","region.center.view","region_center","view"],
  ["Permission Manage","permission.manage","permission","manage"],["Role Manage","role.manage","role","manage"],["Role Permission Manage","role-permission.manage","role_permission","manage"],["User Manage","user.manage","user","manage"],["User Role Manage","user-role.manage","user_role","manage"],["User Permission Manage","user-permission.manage","user_permission","manage"],["User Designation Manage","user-designation.manage","user_designation","manage"],["User Access Manage","user-access.manage","user_access","manage"],["User Region Access Manage","user-region-access.manage","user_region_access","manage"],
  ["Department Manage","department.manage","department","manage"],["Designation Manage","designation.manage","designation","manage"],["Exam Manage","exam.manage","exam","manage"],["Exam View","exam.view","exam","view"],
  ["Calling Type Manage","calling-type.manage","calling_type","manage"],["Calling Detail Manage","calling-detail.manage","calling_detail","manage"],["Calling View","calling.view","calling","view"],["Calling History View","calling.history.view","calling_history","view"],["Absentee Calling View","calling.absentee.view","calling_absentee","view"],
  ["Gamification View","gamification.view","gamification","view"],["Gamification Manage","gamification.manage","gamification","manage"],["Gamification Role Manage","gamification.role.manage","gamification_role","manage"],["Gamification Participant Manage","gamification.participant.manage","gamification_participant","manage"],["Gamification Criteria Manage","gamification.criteria.manage","gamification_criteria","manage"],
  ["Attendance View","attendance.view","attendance","view"],["Attendance Report View","attendance.report.view","attendance_report","view"],["Leave Dashboard View","leave.dashboard.view","leave_dashboard","view"],["Leave Apply","leave.apply","leave","apply"],["Leave My View","leave.my.view","leave_my","view"],["Leave Approval View","leave.approval.view","leave_approval","view"],
];

export async function seedPermissions() {
  for (const [permissionName, permissionCode, module, action] of definitions) {
    await Permission.updateOne(
      { permissionCode },
      {
        $set: {
          permissionName,
          module,
          action,
          description: `System permission: ${permissionCode}`,
          isActive: true,
        },
        $setOnInsert: { permissionCode },
      },
      { upsert: true }
    );
  }
}
