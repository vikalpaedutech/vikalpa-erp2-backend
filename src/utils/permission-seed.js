import { Permission } from "../models/permissions-management/permissions.models.js";

const definitions = [
  ["Employee Profile View","hr.employee.view","hr_management","employee_view"],
  ["Bulk Attendance","attendance.bulk.manage","hr_management","bulk_attendance"],
  ["Attendance Export","attendance.export","hr_management","attendance_export"],
  ["Leave Policy Manage","leave.policy.manage","hr_management","leave_policies"],
  ["Leave Accrual Report View","leave.accrual-report.view","hr_management","leave_accrual_report"],
  ["All User Attendance","attendance.manage","hr_management","attendance_manage"],
  ["User Attendance","attendance.access.manage","attendance","access_manage"],
  ["Leave Type Manage","leave.type.manage","hr_management","leave_types"],
  ["Leave Rule Manage","leave.rule.manage","hr_management","leave_approval_rules"],
  ["Leave Balance Manage","leave.balance.manage","hr_management","leave_balance"],

  ["Class Interaction View","class-interaction.view","class_interaction","view"],
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
  ["Student Dress","student-dress.view","student_dress","view"],["Export Student dress report","student-dress.export","student_dress","export"],["Student Distance Details","student-distance.view","student_distance","view"],["Student Distance Report Export","student-distance.export","student_distance","export"],["Student TA","student-ta.view","student_ta","view"],["Export TA Report","student-ta.export","student_ta","export"],["Export Detailed TA Report with date ranges","student-ta.detailed-export","student_ta","detailed_export"],
  ["Student Attendance View","student-attendance.view","student_attendance","view"],["Mark All Students Present","student-attendance.mark-all-present","student_attendance","mark_all_present"],["Upload Class Pdf","center-attendance.view","center_attendance","view"],["Copy Checking View","copy-checking.view","copy_checking","view"],["Class Interaction View","class-interaction.view","class_interaction","view"],["Monitoring View","monitoring.view","monitoring","view"],["Monitoring Report View","monitoring.report.view","monitoring_report","view"],["Monitoring Manage","monitoring.manage","monitoring","manage"],
  ["Finance Bill View","finance.bill.view","finance_bill","view"],["Finance Bill Verify","finance.bill.verify","finance_bill","verify"],["Finance Bill Approve","finance.bill.approve","finance_bill","approve"],["Finance Dashboard View","finance.dashboard.view","finance_dashboard","view"],
  ["Bill Payment Status Access","finance.bill-payment-status.view","finance_bill_payment_status","view"],["Finance Auditor Manage","finance.auditor.manage","finance_auditor","manage"],
  ["Program View","program.view","program","view"],["Create & Manage Batch","batch.view","batch","view"],["District View","region.district.view","region_district","view"],["Block View","region.block.view","region_block","view"],["Center View","region.center.view","region_center","view"],
  ["Permission Manage","permission.manage","permission","manage"],["Role Manage","role.manage","role","manage"],["Role Permission Manage","role-permission.manage","role_permission","manage"],["User Manage","user.manage","user","manage"],["User Role Manage","user-role.manage","user_role","manage"],["User Permission Manage","user-permission.manage","user_permission","manage"],["User Designation Manage","user-designation.manage","user_designation","manage"],["User Access Manage","user-access.manage","user_access","manage"],["User Region Access Manage","user-region-access.manage","user_region_access","manage"],
  ["Department Manage","department.manage","department","manage"],["Designation Manage","designation.manage","designation","manage"],["Exam Manage","exam.manage","exam","manage"],["Exam View","exam.view","exam","view"],
  ["Create & Manage Calling Type","calling-type.manage","calling_type","manage"],["Calling Detail Manage","calling-detail.manage","calling_detail","manage"],["Calls","calling.view","calling","view"],["Calling History View","calling.history.view","calling_history","view"],["Absentee Calling","calling.absentee.view","calling_absentee","view"],
  ["Gamification View","gamification.view","gamification","view"],["Gamification Manage","gamification.manage","gamification","manage"],["Gamification Role Manage","gamification.role.manage","gamification_role","manage"],["Gamification Participant Manage","gamification.participant.manage","gamification_participant","manage"],["Gamification Criteria Manage","gamification.criteria.manage","gamification_criteria","manage"],
  ["Gamification Dashboard View","gamification.dashboard.view","gamification_dashboard","view"],
  ["Gamification Dashboard Export","gamification.dashboard.export","gamification_dashboard","export"],
  ["Gamification All Dashboard View","gamification.all-dashboard.view","gamification_all_dashboard","view"],
  ["Gamification All Dashboard Export","gamification.all-dashboard.export","gamification_all_dashboard","export"],
  ["Mark Attendance","attendance.view","attendance","view"],["My Attendance & Report","attendance.report.view","attendance_report","view"],["Leave Dashboard View","leave.dashboard.view","leave_dashboard","view"],["Leave Apply","leave.apply","leave","apply"],["Leave My View","leave.my.view","leave_my","view"],["Leave Approval View","leave.approval.view","leave_approval","view"],
];

const descriptions = {
  "hr.employee.view": "View employee directory and complete employee profiles.",
  "attendance.bulk.manage": "Upload and manage employee attendance in bulk.",
  "attendance.export": "Export employee attendance reports.",
  "leave.policy.manage": "Manage leave policies and accrual rules.",
  "leave.accrual-report.view": "View leave accrual reports.",
  "attendance.manage": "Admin level access. This permission allows user to manage all users attendance, like marking present, absent etc.",
  "class-interaction.view": "Allows the assigned role or user to access the Class Interaction report and view class interaction records.",
  "attendance.view": "User can mark their self attendance by clicking photos.",
  "attendance.access.manage": "Allowed user can access attendance of his regions’ users. Mostly given to ACI, Project Coordinator, and users who need to see users from their regions.",
  "attendance.report.view": "View your own attendance and attendance reports.",
  "finance.bill-payment-status.view": "Access the complete Bill Payment Status page, including payment workflow actions and exports.",
  "batch.view": "Batches can be created and edited.",
  "calling.view": "User can see calls assigned to them.",
  "calling.absentee.view": "User can see absentee students calling of their assigned batch and centers.",
  "calling-detail.manage": "User can view calling details created by admin or any authorised user.",
  "calling-type.manage": "User can create or edit calling types.",
  "center-attendance.view": "User can upload manual attendance PDF of their class students.",
  "gamification.dashboard.view": "Allowed user can view gamification rankings and performance only for users within their assigned region access.",
  "gamification.dashboard.export": "Allowed user can export gamification performance reports for users within their assigned region access.",
  "gamification.all-dashboard.view": "Allowed user can view gamification rankings and performance for all users without region restrictions.",
  "gamification.all-dashboard.export": "Allowed user can export gamification performance reports for all users without region restrictions.",
};

export async function seedPermissions() {
  for (const [permissionName, permissionCode, module, action] of definitions) {
    await Permission.updateOne(
      { permissionCode },
      {
        $set: {
          permissionName,
          module,
          action,
          description: descriptions[permissionCode] || `System permission: ${permissionCode}`,
          isActive: true,
        },
        $setOnInsert: { permissionCode },
      },
      { upsert: true }
    );
  }
}
