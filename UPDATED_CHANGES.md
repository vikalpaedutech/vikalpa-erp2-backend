# ERP Backend Update

This build includes the requested leave/attendance and user-management updates.

## Attendance
- Manual attendance now stores server `checkIn` time automatically.
- Added employee self-attendance endpoint: `/user-management/user-attendance/me`.
- Added checkout endpoint: `PATCH /user-management/user-attendance/:id/checkout`.
- Legacy manual records expose `createdAt` as check-in when `checkIn` is missing.
- Existing access-based attendance API/logic preserved.
- Existing attendance dashboard logic preserved.

## Leave
- Leave applications accept multiple PDF/image attachments (up to 10 files, 10 MB each).
- Leave detail API returns attachment viewing URLs and approval history.
- Added approver leave-detail endpoint.
- Leave application detail includes balance-at-application transaction information.
- Existing leave balance, approval, rejection, cancellation and withdrawal workflows preserved.

## User Management
- Added bulk user onboarding through CSV/XLS/XLSX.
- Bulk onboarding can assign:
  - role
  - department + designation
  - region access
  - optional program/batch access
  - active/inactive status
- Added downloadable two-row onboarding template.
- Inactive users cannot log in.
- Existing active-status toggle remains available.

No existing Access Based Attendance hierarchy or dashboard implementation was intentionally replaced.
