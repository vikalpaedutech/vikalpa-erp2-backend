import mongoose from "mongoose";

import {
  CenterMonitoring,
} from "../../models/academic-management/centerMonitoring.models.js";

import {
  MonitoringRegionAccess,
} from "../../models/academic-management/monitoringRegionAccess.models.js";

import {
  UserAccess,
} from "../../models/user-management/userAccess.models.js";

import {
  UserRole,
} from "../../models/user-management/userRole.models.js";

import {
  Center,
} from "../../models/region-management/center.models.js";

import {
  Program,
} from "../../models/program-management/prgroam.models.js";

import {
  Batch,
} from "../../models/program-management/batch.models.js";

import {
  District,
} from "../../models/region-management/district.models.js";


// ============================================================
// CONSTANTS
// ============================================================

const DISCIPLINE_VALUES = [
  "Poor",
  "Average",
  "Good",
  "Excellent",
  "Camera Off",
];


// ============================================================
// HELPERS
// ============================================================

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};


const getUserId = (req) => {
  return (
    req.user?._id ||
    req.user?.id
  );
};


// ============================================================
// DATE HELPERS
//
// IMPORTANT:
//
// Monitoring date is a CALENDAR DATE, not a timestamp.
//
// Therefore we deliberately handle dates in UTC so that:
//
// 20-09-2026
//
// always remains:
//
// 2026-09-20
//
// and does not become:
//
// 2026-09-19
//
// because of server/browser timezone conversion.
// ============================================================

const getStartOfDay = (dateValue) => {
  const value =
    String(dateValue || "")
      .slice(0, 10);

  const parts =
    value.split("-");

  if (
    parts.length !== 3
  ) {
    return new Date("invalid");
  }

  const year =
    Number(parts[0]);

  const month =
    Number(parts[1]);

  const day =
    Number(parts[2]);

  if (
    !year ||
    !month ||
    !day
  ) {
    return new Date("invalid");
  }

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      0,
      0,
      0
    )
  );
};


const getEndOfDay = (dateValue) => {
  const value =
    String(dateValue || "")
      .slice(0, 10);

  const parts =
    value.split("-");

  if (
    parts.length !== 3
  ) {
    return new Date("invalid");
  }

  const year =
    Number(parts[0]);

  const month =
    Number(parts[1]);

  const day =
    Number(parts[2]);

  if (
    !year ||
    !month ||
    !day
  ) {
    return new Date("invalid");
  }

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      23,
      59,
      59,
      999
    )
  );
};


// ============================================================
// FORMAT DATE AS YYYY-MM-DD
//
// IMPORTANT:
// Uses UTC components intentionally because monitoring date
// is stored as a calendar date.
// ============================================================

const formatDateOnly = (dateValue) => {
  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const year =
    date.getUTCFullYear();

  const month =
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getUTCDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};


// ============================================================
// GET ALL CALENDAR DATES
//
// Example:
//
// 2026-09-20 -> 2026-09-20
//
// gives exactly one date.
// ============================================================

const getDateStrings = (
  fromDate,
  toDate
) => {
  const start =
    getStartOfDay(
      fromDate
    );

  const end =
    getStartOfDay(
      toDate
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    return [];
  }

  const dates = [];

  const current =
    new Date(start);

  while (
    current <= end
  ) {
    dates.push(
      formatDateOnly(
        current
      )
    );

    current.setUTCDate(
      current.getUTCDate() + 1
    );
  }

  return dates;
};


// ============================================================
// GET DATE RANGE
// ============================================================

const getDateRange = (
  fromDate,
  toDate
) => {
  const startDate =
    fromDate
      ? getStartOfDay(
          fromDate
        )
      : getStartOfDay(
          new Date()
        );

  const endDate =
    toDate
      ? getEndOfDay(
          toDate
        )
      : getEndOfDay(
          fromDate ||
            new Date()
        );

  return {
    $gte: startDate,
    $lte: endDate,
  };
};


// ============================================================
// PROGRAM / BATCH ACCESS
// ============================================================

const validateProgramBatchAccess =
  async (
    userId,
    programId,
    batchId
  ) => {
    const access =
      await UserAccess.findOne({
        userId,
        programIds:
          programId,
        batchIds:
          batchId,
      }).lean();

    return !!access;
  };


// ============================================================
// GET USER ROLE CODE
//
// Kept because other existing controller functionality may
// use role information.
//
// IMPORTANT:
// Monitoring FULL REPORT does NOT use this.
// ============================================================

const getUserRoleCode =
  async (userId) => {
    const userRole =
      await UserRole.findOne({
        userId,
        isActive: true,
      })
        .populate({
          path: "roleId",
          select:
            "roleCode roleName",
        })
        .lean();

    return (
      userRole
        ?.roleId
        ?.roleCode ||
      null
    );
  };


// ============================================================
// CHECK MONITORING CENTER ACCESS
// ============================================================

const getAuthorizedMonitoringCenter =
  async ({
    userId,
    programId,
    batchId,
    centerId,
  }) => {
    const access =
      await MonitoringRegionAccess.findOne(
        {
          userId,
          programId,
          batchId,
          centerId,
          isActive: true,
        }
      ).lean();

    return !!access;
  };


// ============================================================
// CREATE CENTER MONITORING
// ============================================================

export const createCenterMonitoring =
  async (
    req,
    res
  ) => {
    try {
      const userId =
        getUserId(req);

      if (
        !userId ||
        !isValidObjectId(
          userId
        )
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });
      }

      const {
        programId,
        batchId,
        districtId,
        blockId,
        centerId,
        discipline,
        date,
        remark,
      } = req.body;


      // ======================================================
      // VALIDATION
      // ======================================================

      if (
        !programId ||
        !isValidObjectId(
          programId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid programId is required.",
        });
      }


      if (
        !batchId ||
        !isValidObjectId(
          batchId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid batchId is required.",
        });
      }


      if (
        !centerId ||
        !isValidObjectId(
          centerId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid centerId is required.",
        });
      }


      if (
        !DISCIPLINE_VALUES.includes(
          discipline
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid discipline value.",
        });
      }


      if (!date) {
        return res.status(400).json({
          success: false,
          message:
            "Date is required.",
        });
      }


      // ======================================================
      // NORMALIZE MONITORING DATE
      //
      // IMPORTANT:
      //
      // Store calendar date at UTC midnight.
      //
      // Example:
      //
      // "2026-09-20"
      //
      // becomes:
      //
      // 2026-09-20T00:00:00.000Z
      //
      // This prevents timezone shifting.
      // ======================================================

      const monitoringDate =
        getStartOfDay(
          date
        );

      if (
        Number.isNaN(
          monitoringDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid date.",
        });
      }


      // ======================================================
      // CHECK USER MONITORING ACCESS
      // ======================================================

      const hasMonitoringAccess =
        await getAuthorizedMonitoringCenter(
          {
            userId,
            programId,
            batchId,
            centerId,
          }
        );


      if (!hasMonitoringAccess) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to monitor this center.",
        });
      }


      // ======================================================
      // CHECK CENTER
      // ======================================================

      const center =
        await Center.findOne({
          _id: centerId,
          isCenterAvailable: true,
        }).lean();


      if (!center) {
        return res.status(404).json({
          success: false,
          message:
            "Center not found or unavailable.",
        });
      }


      // ======================================================
      // CREATE MONITORING
      // ======================================================

      const monitoring =
        await CenterMonitoring.create({
          programId,
          batchId,

          districtId:
            districtId || null,

          blockId:
            blockId || null,

          centerId,

          discipline,

          date:
            monitoringDate,

          remark:
            remark || "",

          markedBy:
            userId,
        });


      return res.status(201).json({
        success: true,

        message:
          "Center monitoring saved successfully.",

        data:
          monitoring,
      });

    } catch (error) {
      console.error(
        "createCenterMonitoring error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to create center monitoring.",

        error:
          error.message,
      });
    }
  };


// ============================================================
// GET MONITORING CENTERS
// ============================================================

export const getMonitoringCenters =
  async (
    req,
    res
  ) => {
    try {
      const userId =
        getUserId(req);

      if (
        !userId ||
        !isValidObjectId(
          userId
        )
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });
      }


      const {
        programId,
        batchId,
        districtId,
        date,
        search,
      } = req.query;


      if (
        !programId ||
        !batchId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "programId and batchId are required.",
        });
      }


      // ======================================================
      // USER ASSIGNED CENTERS
      // ======================================================

      const accessQuery = {
        userId,
        programId,
        batchId,
        isActive: true,
      };


      if (districtId) {
        accessQuery.districtId =
          districtId;
      }


      const access =
        await MonitoringRegionAccess.find(
          accessQuery
        )
          .populate(
            "districtId",
            "districtName districtId"
          )
          .populate(
            "blockId",
            "blockName blockId"
          )
          .populate(
            "centerId",
            "centerName centerCode isCenterAvailable"
          )
          .lean();


      const centerMap =
        new Map();


      access.forEach(
        (item) => {
          if (
            !item.centerId ||
            item.centerId
              .isCenterAvailable ===
              false
          ) {
            return;
          }


          const centerId =
            String(
              item.centerId._id
            );


          if (
            centerMap.has(
              centerId
            )
          ) {
            return;
          }


          centerMap.set(
            centerId,
            {
              centerId,

              centerName:
                item.centerId
                  .centerName ||
                "",

              centerCode:
                item.centerId
                  .centerCode ||
                "",

              districtId:
                item.districtId?._id
                  ? String(
                      item
                        .districtId
                        ._id
                    )
                  : "",

              districtName:
                item.districtId
                  ?.districtName ||
                "",

              blockId:
                item.blockId?._id
                  ? String(
                      item
                        .blockId
                        ._id
                    )
                  : "",

              blockName:
                item.blockId
                  ?.blockName ||
                "",
            }
          );
        }
      );


      let centers =
        Array.from(
          centerMap.values()
        );


      // ======================================================
      // SEARCH
      // ======================================================

      if (search) {
        const searchText =
          String(
            search
          ).toLowerCase();


        centers =
          centers.filter(
            (center) =>
              String(
                center.centerName
              )
                .toLowerCase()
                .includes(
                  searchText
                ) ||
              String(
                center.centerCode
              )
                .toLowerCase()
                .includes(
                  searchText
                ) ||
              String(
                center.districtName
              )
                .toLowerCase()
                .includes(
                  searchText
                ) ||
              String(
                center.blockName
              )
                .toLowerCase()
                .includes(
                  searchText
                )
          );
      }


      // ======================================================
      // DATE MONITORING RECORDS
      // ======================================================

      let monitoringRecords =
        [];


      if (date) {
        const dateRange =
          getDateRange(
            date,
            date
          );


        monitoringRecords =
          await CenterMonitoring.find(
            {
              programId,
              batchId,

              centerId: {
                $in:
                  centers.map(
                    (
                      center
                    ) =>
                      center.centerId
                  ),
              },

              date:
                dateRange,
            }
          )
            .sort({
              createdAt:
                -1,
            })
            .lean();
      }


      // ======================================================
      // MAP MONITORING RECORDS
      // ======================================================

      const monitoringMap =
        new Map();


      monitoringRecords.forEach(
        (record) => {
          const centerId =
            String(
              record.centerId
            );


          if (
            !monitoringMap.has(
              centerId
            )
          ) {
            monitoringMap.set(
              centerId,
              record
            );
          }
        }
      );


      const data =
        centers.map(
          (center) => {
            const record =
              monitoringMap.get(
                center.centerId
              );


            return {
              ...center,

              monitoringId:
                record?._id ||
                null,

              discipline:
                record?.discipline ||
                null,

              remark:
                record?.remark ||
                "",

              monitoringDate:
                record?.date ||
                null,

              markedBy:
                record?.markedBy ||
                null,
            };
          }
        );


      return res.status(200).json({
        success: true,
        data,
      });

    } catch (error) {
      console.error(
        "getMonitoringCenters error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch monitoring centers.",
        error:
          error.message,
      });
    }
  };


// ============================================================
// GET MY MONITORING ACCESS
// ============================================================

export const getMyMonitoringAccess =
  async (
    req,
    res
  ) => {
    try {
      const userId =
        getUserId(req);

      if (
        !userId ||
        !isValidObjectId(
          userId
        )
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });
      }


      const access =
        await MonitoringRegionAccess.find({
          userId,
          isActive: true,
        })
          .populate(
            "programId",
            "programName programCode"
          )
          .populate(
            "batchId",
            "batchName startYear endYear"
          )
          .populate(
            "districtId",
            "districtName districtId"
          )
          .populate(
            "blockId",
            "blockName blockId"
          )
          .populate(
            "centerId",
            "centerName centerCode isCenterAvailable"
          )
          .lean();


      const filteredAccess =
        access.filter(
          (item) =>
            item.centerId &&
            item.centerId
              .isCenterAvailable !==
              false
        );


      return res.status(200).json({
        success: true,
        data:
          filteredAccess,
      });

    } catch (error) {
      console.error(
        "getMyMonitoringAccess error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch monitoring access.",
        error:
          error.message,
      });
    }
  };


// ============================================================
// GET CENTER MONITORING RECORDS
// ============================================================

export const getCenterMonitoringRecords =
  async (
    req,
    res
  ) => {
    try {
      const {
        programId,
        batchId,
        districtId,
        blockId,
        centerId,
        fromDate,
        toDate,
        search,
        page = 1,
        limit = 20,
      } = req.query;


      const query = {};


      if (programId) {
        query.programId =
          programId;
      }


      if (batchId) {
        query.batchId =
          batchId;
      }


      if (districtId) {
        query.districtId =
          districtId;
      }


      if (blockId) {
        query.blockId =
          blockId;
      }


      if (centerId) {
        query.centerId =
          centerId;
      }


      if (
        fromDate ||
        toDate
      ) {
        query.date =
          getDateRange(
            fromDate,
            toDate
          );
      }


      const skip =
        (
          Number(page) -
          1
        ) *
        Number(limit);


      const [
        records,
        total,
      ] = await Promise.all([
        CenterMonitoring.find(
          query
        )
          .populate(
            "programId",
            "programName programCode"
          )
          .populate(
            "batchId",
            "batchName"
          )
          .populate(
            "districtId",
            "districtName"
          )
          .populate(
            "blockId",
            "blockName"
          )
          .populate(
            "centerId",
            "centerName centerCode"
          )
          .populate(
            "markedBy",
            "name email userId"
          )
          .sort({
            date: -1,
            createdAt:
              -1,
          })
          .skip(skip)
          .limit(
            Number(limit)
          )
          .lean(),

        CenterMonitoring.countDocuments(
          query
        ),
      ]);


      return res.status(200).json({
        success: true,

        data: records,

        pagination: {
          page:
            Number(page),

          limit:
            Number(limit),

          total,

          totalPages:
            Math.ceil(
              total /
                Number(limit)
            ),
        },
      });

    } catch (error) {
      console.error(
        "getCenterMonitoringRecords error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch monitoring records.",
        error:
          error.message,
      });
    }
  };


// ============================================================
// GET CENTER MONITORING SUMMARY
// ============================================================

export const getCenterMonitoringSummary =
  async (
    req,
    res
  ) => {
    try {
      const {
        programId,
        batchId,
        districtId,
        blockId,
        centerId,
        fromDate,
        toDate,
      } = req.query;


      const match = {};


      if (programId) {
        match.programId =
          new mongoose.Types.ObjectId(
            programId
          );
      }


      if (batchId) {
        match.batchId =
          new mongoose.Types.ObjectId(
            batchId
          );
      }


      if (districtId) {
        match.districtId =
          new mongoose.Types.ObjectId(
            districtId
          );
      }


      if (blockId) {
        match.blockId =
          new mongoose.Types.ObjectId(
            blockId
          );
      }


      if (centerId) {
        match.centerId =
          new mongoose.Types.ObjectId(
            centerId
          );
      }


      if (
        fromDate ||
        toDate
      ) {
        match.date =
          getDateRange(
            fromDate,
            toDate
          );
      }


      const summary =
        await CenterMonitoring.aggregate([
          {
            $match:
              match,
          },

          {
            $group: {
              _id:
                "$discipline",

              count: {
                $sum: 1,
              },
            },
          },
        ]);


      const result = {
        Poor: 0,
        Average: 0,
        Good: 0,
        Excellent: 0,
        "Camera Off": 0,
      };


      summary.forEach(
        (item) => {
          if (
            Object.prototype.hasOwnProperty.call(
              result,
              item._id
            )
          ) {
            result[item._id] =
              item.count;
          }
        }
      );


      return res.status(200).json({
        success: true,
        data: result,
      });

    } catch (error) {
      console.error(
        "getCenterMonitoringSummary error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch monitoring summary.",
        error:
          error.message,
      });
    }
  };


// ============================================================
// GET CENTER MONITORING REPORT OPTIONS
//
// NO ROLE CHECK.
//
// Any authenticated user can access report options.
// ============================================================

export const getCenterMonitoringReportOptions =
  async (
    req,
    res
  ) => {
    try {
      const userId =
        getUserId(req);

      if (
        !userId ||
        !isValidObjectId(
          userId
        )
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });
      }


      const [
        programs,
        batches,
        districts,
      ] = await Promise.all([
        Program.find({
          isActive: true,
        })
          .select(
            "programName programCode"
          )
          .sort({
            programName: 1,
          })
          .lean(),

        Batch.find({
          isActive: true,
        })
          .populate(
            "programId",
            "programName programCode"
          )
          .select(
            "programId batchName startYear endYear"
          )
          .sort({
            batchName: 1,
          })
          .lean(),

        District.find({})
          .select(
            "districtId districtName"
          )
          .sort({
            districtName: 1,
          })
          .lean(),
      ]);


      return res.status(200).json({
        success: true,

        data: {
          programs,
          batches,
          districts,
        },
      });

    } catch (error) {
      console.error(
        "getCenterMonitoringReportOptions error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch monitoring report options.",
        error:
          error.message,
      });
    }
  };


// ============================================================
// GET CENTER MONITORING REPORT
//
// MAIN / FULL REPORT
//
// Route:
// GET /center-monitoring/report
//
// IMPORTANT:
//
// NO ROLE CHECK.
//
// Any authenticated user can access.
//
// This report contains ALL users' monitoring records.
// ============================================================

export const getCenterMonitoringReport =
  async (
    req,
    res
  ) => {

    try {
      const {
        programId,
        batchId,
        districtId,
        fromDate,
        toDate,
      } = req.query;


      const userId =
        getUserId(req);






      // ======================================================
      // 1. AUTHENTICATION ONLY
      //
      // NO ROLE CHECK.
      // ======================================================

      if (
        !userId ||
        !isValidObjectId(
          userId
        )
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });
      }


      // ======================================================
      // 2. FILTER VALIDATION
      // ======================================================

      if (
        !programId ||
        !isValidObjectId(
          programId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid programId is required.",
        });
      }


      if (
        !batchId ||
        !isValidObjectId(
          batchId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid batchId is required.",
        });
      }


      if (
        districtId &&
        !isValidObjectId(
          districtId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid districtId.",
        });
      }


      if (
        !fromDate ||
        !toDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "fromDate and toDate are required.",
        });
      }


      // ======================================================
      // 3. DATE RANGE
      //
      // DATE IS TREATED AS CALENDAR DATE.
      // NO LOCAL TIMEZONE CONVERSION.
      // ======================================================

      const startDate =
        getStartOfDay(
          fromDate
        );


      const endDate =
        getEndOfDay(
          toDate
        );


      if (
        Number.isNaN(
          startDate.getTime()
        ) ||
        Number.isNaN(
          endDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid date range.",
        });
      }


      if (
        startDate >
        endDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "fromDate cannot be greater than toDate.",
        });
      }


      // ======================================================
      // 4. GET PROGRAM
      // ======================================================

      const program =
        await Program.findOne({
          _id: programId,
          isActive: true,
        })
          .select(
            "programName programCode"
          )
          .lean();


      if (!program) {
        return res.status(404).json({
          success: false,
          message:
            "Program not found or inactive.",
        });
      }


      // ======================================================
      // 5. GET BATCH
      // ======================================================

      const batch =
        await Batch.findOne({
          _id: batchId,
          isActive: true,
        })
          .select(
            "batchName startYear endYear programId"
          )
          .lean();


      if (!batch) {
        return res.status(404).json({
          success: false,
          message:
            "Batch not found or inactive.",
        });
      }


      // ======================================================
      // 6. VERIFY BATCH BELONGS TO PROGRAM
      // ======================================================

      if (
        String(
          batch.programId
        ) !==
        String(
          programId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Selected batch does not belong to selected program.",
        });
      }


      // ======================================================
      // 7. BUILD CENTER ACCESS QUERY
      //
      // NO USER ID.
      //
      // Therefore ALL monitoring centers for selected
      // Program + Batch are included.
      // ======================================================

      const accessQuery = {
        programId,
        batchId,
        isActive: true,
      };


      if (districtId) {
        accessQuery.districtId =
          districtId;
      }




      const monitoringAccess =
        await MonitoringRegionAccess.find(
          accessQuery
        )
          .populate(
            "programId",
            "programName programCode"
          )
          .populate(
            "batchId",
            "batchName startYear endYear"
          )
          .populate(
            "districtId",
            "districtName districtId"
          )
          .populate(
            "blockId",
            "blockName blockId"
          )
          .populate(
            "centerId",
            "centerName centerCode isCenterAvailable"
          )
          .lean();




      // ======================================================
      // 8. ONLY ACTIVE CENTERS
      // ======================================================

      const activeAccess =
        monitoringAccess.filter(
          (access) =>
            access.centerId &&
            access.centerId
              .isCenterAvailable ===
              true
        );




      // ======================================================
      // 9. UNIQUE CENTER MAP
      // ======================================================

      const centerMap =
        new Map();


      activeAccess.forEach(
        (access) => {
          const center =
            access.centerId;


          const centerId =
            center?._id
              ? String(
                  center._id
                )
              : null;


          if (!centerId) {
            return;
          }


          if (
            centerMap.has(
              centerId
            )
          ) {
            return;
          }


          centerMap.set(
            centerId,
            {
              centerId,

              centerName:
                center.centerName ||
                "",

              centerCode:
                center.centerCode ||
                "",

              programId:
                String(
                  programId
                ),

              programName:
                program
                  .programName ||
                "",

              programCode:
                program
                  .programCode ||
                "",

              batchId:
                String(
                  batchId
                ),

              batchName:
                batch
                  .batchName ||
                "",

              startYear:
                batch
                  .startYear ||
                null,

              endYear:
                batch
                  .endYear ||
                null,

              districtId:
                access
                  .districtId?._id
                  ? String(
                      access
                        .districtId
                        ._id
                    )
                  : "",

              districtName:
                access
                  .districtId
                  ?.districtName ||
                "",

              blockId:
                access
                  .blockId?._id
                  ? String(
                      access
                        .blockId
                        ._id
                    )
                  : "",

              blockName:
                access
                  .blockId
                  ?.blockName ||
                "",
            }
          );
        }
      );


      const centers =
        Array.from(
          centerMap.values()
        );




      // ======================================================
      // 10. GET ALL MONITORING RECORDS
      //
      // NO markedBy FILTER.
      // ======================================================

      const monitoringQuery = {
        programId,
        batchId,

        centerId: {
          $in:
            centers.map(
              (center) =>
                center.centerId
            ),
        },

        date: {
          $gte:
            startDate,

          $lte:
            endDate,
        },
      };




      const monitoringRecords =
        await CenterMonitoring.find(
          monitoringQuery
        )
          .populate(
            "markedBy",
            "name email userId"
          )
          .sort({
            date: 1,
            createdAt: 1,
          })
          .lean();




      // ======================================================
      // 11. CREATE RECORD MAP
      //
      // centerId + calendar date
      //
      // Multiple users' records are preserved.
      // ======================================================

      const recordMap =
        new Map();


      monitoringRecords.forEach(
        (record) => {
          const dateKey =
            formatDateOnly(
              record.date
            );


          const key =
            `${String(
              record.centerId
            )}_${dateKey}`;


          if (
            !recordMap.has(
              key
            )
          ) {
            recordMap.set(
              key,
              []
            );
          }


          recordMap
            .get(key)
            .push(
              record
            );
        }
      );


      // ======================================================
      // 12. BUILD DATE ARRAY
      //
      // IMPORTANT:
      //
      // Uses calendar date strings.
      // No timezone conversion.
      // ======================================================

      const dates =
        getDateStrings(
          fromDate,
          toDate
        );


      // ======================================================
      // 13. BUILD FINAL REPORT
      // ======================================================

      const data = [];


      centers.forEach(
        (center) => {
          dates.forEach(
            (dateKey) => {
              const key =
                `${center.centerId}_${dateKey}`;


              const records =
                recordMap.get(
                  key
                ) || [];


              // ==================================================
              // NO MARKING
              // ==================================================

              if (
                records.length ===
                0
              ) {
                data.push({
                  _id:
                    `${center.centerId}_${dateKey}`,

                  programId:
                    center.programId,

                  programName:
                    center.programName,

                  programCode:
                    center.programCode,

                  batchId:
                    center.batchId,

                  batchName:
                    center.batchName,

                  startYear:
                    center.startYear,

                  endYear:
                    center.endYear,

                  userName:
                    "-",

                  userEmail:
                    "-",

                  districtId:
                    center.districtId,

                  districtName:
                    center.districtName,

                  blockId:
                    center.blockId,

                  blockName:
                    center.blockName,

                  centerId:
                    center.centerId,

                  centerName:
                    center.centerName,

                  centerCode:
                    center.centerCode,

                  discipline:
                    "Not marked",

                  remark:
                    "",

                  date:
                    dateKey,
                });

                return;
              }


              // ==================================================
              // MARKED
              //
              // Every user's record is preserved.
              // ==================================================

              records.forEach(
                (record) => {
                  data.push({
                    _id:
                      String(
                        record._id
                      ),

                    programId:
                      center.programId,

                    programName:
                      center.programName,

                    programCode:
                      center.programCode,

                    batchId:
                      center.batchId,

                    batchName:
                      center.batchName,

                    startYear:
                      center.startYear,

                    endYear:
                      center.endYear,

                    userName:
                      record
                        .markedBy
                        ?.name ||
                      "-",

                    userEmail:
                      record
                        .markedBy
                        ?.email ||
                      "-",

                    districtId:
                      center.districtId,

                    districtName:
                      center.districtName,

                    blockId:
                      center.blockId,

                    blockName:
                      center.blockName,

                    centerId:
                      center.centerId,

                    centerName:
                      center.centerName,

                    centerCode:
                      center.centerCode,

                    discipline:
                      record
                        .discipline ||
                      "-",

                    remark:
                      record.remark ||
                      "",

                    date:
                      dateKey,
                  });
                }
              );
            }
          );
        }
      );


      // ======================================================
      // 14. SORT REPORT
      //
      // District A-Z
      // Block A-Z
      // Center A-Z
      // Date ascending
      // ======================================================

      data.sort(
        (a, b) => {
          const districtCompare =
            String(
              a.districtName ||
                ""
            ).localeCompare(
              String(
                b.districtName ||
                  ""
              )
            );


          if (
            districtCompare !==
            0
          ) {
            return districtCompare;
          }


          const blockCompare =
            String(
              a.blockName ||
                ""
            ).localeCompare(
              String(
                b.blockName ||
                  ""
              )
            );


          if (
            blockCompare !==
            0
          ) {
            return blockCompare;
          }


          const centerCompare =
            String(
              a.centerName ||
                ""
            ).localeCompare(
              String(
                b.centerName ||
                  ""
              )
            );


          if (
            centerCompare !==
            0
          ) {
            return centerCompare;
          }


          return String(
            a.date ||
              ""
          ).localeCompare(
            String(
              b.date ||
                ""
              )
          );
        }
      );


      // ======================================================
      // 15. SUMMARY
      // ======================================================

      const markedRows =
        data.filter(
          (row) =>
            row.discipline !==
            "Not marked"
        ).length;


      const notMarkedRows =
        data.filter(
          (row) =>
            row.discipline ===
            "Not marked"
        ).length;


      const summary = {
        totalRows:
          data.length,

        markedRows,

        notMarkedRows,

        totalCenters:
          centers.length,

        totalDates:
          dates.length,
      };


      // ======================================================
      // 16. FINAL LOG
      // ======================================================














      // ======================================================
      // 17. RESPONSE
      // ======================================================

      return res.status(200).json({
        success: true,

        data: {
          reportMode:
            "full",

          filters: {
            programId,

            batchId,

            districtId:
              districtId ||
              null,

            fromDate,

            toDate,
          },

          summary,

          data,
        },
      });

    } catch (error) {
      console.error("");

      console.error(
        "===================================================="
      );

      console.error(
        "CENTER MONITORING FULL REPORT ERROR"
      );

      console.error(
        "===================================================="
      );

      console.error(
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error?.message ||
          "Failed to generate monitoring report.",

        error:
          error?.message,
      });
    }
  };


// ============================================================
// GET INDIVIDUAL CENTER MONITORING REPORT
//
// Route:
// GET /center-monitoring/individual-report
//
// ONLY LOGGED-IN USER'S REPORT.
//
// It uses:
//
// 1. userId
// 2. programId
// 3. batchId
// 4. user's active MonitoringRegionAccess
// 5. markedBy = logged-in user
//
// No role-based switching.
// ============================================================

export const getCenterMonitoringIndividualReport =
  async (
    req,
    res
  ) => {

    try {
      // ======================================================
      // 1. LOGGED-IN USER
      // ======================================================

      const userId =
        getUserId(req);


      if (
        !userId ||
        !isValidObjectId(
          userId
        )
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });
      }


      const {
        programId,
        batchId,
        fromDate,
        toDate,
      } = req.query;






      // ======================================================
      // 2. VALIDATE PROGRAM
      // ======================================================

      if (
        !programId ||
        !isValidObjectId(
          programId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid programId is required.",
        });
      }


      // ======================================================
      // 3. VALIDATE BATCH
      // ======================================================

      if (
        !batchId ||
        !isValidObjectId(
          batchId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid batchId is required.",
        });
      }


      // ======================================================
      // 4. VALIDATE DATES
      // ======================================================

      if (
        !fromDate ||
        !toDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "fromDate and toDate are required.",
        });
      }


      const startDate =
        getStartOfDay(
          fromDate
        );


      const endDate =
        getEndOfDay(
          toDate
        );


      if (
        Number.isNaN(
          startDate.getTime()
        ) ||
        Number.isNaN(
          endDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid date range.",
        });
      }


      if (
        startDate >
        endDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "fromDate cannot be greater than toDate.",
        });
      }


      // ======================================================
      // 5. GET PROGRAM
      // ======================================================

      const program =
        await Program.findOne({
          _id: programId,
          isActive: true,
        })
          .select(
            "programName programCode"
          )
          .lean();


      if (!program) {
        return res.status(404).json({
          success: false,
          message:
            "Program not found or inactive.",
        });
      }


      // ======================================================
      // 6. GET BATCH
      // ======================================================

      const batch =
        await Batch.findOne({
          _id: batchId,
          isActive: true,
        })
          .select(
            "batchName startYear endYear programId"
          )
          .lean();


      if (!batch) {
        return res.status(404).json({
          success: false,
          message:
            "Batch not found or inactive.",
        });
      }


      // ======================================================
      // 7. VERIFY BATCH -> PROGRAM
      // ======================================================

      if (
        String(
          batch.programId
        ) !==
        String(
          programId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Selected batch does not belong to selected program.",
        });
      }


      // ======================================================
      // 8. GET LOGGED-IN USER'S ACTIVE MONITORING ACCESS
      //
      // IMPORTANT:
      //
      // userId IS required here.
      //
      // Only this user's assigned centers are included.
      // ======================================================

      const monitoringAccess =
        await MonitoringRegionAccess.find({
          userId,
          programId,
          batchId,
          isActive: true,
        })
          .populate(
            "districtId",
            "districtName districtId"
          )
          .populate(
            "blockId",
            "blockName blockId"
          )
          .populate(
            "centerId",
            "centerName centerCode isCenterAvailable"
          )
          .lean();




      // ======================================================
      // 9. ONLY ACTIVE CENTERS
      // ======================================================

      const activeAccess =
        monitoringAccess.filter(
          (access) =>
            access.centerId &&
            access.centerId
              .isCenterAvailable ===
              true
        );


      // ======================================================
      // 10. UNIQUE CENTER MAP
      // ======================================================

      const centerMap =
        new Map();


      activeAccess.forEach(
        (access) => {
          const center =
            access.centerId;


          const centerId =
            center?._id
              ? String(
                  center._id
                )
              : null;


          if (!centerId) {
            return;
          }


          if (
            centerMap.has(
              centerId
            )
          ) {
            return;
          }


          centerMap.set(
            centerId,
            {
              centerId,

              centerName:
                center.centerName ||
                "",

              centerCode:
                center.centerCode ||
                "",

              programId:
                String(
                  programId
                ),

              programName:
                program
                  .programName ||
                "",

              programCode:
                program
                  .programCode ||
                "",

              batchId:
                String(
                  batchId
                ),

              batchName:
                batch
                  .batchName ||
                "",

              startYear:
                batch
                  .startYear ||
                null,

              endYear:
                batch
                  .endYear ||
                null,

              districtId:
                access
                  .districtId?._id
                  ? String(
                      access
                        .districtId
                        ._id
                    )
                  : "",

              districtName:
                access
                  .districtId
                  ?.districtName ||
                "",

              blockId:
                access
                  .blockId?._id
                  ? String(
                      access
                        .blockId
                        ._id
                    )
                  : "",

              blockName:
                access
                  .blockId
                  ?.blockName ||
                "",
            }
          );
        }
      );


      const centers =
        Array.from(
          centerMap.values()
        );




      // ======================================================
      // 11. GET ONLY LOGGED-IN USER'S RECORDS
      //
      // CRITICAL:
      //
      // markedBy = userId
      //
      // Other users' records will never appear.
      // ======================================================

      const monitoringQuery = {
        markedBy:
          userId,

        centerId: {
          $in:
            centers.map(
              (center) =>
                center.centerId
            ),
        },

        programId:
          programId,

        batchId:
          batchId,

        date: {
          $gte:
            startDate,

          $lte:
            endDate,
        },
      };




      const monitoringRecords =
        await CenterMonitoring.find(
          monitoringQuery
        )
          .sort({
            date: 1,
            createdAt: 1,
          })
          .lean();




      // ======================================================
      // 12. CREATE RECORD MAP
      //
      // program + batch + center + date
      // ======================================================

      const recordMap =
        new Map();


      monitoringRecords.forEach(
        (record) => {
          const dateKey =
            formatDateOnly(
              record.date
            );


          const key =
            `${String(
              record.programId
            )}_${String(
              record.batchId
            )}_${String(
              record.centerId
            )}_${dateKey}`;


          if (
            !recordMap.has(
              key
            )
          ) {
            recordMap.set(
              key,
              []
            );
          }


          recordMap
            .get(key)
            .push(
              record
            );
        }
      );


      // ======================================================
      // 13. CREATE DATE ARRAY
      // ======================================================

      const dates =
        getDateStrings(
          fromDate,
          toDate
        );


      // ======================================================
      // 14. BUILD FINAL REPORT
      // ======================================================

      const data = [];


      centers.forEach(
        (center) => {
          dates.forEach(
            (dateKey) => {
              const key =
                `${center.programId}_${center.batchId}_${center.centerId}_${dateKey}`;


              const records =
                recordMap.get(
                  key
                ) || [];


              // ==================================================
              // NOT MARKED
              // ==================================================

              if (
                records.length ===
                0
              ) {
                data.push({
                  _id:
                    `${center.centerId}_${dateKey}`,

                  programId:
                    center.programId,

                  programName:
                    center.programName,

                  programCode:
                    center.programCode,

                  batchId:
                    center.batchId,

                  batchName:
                    center.batchName,

                  startYear:
                    center.startYear,

                  endYear:
                    center.endYear,

                  userName:
                    req.user?.name ||
                    "-",

                  userEmail:
                    req.user?.email ||
                    "-",

                  districtId:
                    center.districtId,

                  districtName:
                    center.districtName,

                  blockId:
                    center.blockId,

                  blockName:
                    center.blockName,

                  centerId:
                    center.centerId,

                  centerName:
                    center.centerName,

                  centerCode:
                    center.centerCode,

                  discipline:
                    "Not marked",

                  remark:
                    "",

                  date:
                    dateKey,
                });

                return;
              }


              // ==================================================
              // MARKED
              // ==================================================

              records.forEach(
                (record) => {
                  data.push({
                    _id:
                      String(
                        record._id
                      ),

                    programId:
                      center.programId,

                    programName:
                      center.programName,

                    programCode:
                      center.programCode,

                    batchId:
                      center.batchId,

                    batchName:
                      center.batchName,

                    startYear:
                      center.startYear,

                    endYear:
                      center.endYear,

                    userName:
                      req.user?.name ||
                      "-",

                    userEmail:
                      req.user?.email ||
                      "-",

                    districtId:
                      center.districtId,

                    districtName:
                      center.districtName,

                    blockId:
                      center.blockId,

                    blockName:
                      center.blockName,

                    centerId:
                      center.centerId,

                    centerName:
                      center.centerName,

                    centerCode:
                      center.centerCode,

                    discipline:
                      record
                        .discipline ||
                      "-",

                    remark:
                      record.remark ||
                      "",

                    date:
                      dateKey,
                  });
                }
              );
            }
          );
        }
      );


      // ======================================================
      // 15. SORT
      // ======================================================

      data.sort(
        (a, b) => {
          const districtCompare =
            String(
              a.districtName ||
                ""
            ).localeCompare(
              String(
                b.districtName ||
                  ""
              )
            );


          if (
            districtCompare !==
            0
          ) {
            return districtCompare;
          }


          const blockCompare =
            String(
              a.blockName ||
                ""
            ).localeCompare(
              String(
                b.blockName ||
                  ""
              )
            );


          if (
            blockCompare !==
            0
          ) {
            return blockCompare;
          }


          const centerCompare =
            String(
              a.centerName ||
                ""
            ).localeCompare(
              String(
                b.centerName ||
                  ""
              )
            );


          if (
            centerCompare !==
            0
          ) {
            return centerCompare;
          }


          return String(
            a.date ||
              ""
          ).localeCompare(
            String(
              b.date ||
                ""
              )
          );
        }
      );


      // ======================================================
      // 16. SUMMARY
      // ======================================================

      const markedRows =
        data.filter(
          (row) =>
            row.discipline !==
            "Not marked"
        ).length;


      const notMarkedRows =
        data.filter(
          (row) =>
            row.discipline ===
            "Not marked"
        ).length;


      const summary = {
        totalRows:
          data.length,

        markedRows,

        notMarkedRows,

        totalCenters:
          centers.length,

        totalDates:
          dates.length,
      };


      // ======================================================
      // 17. FINAL LOG
      // ======================================================















      // ======================================================
      // 18. RESPONSE
      // ======================================================

      return res.status(200).json({
        success: true,

        data: {
          reportMode:
            "individual",

          filters: {
            programId,

            batchId,

            fromDate,

            toDate,
          },

          summary,

          data,
        },
      });

    } catch (error) {
      console.error(
        "getCenterMonitoringIndividualReport error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error?.message ||
          "Failed to generate individual monitoring report.",

        error:
          error?.message,
      });
    }
  };