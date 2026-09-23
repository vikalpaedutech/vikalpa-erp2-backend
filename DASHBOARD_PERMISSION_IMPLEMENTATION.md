# Authorization + Dashboard Analytics Update

## Authorization
- Direct UserPermission APIs added.
- Effective permissions now combine role permissions + direct user permissions.
- Admin bypass is supported server-side.
- Permission/role/role-permission/user-role administration endpoints are admin-only.
- Dashboard API uses `dashboard.view` and `dashboard.export`.
- Frontend navigation and protected routes use permission codes instead of role comparisons for configured navigation items.
- Admin can manage direct user permissions from `/admin/user-permissions`.

## Dashboard Analytics
`GET /api/v1/dashboard-management/analytics`

Supports program, batch, district, block, center and date filters. Non-admin data is constrained by the logged-in user's Program/Batch access and UserRegionAccess scope.

Includes:
- Active students
- Present/absent and attendance rate
- Attendance trend
- Exam count
- Marks uploaded and completion by exam
- Absentee calling totals and type breakdown
- Center-wise attendance PDF uploads
- Top and low student performers from marks
- Center summary

Export:
`GET /api/v1/dashboard-management/export?format=xlsx|csv`

## Marks
The uploaded frontend/backend already contained the requested behavior: blanking an existing marks cell and saving calls the update endpoint with an empty value, which deletes the StudentMark document; only the affected row is updated locally and the page is not reloaded.

## Gamification ranks
The current model already uses one `GamificationUserRank` document per user per year/month via a unique `{ userId, year, month }` index. Daily/monthly values are refreshed in that same monthly document during ranking calculation. User-facing labels were cleaned to use `Today Rank`, `Today Points`, and `Total Points`; activity classification badges were removed from the user dashboard activity cards.
