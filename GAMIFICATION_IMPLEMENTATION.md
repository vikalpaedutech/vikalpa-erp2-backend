# Gamification Implementation

## Backend

### Models
- `GamificationRoleAccess`
- `GamificationParticipant`
- `GamificationCriteria`
- `GamificationUserPoints`
- `GamificationUserRanks`

### Monthly Rank Storage

`GamificationUserRanks` now stores **one document per participant per month**.

The monthly document contains:
- `userId`
- `month`
- `year`
- `startDate`
- `endDate`
- `rank`
- `monthRank`
- `todayRank`
- `eventBreakdown[]`
  - `eventType`
  - `totalPoint`
  - `todaysPoint`
  - `pointClassification`
- `totalPoints`
- `todayPoints`
- `positivePoints`
- `negativePoints`
- `eventCount`
- `todayEventCount`
- `pointClassification`
- `calculationRunId`
- `rankingDate`

The unique key is `userId + year + month`.

### Calculation APIs

Mounted at:

`/api/v1/gamification-management`

- GET `/roles`
- PATCH `/roles/:roleId`
- GET/POST/PATCH/DELETE `/participants`
- GET/PUT `/criteria`
- POST `/initiate` body `{ month: "YYYY-MM" }`
  - Rebuilds the point ledger for the selected month.
  - Recalculates and upserts the monthly rank summary.
- POST `/update-ranking` body `{ month: "YYYY-MM" }`
  - Does **not** recalculate source events.
  - Rebuilds only the monthly rank summary from the existing point ledger.
- GET `/me/dashboard`
- GET `/leaderboard`
- GET `/report/download?month=YYYY-MM&format=xlsx|csv`

### Marks behavior

- Student marks are unique per `examId + studentId`.
- If an existing mark cell is cleared and saved with a blank value, the backend deletes that `StudentMark` document.
- Marks gamification groups the participant's current marks by exam.
- If 10 students are marked first and the same exam is later completed for 30 students, the recalculation uses the current total of 30 marks and the applicable criteria range.
- The latest marks update time is used as the marks event time and the exam's `marksUploadWithinDays` is used for deadline validation.
- Removing a marks document removes it from the next full gamification recalculation.

### Other scoring rules

- Self attendance uses configured time ranges and cutoff.
- Student attendance uses the participant's Present count for the day and the latest attendance marking time for the cutoff.
- Center-wise attendance PDF uses upload time.
- Absentee calling uses CallLog entries by the participant and the latest call time.
- Disciplinary uses the first two center-monitoring records by `createdAt` for each assigned program/batch/center/day.

Disciplinary grade multiplier:
- Poor = `-0.5`
- Average = `0`
- Good = `0.25`
- Excellent = `0.5`
- Camera Off = `0`

### Timezone

Time-based rules use `GAMIFICATION_TIMEZONE` and default to:

`Asia/Kolkata`

## Frontend

### Admin pages

- `/admin/gamification`
- `/admin/gamification/roles`
- `/admin/gamification/participants`
- `/admin/gamification/criteria`

The dashboard provides:
- month selection
- `Initiate / Recalculate Ranking`
- `Update Monthly Ranking`
- Excel/CSV export
- current-day ranking
- monthly ranking

`Update Monthly Ranking` is optimized for cases where the point ledger is already correct and only the rank summary needs to be refreshed.

### User dashboard

The gamification card shows:
- Month Rank
- Today Rank
- Month Points
- Today's Points
- event-wise monthly total
- event-wise today's points
- event classification

The raw point ledger is not shown on the main dashboard card.

### Marks UI

The marks screen:
- does not reload/refetch the complete student list after saving one student's marks
- updates only the affected row
- treats a blank existing marks cell as a delete operation
