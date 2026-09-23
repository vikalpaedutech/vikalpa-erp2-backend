import crypto from "crypto";
import { User } from "../../models/user.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { UserAttendance } from "../../models/user-management/userAttendance.models.js";
import { StudentAttendance } from "../../models/student-management/studentAttendance.models.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";
import { StudentMark } from "../../models/student-management/studentMark.models.js";
import { CenterWiseAttendance } from "../../models/student-management/centerWiseAttendance.models.js";
import { Exam } from "../../models/academic-management/exam.models.js";
import { CenterMonitoring } from "../../models/academic-management/centerMonitoring.models.js";
import { CallLog } from "../../models/calling-management/callLog.models.js";
import { CallingType } from "../../models/calling-management/callingType.models.js";
import { GamificationCriteria } from "../../models/gamification-management/gamificationCriteria.models.js";
import { GamificationParticipant } from "../../models/gamification-management/gamificationParticipant.models.js";
import { GamificationUserPoint } from "../../models/gamification-management/gamificationUserPoints.models.js";
import { GamificationUserRank } from "../../models/gamification-management/gamificationUserRanks.models.js";

const DAY_MS = 86400000;

export const startOfDay = (value) => {
  const d = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0,10)}T00:00:00.000Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
export const endOfDay = (value) => new Date(startOfDay(value).getTime() + DAY_MS - 1);
export const monthStart = (month) => {
  const [y,m] = String(month).split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error("month must be YYYY-MM");
  return new Date(Date.UTC(y,m-1,1));
};
export const monthEnd = (month) => {
  const d = monthStart(month);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0, 23,59,59,999));
};
const timeToMinutes = (value) => {
  const [h,m] = String(value || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h*60+m : null;
};
const eventMinutes = (date) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: process.env.GAMIFICATION_TIMEZONE || "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(date));
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour * 60 + minute;
};
const findTimeRule = (rules, date) => {
  const mins = eventMinutes(date);
  return (rules || []).find((r) => {
    const s=timeToMinutes(r.startTime), e=timeToMinutes(r.endTime);
    return s !== null && e !== null && mins >= s && mins <= e;
  });
};
const afterCutoff = (date, cutoff) => {
  const c=timeToMinutes(cutoff);
  return c !== null && eventMinutes(date) > c;
};
const findRangeRule = (rules, value) => (rules || []).find((r) => Number(value) >= Number(r.startRange) && Number(value) <= Number(r.endRange));
const classification = (points) => points > 0 ? "Positive" : points < 0 ? "Negative" : "Neutral";
const dayKey = (d) => startOfDay(d).toISOString().slice(0,10);
const eventKey = (...parts) => parts.map((x)=>String(x ?? "")).join("|");

let rankStoragePrepared = false;

const prepareRankStorage = async () => {
  if (rankStoragePrepared) return;

  try {
    const indexes =
      await GamificationUserRank.collection.indexes();

    const legacyIndex = indexes.find(
      (index) =>
        index.name ===
          "userId_1_periodType_1_periodStart_1" ||
        index.key?.periodType === 1
    );

    if (legacyIndex?.name) {
      try {
        await GamificationUserRank.collection.dropIndex(
          legacyIndex.name
        );
      } catch (error) {
        if (error?.code !== 27) {
          throw error;
        }
      }
    }

    // The old schema stored separate Daily/Monthly documents.
    // Those documents are intentionally removed because the new schema
    // stores exactly one monthly summary document per participant.
    await GamificationUserRank.deleteMany({
      periodType: { $exists: true },
    });
  } catch (error) {
    console.error(
      "Gamification rank storage migration failed:",
      error
    );
    throw error;
  }

  rankStoragePrepared = true;
};

const defaultCriteria = () => ({
  name: "Default Gamification Criteria",
  isActive: true,
  selfAttendance: [
    ["00:00","07:30",10,"User comes at or before 7:30 AM","08:15",-10],
    ["07:31","07:45",5,"User comes between 7:31 to 7:45 AM","08:15",-10],
    ["07:46","08:00",2,"User comes between 7:46 to 8:00 AM","08:15",-10],
    ["08:01","08:15",-5,"User comes between 8:01 to 8:15 AM","08:15",-10],
    ["08:16","23:59",-10,"User comes after 8:15 AM","08:15",-10],
  ].map(([startTime,endTime,point,description,timeValidation,negativeMarkingOnBreakingTimeValidation])=>({startTime,endTime,point,description,timeValidation,negativeMarkingOnBreakingTimeValidation})),
  studentAttendance: [
    [0,9,3],[10,14,5],[15,29,7],[30,39,8],[40,49,10],[50,79,12],[80,999,15],
  ].map(([startRange,endRange,point])=>({startRange,endRange,point,timeValidation:"14:40",negativeMarkingOnBreakingTimeValidation:-15,description:`Student attendance count between ${startRange} to ${endRange} students`})),
  pdfUpload: [{timeValidation:"14:40",point:5,negativeMarkingOnBreakingTimeValidation:-5,description:"PDF uploaded before or at school time (2:40 PM)"}],
  callingAbsentee: [
    [0,9,3],[10,14,5],[15,29,7],[30,39,8],[40,49,10],[50,79,12],[80,999,15],
  ].map(([startRange,endRange,point])=>({startRange,endRange,point,timeValidation:"14:40",negativeMarkingOnBreakingTimeValidation:-15,description:`Absentee calls made for ${startRange} to ${endRange} students`})),
  marks: [
    [0,9,3],[10,14,5],[15,29,7],[30,39,8],[40,49,10],[50,79,12],[80,999,15],
  ].map(([startRange,endRange,point])=>({startRange,endRange,point,description:`Marks uploaded for ${startRange} to ${endRange} students`,negativeMarkingOnBreakingTimeValidation:-15})),
  disciplinary: [
    [0,9,20],[10,14,25],[15,19,30],[20,24,35],[25,29,40],[30,39,50],[40,49,55],[50,1000,60],
  ].map(([startRange,endRange,point])=>({startRange,endRange,point,description:"User gets points based on grading given by the monitoring team"})),
});

export const getOrCreateCriteria = async () => {
  let criteria = await GamificationCriteria.findOne({isActive:true}).sort({updatedAt:-1});
  if (!criteria) criteria = await GamificationCriteria.create(defaultCriteria());
  return criteria;
};

const addPoint = (points, data) => {
  const p = Number(data.points || 0);
  points.push({...data, points:p, pointClassification:classification(p)});
};

const assignmentMatch = (a, programId, batchId, centerId) =>
  String(a.programId)===String(programId) && String(a.batchId)===String(batchId) && String(a.centerId)===String(centerId);

async function calculateParticipantDay(participant, date, criteria) {
  const points=[];
  const dayStart=startOfDay(date), dayEnd=endOfDay(date);
  const userId=participant.userId;
  const userAttendance=await UserAttendance.findOne({userId,date:{$gte:dayStart,$lte:dayEnd},attendanceType:"Daily Attendance",status:{$ne:"Leave"}}).sort({checkIn:1,createdAt:1}).lean();
  if (userAttendance?.checkIn) {
    const rule=findTimeRule(criteria.selfAttendance,userAttendance.checkIn);
    let p=rule?.point ?? 0;
    if (afterCutoff(userAttendance.checkIn,rule?.timeValidation || criteria.selfAttendance.find(r=>r.timeValidation)?.timeValidation)) p=Number(rule?.negativeMarkingOnBreakingTimeValidation ?? p);
    addPoint(points,{userId,eventDate:dayStart,eventType:"Self Attendance",sourceId:userAttendance._id,sourceModel:"UserAttendance",points:p,ruleId:rule?._id,eventTime:userAttendance.checkIn,description:rule?.description||"Self attendance"});
  }
  const assignments=participant.assignments||[];
  const seen=new Set();
  for (const a of assignments) {
    const k=`${a.programId}|${a.batchId}|${a.centerId}`;
    if(seen.has(k)) continue; seen.add(k);
    const enrollments=await StudentEnrollment.find({programId:a.programId,batchId:a.batchId,centerId:a.centerId,status:{$nin:["left","completed"]}}).select("_id studentId class").lean();
    const enrollmentIds=enrollments.map(x=>x._id), studentIds=enrollments.map(x=>x.studentId);
    if(!studentIds.length) continue;
    const attendance=await StudentAttendance.find({markedBy:userId,date:{$gte:dayStart,$lte:dayEnd},studentId:{$in:studentIds}}).sort({createdAt:1}).lean();
    const presentCount=attendance.filter((record)=>record.status==="Present").length;
    const rule=findRangeRule(criteria.studentAttendance,presentCount);
    if(rule && attendance.length) {
      const eventTime=attendance[attendance.length-1]?.createdAt || dayStart;
      const p=afterCutoff(new Date(eventTime),rule.timeValidation) ? Number(rule.negativeMarkingOnBreakingTimeValidation||0) : Number(rule.point||0);
      addPoint(points,{userId,eventDate:dayStart,eventType:"Student Attendance",sourceId:attendance[0]?._id||a.centerId,sourceModel:"StudentAttendance",programId:a.programId,batchId:a.batchId,centerId:a.centerId,points:p,ruleId:rule._id,metricValue:presentCount,eventTime:new Date(eventTime),description:rule.description||`Student attendance: ${presentCount}`});
    }
    const pdfs=await CenterWiseAttendance.find({uploadedBy:userId,centerId:a.centerId,batchId:a.batchId,date:{$gte:dayStart,$lte:dayEnd}}).sort({createdAt:1}).lean();
    for(const pdf of pdfs.slice(0,1)){
      const rule=criteria.pdfUpload[0];
      if(rule){
        const p=afterCutoff(new Date(pdf.createdAt),rule.timeValidation)?Number(rule.negativeMarkingOnBreakingTimeValidation||0):Number(rule.point||0);
        addPoint(points,{userId,eventDate:dayStart,eventType:"PDF Upload",sourceId:pdf._id,sourceModel:"CenterWiseAttendance",programId:a.programId,batchId:a.batchId,centerId:a.centerId,points:p,ruleId:rule._id,eventTime:pdf.createdAt,description:rule.description||"Center attendance PDF upload"});
      }
    }
    const monitoring=await CenterMonitoring.find({programId:a.programId,batchId:a.batchId,centerId:a.centerId,date:{$gte:dayStart,$lte:dayEnd}}).sort({createdAt:1}).lean();
    const firstTwo=monitoring.slice(0,2);
    const userMonitoring=firstTwo.find(x=>String(x.markedBy)===String(userId));
    if(userMonitoring){
      const class9or10=enrollments.filter(x=>[9,10].includes(Number(x.class))).length;
      const rule=findRangeRule(criteria.disciplinary,class9or10);
      if(rule){
        const grade=userMonitoring.discipline;
        let multiplier=0;
        if(grade==="Poor") multiplier=-0.5;
        if(grade==="Good") multiplier=0.25;
        if(grade==="Excellent") multiplier=0.5;
        const p=Number(rule.point||0)*multiplier;
        addPoint(points,{userId,eventDate:dayStart,eventType:"Disciplinary",sourceId:userMonitoring._id,sourceModel:"CenterMonitoring",programId:a.programId,batchId:a.batchId,centerId:a.centerId,points:p,ruleId:rule._id,metricValue:class9or10,eventTime:userMonitoring.createdAt,description:`${grade} monitoring grade for ${class9or10} class 9/10 students`});
      }
    }
  }
  const callLogs=await CallLog.find({calledBy:userId,createdAt:{$gte:dayStart,$lte:dayEnd}}).populate("callingTypeId","callingTitle callingTypeCode").populate({path:"callingDetailId",select:"calledCenter"}).sort({createdAt:1}).lean();
  const absenteeLogs=callLogs.filter(c=>/absentee/i.test(`${c.callingTypeId?.callingTitle||""} ${c.callingTypeId?.callingTypeCode||""}`));
  if(absenteeLogs.length){
    const rule=findRangeRule(criteria.callingAbsentee,absenteeLogs.length);
    if(rule){
      const first=absenteeLogs[0];
      const lastLog=absenteeLogs[absenteeLogs.length-1];
      const p=afterCutoff(new Date(lastLog.createdAt),rule.timeValidation)?Number(rule.negativeMarkingOnBreakingTimeValidation||0):Number(rule.point||0);
      addPoint(points,{userId,eventDate:dayStart,eventType:"Calling Absentee",sourceId:first._id,sourceModel:"CallLog",points:p,ruleId:rule._id,metricValue:absenteeLogs.length,eventTime:lastLog.createdAt,description:rule.description||`Absentee calls: ${absenteeLogs.length}`});
    }
  }
  return points;
}


const GAMIFICATION_EVENT_TYPES = [
  "Self Attendance",
  "Student Attendance",
  "PDF Upload",
  "Calling Absentee",
  "Marks",
  "Disciplinary",
];

const calculateParticipantMarks = async (
  participant,
  monthStartDate,
  monthEndDate,
  criteria
) => {
  const points = [];
  const userId = participant.userId;
  const assignments = participant.assignments || [];
  const seen = new Set();

  for (const a of assignments) {
    const assignmentKey = `${a.programId}|${a.batchId}|${a.centerId}`;
    if (seen.has(assignmentKey)) continue;
    seen.add(assignmentKey);

    const enrollments = await StudentEnrollment.find({
      programId: a.programId,
      batchId: a.batchId,
      centerId: a.centerId,
      status: { $nin: ["left", "completed"] },
    })
      .select("_id studentId")
      .lean();

    const enrollmentIds = enrollments.map((x) => x._id);
    if (!enrollmentIds.length) continue;

    // We intentionally read the complete current set of marks for each
    // relevant exam. This makes "10 marks today -> 30 marks tomorrow"
    // evaluate against the final 30-student count instead of treating
    // the second upload as a separate partial submission.
    const marks = await StudentMark.find({
      filledBy: userId,
      enrollmentId: { $in: enrollmentIds },
      updatedAt: { $lte: monthEndDate },
    })
      .populate({
        path: "examId",
        select: "examDate marksUploadWithinDays programId batchId",
      })
      .populate({
        path: "enrollmentId",
        select: "centerId batchId programId",
      })
      .lean();

    const relevantMarks = marks.filter(
      (mark) =>
        mark.examId &&
        mark.enrollmentId &&
        assignmentMatch(
          a,
          mark.examId.programId,
          mark.examId.batchId,
          mark.enrollmentId.centerId
        )
    );

    const marksByExam = new Map();

    for (const mark of relevantMarks) {
      const examId = String(mark.examId._id);

      if (!marksByExam.has(examId)) {
        marksByExam.set(examId, []);
      }

      marksByExam.get(examId).push(mark);
    }

    for (const [examId, examMarks] of marksByExam) {
      const latestMark = examMarks.reduce((latest, current) => {
        if (!latest) return current;

        return new Date(current.updatedAt || current.createdAt) >
          new Date(latest.updatedAt || latest.createdAt)
          ? current
          : latest;
      }, null);

      if (!latestMark) continue;

      const latestMarkTime = new Date(
        latestMark.updatedAt || latestMark.createdAt
      );

      // Only create the event on the day on which the latest marks
      // submission/update happened within the selected month.
      if (
        latestMarkTime < monthStartDate ||
        latestMarkTime > monthEndDate
      ) {
        continue;
      }

      const exam = latestMark.examId;
      const deadline = endOfDay(
        new Date(
          new Date(exam.examDate).getTime() +
            Number(exam.marksUploadWithinDays || 0) * DAY_MS
        )
      );

      const metricValue = examMarks.length;
      const rule = findRangeRule(criteria.marks, metricValue);

      if (!rule) continue;

      const pointsValue =
        latestMarkTime > deadline
          ? Number(rule.negativeMarkingOnBreakingTimeValidation || 0)
          : Number(rule.point || 0);

      addPoint(points, {
        userId,
        eventDate: startOfDay(latestMarkTime),
        eventType: "Marks",
        sourceId: examId,
        sourceModel: "Exam",
        programId: a.programId,
        batchId: a.batchId,
        centerId: a.centerId,
        points: pointsValue,
        ruleId: rule._id,
        metricValue,
        eventTime: latestMarkTime,
        description:
          latestMarkTime > deadline
            ? "Marks uploaded after allowed window"
            : rule.description || "Marks uploaded",
      });
    }
  }

  return points;
};

const aggregateRankData = async ({
  month,
  userIds,
  rankingDate,
  calculationRunId,
}) => {
  const start = monthStart(month);
  const end = monthEnd(month);

  const monthAgg = await GamificationUserPoint.aggregate([
    {
      $match: {
        userId: { $in: userIds },
        eventDate: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: "$userId",
        totalPoints: { $sum: "$points" },
        positivePoints: {
          $sum: {
            $cond: [{ $gt: ["$points", 0] }, "$points", 0],
          },
        },
        negativePoints: {
          $sum: {
            $cond: [{ $lt: ["$points", 0] }, "$points", 0],
          },
        },
        eventCount: { $sum: 1 },
        earliestAttendanceAt: {
          $min: {
            $cond: [
              { $eq: ["$eventType", "Self Attendance"] },
              "$eventTime",
              null,
            ],
          },
        },
      },
    },
  ]);

  const monthMap = new Map(
    monthAgg.map((row) => [String(row._id), row])
  );

  const safeRankingDate = startOfDay(
    rankingDate < start
      ? start
      : rankingDate > end
      ? end
      : rankingDate
  );

  const todayAgg = await GamificationUserPoint.aggregate([
    {
      $match: {
        userId: { $in: userIds },
        eventDate: {
          $gte: safeRankingDate,
          $lte: endOfDay(safeRankingDate),
        },
      },
    },
    {
      $group: {
        _id: "$userId",
        totalPoints: { $sum: "$points" },
        eventCount: { $sum: 1 },
        earliestAttendanceAt: {
          $min: {
            $cond: [
              { $eq: ["$eventType", "Self Attendance"] },
              "$eventTime",
              null,
            ],
          },
        },
      },
    },
  ]);

  const todayMap = new Map(
    todayAgg.map((row) => [String(row._id), row])
  );

  const monthlyRows = userIds.map((id) => {
    const row =
      monthMap.get(String(id)) || {
        _id: id,
        totalPoints: 0,
        positivePoints: 0,
        negativePoints: 0,
        eventCount: 0,
        earliestAttendanceAt: null,
      };

    return row;
  });

  monthlyRows.sort((a, b) => {
    if (Number(b.totalPoints) !== Number(a.totalPoints)) {
      return Number(b.totalPoints) - Number(a.totalPoints);
    }

    const aTime = a.earliestAttendanceAt
      ? new Date(a.earliestAttendanceAt).getTime()
      : Number.MAX_SAFE_INTEGER;

    const bTime = b.earliestAttendanceAt
      ? new Date(b.earliestAttendanceAt).getTime()
      : Number.MAX_SAFE_INTEGER;

    if (aTime !== bTime) return aTime - bTime;

    return String(a._id).localeCompare(String(b._id));
  });

  const monthRankMap = new Map(
    monthlyRows.map((row, index) => [
      String(row._id),
      index + 1,
    ])
  );

  const todayRows = userIds.map((id) => {
    return (
      todayMap.get(String(id)) || {
        _id: id,
        totalPoints: 0,
        eventCount: 0,
        earliestAttendanceAt: null,
      }
    );
  });

  todayRows.sort((a, b) => {
    if (Number(b.totalPoints) !== Number(a.totalPoints)) {
      return Number(b.totalPoints) - Number(a.totalPoints);
    }

    const aTime = a.earliestAttendanceAt
      ? new Date(a.earliestAttendanceAt).getTime()
      : Number.MAX_SAFE_INTEGER;

    const bTime = b.earliestAttendanceAt
      ? new Date(b.earliestAttendanceAt).getTime()
      : Number.MAX_SAFE_INTEGER;

    if (aTime !== bTime) return aTime - bTime;

    return String(a._id).localeCompare(String(b._id));
  });

  const todayRankMap = new Map(
    todayRows.map((row, index) => [
      String(row._id),
      index + 1,
    ])
  );

  const breakdownAgg = await GamificationUserPoint.aggregate([
    {
      $match: {
        userId: { $in: userIds },
        eventDate: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: {
          userId: "$userId",
          eventType: "$eventType",
        },
        totalPoint: { $sum: "$points" },
      },
    },
  ]);

  const todayBreakdownAgg = await GamificationUserPoint.aggregate([
    {
      $match: {
        userId: { $in: userIds },
        eventDate: {
          $gte: safeRankingDate,
          $lte: endOfDay(safeRankingDate),
        },
      },
    },
    {
      $group: {
        _id: {
          userId: "$userId",
          eventType: "$eventType",
        },
        todaysPoint: { $sum: "$points" },
      },
    },
  ]);

  const breakdownMap = new Map();
  for (const row of breakdownAgg) {
    const key = `${row._id.userId}|${row._id.eventType}`;
    breakdownMap.set(key, Number(row.totalPoint || 0));
  }

  const todayBreakdownMap = new Map();
  for (const row of todayBreakdownAgg) {
    const key = `${row._id.userId}|${row._id.eventType}`;
    todayBreakdownMap.set(
      key,
      Number(row.todaysPoint || 0)
    );
  }

  const rankRows = userIds.map((userId) => {
    const monthRow =
      monthMap.get(String(userId)) || {
        totalPoints: 0,
        positivePoints: 0,
        negativePoints: 0,
        eventCount: 0,
      };

    const todayRow =
      todayMap.get(String(userId)) || {
        totalPoints: 0,
        eventCount: 0,
      };

    const eventBreakdown = GAMIFICATION_EVENT_TYPES.map(
      (eventType) => {
        const totalPoint =
          breakdownMap.get(`${userId}|${eventType}`) || 0;

        const todaysPoint =
          todayBreakdownMap.get(`${userId}|${eventType}`) || 0;

        return {
          eventType,
          totalPoint,
          todaysPoint,
          pointClassification: classification(totalPoint),
        };
      }
    );

    return {
      userId,
      month: Number(month.split("-")[1]),
      year: Number(month.split("-")[0]),
      startDate: start,
      endDate: end,
      rank: monthRankMap.get(String(userId)) || userIds.length,
      todayRank:
        todayRankMap.get(String(userId)) || userIds.length,
      monthRank:
        monthRankMap.get(String(userId)) || userIds.length,
      eventBreakdown,
      totalPoints: Number(monthRow.totalPoints || 0),
      positivePoints: Number(monthRow.positivePoints || 0),
      negativePoints: Number(monthRow.negativePoints || 0),
      eventCount: Number(monthRow.eventCount || 0),
      todayPoints: Number(todayRow.totalPoints || 0),
      todayEventCount: Number(todayRow.eventCount || 0),
      pointClassification: classification(
        Number(monthRow.totalPoints || 0)
      ),
      calculationRunId,
      rankingDate: safeRankingDate,
    };
  });

  return rankRows;
};

export const updateMonthlyRanking = async ({
  month,
  initiatedBy,
  rankingDate = new Date(),
}) => {
  await prepareRankStorage();

  const participants = await GamificationParticipant.find({
    isActive: true,
  })
    .select("userId")
    .lean();

  const userIds = participants.map((p) => p.userId);

  if (!userIds.length) {
    return {
      runId: null,
      totalParticipants: 0,
      totalRanks: 0,
      month,
    };
  }

  const runId = crypto.randomUUID();
  const rows = await aggregateRankData({
    month,
    userIds,
    rankingDate,
    calculationRunId: runId,
  });

  await Promise.all(
    rows.map((row) =>
      GamificationUserRank.findOneAndUpdate(
        {
          userId: row.userId,
          year: row.year,
          month: row.month,
        },
        { $set: row },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );

  return {
    runId,
    totalParticipants: participants.length,
    totalRanks: rows.length,
    month,
  };
};

export const initiateGamification = async ({
  month,
  initiatedBy,
}) => {
  await prepareRankStorage();

  const start = monthStart(month);
  const end = monthEnd(month);
  const today = endOfDay(new Date());
  const calcEnd = end > today ? today : end;
  const criteria = await getOrCreateCriteria();

  const participants = await GamificationParticipant.find({
    isActive: true,
  }).lean();

  const runId = crypto.randomUUID();
  const userIds = participants.map((p) => p.userId);

  if (!userIds.length) {
    return {
      runId,
      totalParticipants: 0,
      totalPointEvents: 0,
      totalRanks: 0,
      month,
    };
  }

  // Rebuild the selected month's single summary record for each participant.
  await GamificationUserRank.deleteMany({
    userId: { $in: userIds },
    year: Number(month.split("-")[0]),
    month: Number(month.split("-")[1]),
  });

  await GamificationUserPoint.deleteMany({
    userId: { $in: userIds },
    eventDate: { $gte: start, $lte: end },
  });

  const allPoints = [];

  for (const participant of participants) {
    for (
      let day = new Date(start);
      day <= calcEnd;
      day = new Date(day.getTime() + DAY_MS)
    ) {
      const dayPoints = await calculateParticipantDay(
        participant,
        day,
        criteria
      );

      for (const item of dayPoints) {
        item.eventKey = eventKey(
          item.userId,
          dayKey(item.eventDate),
          item.eventType,
          item.sourceId,
          item.programId,
          item.batchId,
          item.centerId
        );
      }

      allPoints.push(...dayPoints);
    }

    const markPoints = await calculateParticipantMarks(
      participant,
      start,
      calcEnd,
      criteria
    );

    for (const item of markPoints) {
      item.eventKey = eventKey(
        item.userId,
        dayKey(item.eventDate),
        item.eventType,
        item.sourceId,
        item.programId,
        item.batchId,
        item.centerId
      );
    }

    allPoints.push(...markPoints);
  }

  if (allPoints.length) {
    await GamificationUserPoint.insertMany(
      allPoints,
      { ordered: false }
    );
  }

  const rankResult = await updateMonthlyRanking({
    month,
    initiatedBy,
    rankingDate:
      new Date() < start
        ? start
        : new Date() > end
        ? end
        : new Date(),
  });

  return {
    runId,
    totalParticipants: participants.length,
    totalPointEvents: allPoints.length,
    totalRanks: rankResult.totalRanks,
    month,
  };
};
