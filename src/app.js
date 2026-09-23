import express from "express";
import cors from "cors";
const app = express();
import cookieParser from "cookie-parser";


//Basic configuration
//To recieve json data

app.use(express.json({
    limit: "16kb"
}));


//To recieve url encoded data

app.use(express.urlencoded({
    extended: true,
    limit: "16kb"
}));


//Serving static asset to the public through public folder.

app.use(express.static("public"));

app.use(cookieParser());


//cors configuration

app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://64.227.143.155:5173"
    ],
    credentials: true,
    methods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
    ],
    allowedHeaders: [
        "Authorization",
        "Content-Type"
    ]
}));


//import the routes

import healthCheckRouter from "./routes/healthcheck.routes.js";
import authRouter from "./routes/auth.routes.js";

import programRouter from "./routes/program-management/program.routes.js";
import batchRouter from "./routes/program-management/batch.routes.js";
import departmentRouter from "./routes/program-management/department.routes.js";
import designationRouter from "./routes/program-management/designation.routes.js";

import districtRouter from "./routes/region-management/district.routes.js";
import blockRouter from "./routes/region-management/block.routes.js";
import centerRouter from "./routes/region-management/center.routes.js";

import permissionsRouter from "./routes/permissions-management/permissions.routes.js";
import roleRouter from "./routes/permissions-management/role.routes.js";
import rolePermissionRouter from "./routes/permissions-management/rolePermission.routes.js";

import userRoleRouter from "./routes/user-management/usreRole.routes.js";
import userDesignationRouter from "./routes/user-management/userDesignation.routes.js";
import userRegionAccessRouter from "./routes/user-management/userRegionAccess.routes.js";
import userAccessRouter from "./routes/user-management/userAccess.routes.js";
import userRouter from "./routes/user-management/user.routes.js";

import studentRouter from "./routes/student-management/student.routes.js";
import studentAttendanceRouter from "./routes/student-management/studentAttendance.routes.js";
import studentApprovalRouter from "./routes/student-management/studentApproval.routes.js";
import studentMarkRouter from "./routes/student-management/studentMark.routes.js";
import studentCopyCheckingRouter from "./routes/student-management/studentCopyChecking.routes.js";
import centerWiseAttendanceRouter from "./routes/student-management/centerWiseAttendance.routes.js";

import examRouter from "./routes/academic-management/exam.routes.js";

import billRouter from "./routes/finance-management/bill.routes.js";
import billAuditorRouter from "./routes/finance-management/billAuditor.routes.js";


// ============================================================
// CALLING MANAGEMENT ROUTES
// ============================================================

import callingTypeRouter from "./routes/calling-management/callingType.routes.js";
import callingDetailsRouter from "./routes/calling-management/callingDetails.routes.js";
import callLogRouter from "./routes/calling-management/callLog.routes.js";


import classInteractionRouter from "./routes/academic-management/classInteraction.routes.js";


// ============================================================
// CENTER MONITORING ROUTES
// ============================================================

import monitoringRegionAccessRouter from "./routes/academic-management/monitoringRegionAccess.routes.js";
import centerMonitoringRouter from "./routes/academic-management/centerMonitoring.routes.js";

import leaveTypeRouter from "./routes/user-management/leaveType.routes.js";



import userLeaveRouter from "./routes/user-management/userLeave.routes.js";
import userLeaveBalanceRouter from "./routes/user-management/userLeaveBalance.routes.js";
import userLeaveApprovalRouter from "./routes/user-management/userLeaveApproval.routes.js";

import leaveApprovalRuleRouter from "./routes/user-management/leaveApprovalRule.routes.js";
import userAttendanceRouter from "./routes/user-management/userAttendance.routes.js";
import gamificationRouter from "./routes/gamification-management/gamification.routes.js";
import userPermissionRouter from "./routes/user-management/userPermission.routes.js";
import dashboardRouter from "./routes/dashboard-management/dashboard.routes.js";

// ============================================================
// ROUTES
// ============================================================

app.use(
    "/api/v1/healthCheck",
    healthCheckRouter
);

app.use(
    "/api/v1/auth",
    authRouter
);

app.use(
    "/api/v1/programs",
    programRouter
);

app.use(
    "/api/v1/batch",
    batchRouter
);

app.use(
    "/api/v1/department",
    departmentRouter
);

app.use(
    "/api/v1/designation",
    designationRouter
);

app.use(
    "/api/v1/region-management/districts",
    districtRouter
);

app.use(
    "/api/v1/region-management/blocks",
    blockRouter
);

app.use(
    "/api/v1/region-management/centers",
    centerRouter
);

app.use(
    "/api/v1/permissions-management/permissions",
    permissionsRouter
);

app.use(
    "/api/v1/permissions-management/roles",
    roleRouter
);

app.use(
    "/api/v1/permissions-management/role-permissions",
    rolePermissionRouter
);

app.use(
    "/api/v1/user-management/user-roles",
    userRoleRouter
);

app.use(
    "/api/v1/user-management/user-designations",
    userDesignationRouter
);

app.use(
    "/api/v1/user-management/user-region-access",
    userRegionAccessRouter
);

app.use(
    "/api/v1/user-management/user-access",
    userAccessRouter
);

app.use(
    "/api/v1/user-management/user-permissions",
    userPermissionRouter
);

app.use(
    "/api/v1/user-management/users",
    userRouter
);

app.use(
    "/api/v1/student-management/students",
    studentRouter
);

app.use(
    "/api/v1/student-management/attendance",
    studentAttendanceRouter
);

app.use(
    "/api/v1/student-management/student-logs",
    studentApprovalRouter
);

app.use(
    "/api/v1/student-management/marks",
    studentMarkRouter
);

app.use(
    "/api/v1/student-management/copy-checking",
    studentCopyCheckingRouter
);

app.use(
    "/api/v1/student-management/center-wise-attendance",
    centerWiseAttendanceRouter
);

app.use(
    "/api/v1/academic-management/exams",
    examRouter
);

app.use(
    "/api/v1/finance-management/bills",
    billRouter
);

app.use(
    "/api/v1/finance-management/bill-auditors",
    billAuditorRouter
);


// ============================================================
// CALLING MANAGEMENT
// ============================================================

app.use(
    "/api/v1/calling-management/calling-types",
    callingTypeRouter
);

app.use(
    "/api/v1/calling-management/calling-details",
    callingDetailsRouter
);

app.use(
    "/api/v1/calling-management/call-logs",
    callLogRouter
);


// ============================================================
// CLASS INTERACTION
// ============================================================

app.use(
    "/api/v1/academic-management/class-interactions",
    classInteractionRouter
);


// ============================================================
// CENTER MONITORING
// ============================================================

app.use(
    "/api/v1/academic-management/monitoring-region-access",
    monitoringRegionAccessRouter
);

app.use(
    "/api/v1/academic-management/center-monitoring",
    centerMonitoringRouter
);


app.use(
  "/api/v1/user-management/leave-types",
  leaveTypeRouter
);




app.use(
  "/api/v1/user-management/user-leaves",
  userLeaveRouter
);

app.use(
  "/api/v1/user-management/leave-balances",
  userLeaveBalanceRouter
);




app.use(
  "/api/v1/user-management/leave-approvals",
  userLeaveApprovalRouter
);



// app.use(
//   "/api/v1/user-management/leave-types",
//   leaveTypeRouter
// );



app.use(
  "/api/v1/user-management/leave-approval-rules",
  leaveApprovalRuleRouter
);

app.use(
  "/api/v1/user-management/user-attendance",
  userAttendanceRouter
);

app.use(
  "/api/v1/gamification-management",
  gamificationRouter
);

app.use(
  "/api/v1/dashboard-management",
  dashboardRouter
);

export default app;