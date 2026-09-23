# Dashboard & Authorization Refactor

## Fixed
- Role-based effective permissions now normalize permission codes case-insensitively.
- Dashboard-specific permissions support backward-compatible `dashboard.view` / `dashboard.export` fallback.
- Frontend sidebar permission matching is case-insensitive and honors dashboard fallback.
- Role permission management now supports atomic replace/save instead of many individual requests.
- User permission management now shows effective role + direct permission access.

## Dashboards
- Students Dashboard: counts, student records, custom Excel field selection.
- Student Attendance Dashboard: overall, daily trend, district, block, center.
- Absentee Calling Dashboard: calling records, status, district and detailed rows.
- Center Attendance Upload Dashboard: upload counts, center coverage and upload history.
- All dashboard endpoints enforce program/batch/region access server-side.
- Export endpoints return Excel.

## Region access security
Dashboard query parameters can only narrow the user's server-side access. A district/block/center query cannot widen access.

## Performance
Added compound indexes for active enrollment region queries and student attendance date queries.

## Validation
Backend changed files pass `node --check`. Frontend dependency build was not completed in this Linux environment because the supplied dependency set contains a Windows-only Rolldown package.
