import mongoose from "mongoose";
import XLSX from "xlsx";

import {
  ClassInteraction,
} from "../../models/academic-management/classInteraction.models.js";

import {
  Center,
} from "../../models/region-management/center.models.js";

import {
  District,
} from "../../models/region-management/district.models.js";

import {
  Block,
} from "../../models/region-management/block.models.js";

import {
  UserRegionAccess,
} from "../../models/user-management/userRegionAccess.models.js";

import {
  UserRole,
} from "../../models/user-management/userRole.models.js";

import {
  UserAccess,
} from "../../models/user-management/userAccess.models.js";

import {
  Batch,
} from "../../models/program-management/batch.models.js";

import {
  User,
} from "../../models/user.models.js";

import {
  CLASS_INTERACTION_FULL_REPORT_ROLES,
  CLASS_INTERACTION_INDIVIDUAL_REPORT_ROLES,
} from "../../utils/constants.js";


/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const RECORD_TYPES = [
  "Disciplinary",
  "Interaction",
];

const STATUSES = [
  "Indiscipline",
  "Not Attentive",
  "Teacher-Student",
  "Student-Doubt",
];


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const isValidObjectId = (
  value
) => {

  return mongoose.Types.ObjectId.isValid(
    value
  );

};


const getUserId = (req) => {

  return (
    req.user?._id ||
    req.user?.id
  );

};


/*
|--------------------------------------------------------------------------
| NORMALIZE DATE
|--------------------------------------------------------------------------
*/

const normalizeDate = (
  value
) => {

  if (!value) {
    return null;
  }


  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {

    const [
      year,
      month,
      day,
    ] = value
      .split("-")
      .map(Number);

    return new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }


  date.setUTCHours(
    0,
    0,
    0,
    0
  );


  return date;

};


/*
|--------------------------------------------------------------------------
| NEXT DATE
|--------------------------------------------------------------------------
*/

const getNextDate = (
  date
) => {

  const nextDate =
    new Date(date);

  nextDate.setUTCDate(
    nextDate.getUTCDate() + 1
  );

  return nextDate;

};


/*
|--------------------------------------------------------------------------
| DATE FILTER
|--------------------------------------------------------------------------
*/

const buildDateFilter = (
  date,
  startDate,
  endDate
) => {

  /*
  |--------------------------------------------------------------------------
  | EXACT DATE
  |--------------------------------------------------------------------------
  */

  if (date) {

    const normalizedDate =
      normalizeDate(
        date
      );


    if (!normalizedDate) {

      return {
        error:
          "Invalid date.",
      };

    }


    return {
      filter: {
        $gte:
          normalizedDate,

        $lt:
          getNextDate(
            normalizedDate
          ),
      },
    };

  }


  /*
  |--------------------------------------------------------------------------
  | DATE RANGE
  |--------------------------------------------------------------------------
  */

  const filter = {};


  if (startDate) {

    const normalizedStart =
      normalizeDate(
        startDate
      );


    if (!normalizedStart) {

      return {
        error:
          "Invalid startDate.",
      };

    }


    filter.$gte =
      normalizedStart;

  }


  if (endDate) {

    const normalizedEnd =
      normalizeDate(
        endDate
      );


    if (!normalizedEnd) {

      return {
        error:
          "Invalid endDate.",
      };

    }


    filter.$lt =
      getNextDate(
        normalizedEnd
      );

  }


  return {
    filter:
      Object.keys(filter).length
        ? filter
        : undefined,
  };

};


/*
|--------------------------------------------------------------------------
| PROGRAM + BATCH ACCESS
|--------------------------------------------------------------------------
*/

const validateProgramBatchAccess =
  async (
    userId,
    programId,
    batchId
  ) => {

    if (
      !isValidObjectId(
        programId
      )
    ) {

      return {
        success: false,
        message:
          "Invalid programId.",
      };

    }


    if (
      !isValidObjectId(
        batchId
      )
    ) {

      return {
        success: false,
        message:
          "Invalid batchId.",
      };

    }


    const userAccess =
      await UserAccess.findOne({
        userId,
      })
        .populate(
          "programIds",
          "_id programName programCode"
        )
        .populate(
          "batchIds",
          "_id batchName startYear endYear programId"
        )
        .lean();


    if (!userAccess) {

      return {
        success: false,
        message:
          "No program or batch access found for this user.",
      };

    }


    const hasProgramAccess =
      (
        userAccess.programIds || []
      ).some(
        (program) =>
          program?._id?.toString() ===
          programId.toString()
      );


    if (!hasProgramAccess) {

      return {
        success: false,
        message:
          "You do not have access to this program.",
      };

    }


    const selectedBatch =
      (
        userAccess.batchIds || []
      ).find(
        (batch) =>
          batch?._id?.toString() ===
          batchId.toString()
      );


    if (!selectedBatch) {

      return {
        success: false,
        message:
          "You do not have access to this batch.",
      };

    }


    if (
      selectedBatch.programId &&
      selectedBatch.programId.toString() !==
        programId.toString()
    ) {

      return {
        success: false,
        message:
          "Selected batch does not belong to selected program.",
      };

    }


    return {
      success: true,
      batch:
        selectedBatch,
    };

  };


/*
|--------------------------------------------------------------------------
| GET ACCESSIBLE CENTER IDS
|--------------------------------------------------------------------------
*/

const getAccessibleCenterIds =
  async (
    userId
  ) => {

    const accessRecords =
      await UserRegionAccess.find({
        userId,
      }).lean();


    if (!accessRecords.length) {
      return [];
    }


    const hasGlobalAccess =
      accessRecords.some(
        (access) =>
          access.scope ===
          "global"
      );


    if (hasGlobalAccess) {

      const centers =
        await Center.find({
          isCenterAvailable:
            true,
        })
          .select("_id")
          .lean();


      return centers.map(
        (center) =>
          center._id
      );

    }


    const regionConditions = [];


    for (
      const access
      of accessRecords
    ) {

      if (
        access.scope ===
          "district" &&
        access.districtId
      ) {

        regionConditions.push({
          districtId:
            access.districtId,
        });

      }


      if (
        access.scope ===
          "block" &&
        access.blockId
      ) {

        regionConditions.push({
          blockId:
            access.blockId,
        });

      }


      if (
        access.scope ===
          "center" &&
        access.centerId
      ) {

        regionConditions.push({
          _id:
            access.centerId,
        });

      }

    }


    if (
      !regionConditions.length
    ) {
      return [];
    }


    const centers =
      await Center.find({

        isCenterAvailable:
          true,

        $or:
          regionConditions,

      })
        .select("_id")
        .lean();


    return centers.map(
      (center) =>
        center._id
    );

  };


/*
|--------------------------------------------------------------------------
| GET AUTHORIZED CENTER
|--------------------------------------------------------------------------
*/

const getAuthorizedCenter =
  async (
    userId,
    centerId
  ) => {

    if (
      !isValidObjectId(
        centerId
      )
    ) {
      return null;
    }


    const accessibleCenterIds =
      await getAccessibleCenterIds(
        userId
      );


    const hasAccess =
      accessibleCenterIds.some(
        (id) =>
          id.toString() ===
          centerId.toString()
      );


    if (!hasAccess) {
      return null;
    }


    const center =
      await Center.findOne({

        _id:
          centerId,

        isCenterAvailable:
          true,

      })
        .populate(
          "districtId",
          "_id districtName districtId"
        )
        .populate(
          "blockId",
          "_id blockName blockId"
        );


    return center;

  };


/*
|--------------------------------------------------------------------------
| GET USER REPORT MODE
|--------------------------------------------------------------------------
|
| FULL:
| admin
|
| INDIVIDUAL:
| cm / cc / aci
|
*/

const getUserReportMode =
  async (
    userId
  ) => {

    const userRoles =
      await UserRole.find({

        userId,

        isActive:
          true,

      })
        .populate(
          "roleId",
          "roleName roleCode"
        )
        .lean();


    const roleCodes =
      userRoles
        .map(
          (item) =>
            item?.roleId?.roleCode
        )
        .filter(Boolean)
        .map(
          (roleCode) =>
            roleCode.toLowerCase()
        );


    const roleNames =
      userRoles
        .map(
          (item) =>
            item?.roleId?.roleName
        )
        .filter(Boolean);


    const hasFullReportAccess =
      roleCodes.some(
        (roleCode) =>
          CLASS_INTERACTION_FULL_REPORT_ROLES
            .map((role) =>
              role.toLowerCase()
            )
            .includes(
              roleCode
            )
      );


    if (
      hasFullReportAccess
    ) {

      return {
        mode:
          "full",

        roleCodes,

        roleNames,
      };

    }


    const hasIndividualReportAccess =
      roleCodes.some(
        (roleCode) =>
          CLASS_INTERACTION_INDIVIDUAL_REPORT_ROLES
            .map((role) =>
              role.toLowerCase()
            )
            .includes(
              roleCode
            )
      );


    if (
      hasIndividualReportAccess
    ) {

      return {
        mode:
          "individual",

        roleCodes,

        roleNames,
      };

    }


    return {
      mode:
        null,

      roleCodes,

      roleNames,
    };

  };


/*
|--------------------------------------------------------------------------
| BUILD REPORT FILTER
|--------------------------------------------------------------------------
*/

const buildReportFilter =
  async ({
    userId,
    mode,
    programId,
    batchId,
    date,
    startDate,
    endDate,
    subject,
    recordType,
    status,
    search,
  }) => {

    const filter = {};


    /*
    |--------------------------------------------------------------------------
    | INDIVIDUAL USER
    |--------------------------------------------------------------------------
    */

    if (
      mode ===
      "individual"
    ) {

      filter.recordedBy =
        userId;

    }


    /*
    |--------------------------------------------------------------------------
    | PROGRAM
    |--------------------------------------------------------------------------
    */

    if (programId) {

      if (
        !isValidObjectId(
          programId
        )
      ) {

        return {
          error:
            "Invalid programId.",
        };

      }


      if (
        mode ===
        "individual"
      ) {

        if (!batchId) {

          return {
            error:
              "Batch is required when program is selected.",
          };

        }

      }


      filter.programId =
        new mongoose.Types.ObjectId(
          programId
        );

    }


    /*
    |--------------------------------------------------------------------------
    | BATCH
    |--------------------------------------------------------------------------
    */

    if (batchId) {

      if (
        !isValidObjectId(
          batchId
        )
      ) {

        return {
          error:
            "Invalid batchId.",
        };

      }


      filter.batchId =
        new mongoose.Types.ObjectId(
          batchId
        );

    }


    /*
    |--------------------------------------------------------------------------
    | PROGRAM + BATCH ACCESS FOR INDIVIDUAL
    |--------------------------------------------------------------------------
    */

    if (
      mode ===
        "individual" &&
      programId &&
      batchId
    ) {

      const accessResult =
        await validateProgramBatchAccess(
          userId,
          programId,
          batchId
        );


      if (
        !accessResult.success
      ) {

        return {
          error:
            accessResult.message,

          forbidden:
            true,
        };

      }

    }


    /*
    |--------------------------------------------------------------------------
    | DATE
    |--------------------------------------------------------------------------
    */

    const dateResult =
      buildDateFilter(
        date,
        startDate,
        endDate
      );


    if (
      dateResult.error
    ) {

      return {
        error:
          dateResult.error,
      };

    }


    if (
      dateResult.filter
    ) {

      filter.date =
        dateResult.filter;

    }


    /*
    |--------------------------------------------------------------------------
    | SUBJECT
    |--------------------------------------------------------------------------
    */

    if (subject) {

      filter.subject =
        subject.trim();

    }


    /*
    |--------------------------------------------------------------------------
    | RECORD TYPE
    |--------------------------------------------------------------------------
    */

    if (recordType) {

      if (
        !RECORD_TYPES.includes(
          recordType
        )
      ) {

        return {
          error:
            "Invalid recordType.",
        };

      }


      filter.recordType =
        recordType;

    }


    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    if (status) {

      if (
        !STATUSES.includes(
          status
        )
      ) {

        return {
          error:
            "Invalid status.",
        };

      }


      filter.status =
        status;

    }


    /*
    |--------------------------------------------------------------------------
    | REGEX SEARCH
    |--------------------------------------------------------------------------
    |
    | Searches:
    | District
    | Block
    | Center
    | Center Code
    |
    */

    if (search?.trim()) {

      let regex;

      try {

        regex =
          new RegExp(
            search.trim(),
            "i"
          );

      } catch {

        return {
          error:
            "Invalid regex search.",
        };

      }


      const [
        matchingDistricts,
        matchingBlocks,
        matchingCenters,
      ] = await Promise.all([

        District.find({
          districtName:
            regex,
        })
          .select("_id")
          .lean(),

        Block.find({
          blockName:
            regex,
        })
          .select("_id")
          .lean(),

        Center.find({
          $or: [

            {
              centerName:
                regex,
            },

            {
              centerCode:
                regex,
            },

          ],
        })
          .select("_id")
          .lean(),

      ]);


      const districtIds =
        matchingDistricts.map(
          (item) =>
            item._id
        );


      const blockIds =
        matchingBlocks.map(
          (item) =>
            item._id
        );


      const centerIds =
        matchingCenters.map(
          (item) =>
            item._id
        );


      if (
        !districtIds.length &&
        !blockIds.length &&
        !centerIds.length
      ) {

        filter._id = {
          $in: [],
        };

      } else {

        filter.$or = [];


        if (
          districtIds.length
        ) {

          filter.$or.push({
            districtId: {
              $in:
                districtIds,
            },
          });

        }


        if (
          blockIds.length
        ) {

          filter.$or.push({
            blockId: {
              $in:
                blockIds,
            },
          });

        }


        if (
          centerIds.length
        ) {

          filter.$or.push({
            centerId: {
              $in:
                centerIds,
            },
          });

        }

      }

    }


    return {
      filter,
    };

  };


/*
|--------------------------------------------------------------------------
| FORMAT REPORT RECORDS
|--------------------------------------------------------------------------
*/

const formatReportRecords =
  async (
    records
  ) => {

    if (!records.length) {
      return [];
    }


    const userIds = [
      ...new Set(
        records
          .map(
            (record) =>
              record?.recordedBy?._id ||
              record?.recordedBy
          )
          .filter(Boolean)
          .map(
            (id) =>
              id.toString()
          )
      ),
    ];


    const userRoles =
      await UserRole.find({

        userId: {
          $in:
            userIds,
        },

        isActive:
          true,

      })
        .populate(
          "roleId",
          "roleName roleCode"
        )
        .lean();


    const rolesByUser =
      new Map();


    userRoles.forEach(
      (userRole) => {

        const userId =
          userRole?.userId?.toString();


        if (!userId) {
          return;
        }


        if (
          !rolesByUser.has(
            userId
          )
        ) {

          rolesByUser.set(
            userId,
            []
          );

        }


        if (
          userRole?.roleId?.roleName
        ) {

          rolesByUser
            .get(userId)
            .push(
              userRole.roleId
                .roleName
            );

        }

      }
    );


    return records.map(
      (record) => {

        const recordedById =
          record?.recordedBy?._id ||
          record?.recordedBy;


        const roles =
          rolesByUser.get(
            recordedById?.toString()
          ) || [];


        return {

          _id:
            record._id,

          date:
            record.date,

          userName:
            record?.recordedBy?.name ||
            "-",

          userEmail:
            record?.recordedBy?.email ||
            "-",

          role:
            roles.join(", ") ||
            "-",

          programName:
            record?.programId
              ?.programName ||
            "-",

          programCode:
            record?.programId
              ?.programCode ||
            "-",

          batchName:
            record?.batchId
              ?.batchName ||
            "-",

          batchStartYear:
            record?.batchId
              ?.startYear ||
            "",

          batchEndYear:
            record?.batchId
              ?.endYear ||
            "",

          districtName:
            record?.districtId
              ?.districtName ||
            "-",

          blockName:
            record?.blockId
              ?.blockName ||
            "-",

          centerName:
            record?.centerId
              ?.centerName ||
            "-",

          centerCode:
            record?.centerId
              ?.centerCode ||
            "-",

          subject:
            record.subject ||
            "-",

          recordType:
            record.recordType ||
            "-",

          status:
            record.status ||
            "-",

          remark:
            record.remark ||
            "",

        };

      }
    );

  };


/*
|--------------------------------------------------------------------------
| CREATE CLASS INTERACTION
|--------------------------------------------------------------------------
*/

export const createClassInteraction =
  async (
    req,
    res
  ) => {

    try {

      const userId =
        getUserId(req);


      if (!userId) {

        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });

      }


      const {
        programId,
        batchId,
        centerId,
        subject,
        recordType,
        status,
        remark,
        date,
      } = req.body;


      if (
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
        !subject ||
        typeof subject !==
          "string" ||
        !subject.trim()
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Subject is required.",
        });

      }


      if (
        !RECORD_TYPES.includes(
          recordType
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid recordType.",
        });

      }


      if (
        !STATUSES.includes(
          status
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid status.",
        });

      }


      const programBatchAccess =
        await validateProgramBatchAccess(
          userId,
          programId,
          batchId
        );


      if (
        !programBatchAccess.success
      ) {

        return res.status(403).json({
          success: false,
          message:
            programBatchAccess.message,
        });

      }


      const normalizedDate =
        normalizeDate(
          date
        ) ||
        normalizeDate(
          new Date()
        );


      const center =
        await getAuthorizedCenter(
          userId,
          centerId
        );


      if (!center) {

        return res.status(403).json({
          success: false,
          message:
            "You do not have access to this center or the center is unavailable.",
        });

      }


      const interaction =
        await ClassInteraction.create({

          programId:
            new mongoose.Types.ObjectId(
              programId
            ),

          batchId:
            new mongoose.Types.ObjectId(
              batchId
            ),

          districtId:
            center.districtId._id,

          blockId:
            center.blockId._id,

          centerId:
            center._id,

          subject:
            subject.trim(),

          recordType,

          status,

          recordedBy:
            userId,

          remark:
            remark?.trim() ||
            undefined,

          date:
            normalizedDate,

        });


      const populatedInteraction =
        await ClassInteraction.findById(
          interaction._id
        )
          .populate(
            "programId",
            "_id programName programCode"
          )
          .populate(
            "batchId",
            "_id batchName startYear endYear programId"
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
            "centerName centerCode"
          )
          .populate(
            "recordedBy",
            "name email"
          );


      return res.status(201).json({

        success: true,

        message:
          "Class interaction recorded successfully.",

        data:
          populatedInteraction,

      });

    } catch (error) {

      console.error(
        "createClassInteraction error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Failed to create class interaction.",

        error:
          error.message,

      });

    }

  };


/*
|--------------------------------------------------------------------------
| GET ACCESSIBLE CENTERS
|--------------------------------------------------------------------------
*/

export const getClassInteractionCenters =
  async (
    req,
    res
  ) => {

    try {

      const userId =
        getUserId(req);


      if (!userId) {

        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });

      }


      const centerIds =
        await getAccessibleCenterIds(
          userId
        );


      if (!centerIds.length) {

        return res.status(200).json({

          success: true,

          data: {
            centers: [],
          },

        });

      }


      const centers =
        await Center.find({

          _id: {
            $in:
              centerIds,
          },

          isCenterAvailable:
            true,

        })
          .populate(
            "districtId",
            "_id districtName districtId"
          )
          .populate(
            "blockId",
            "_id blockName blockId"
          )
          .sort({
            centerName: 1,
          })
          .lean();


      return res.status(200).json({

        success: true,

        data: {
          centers,
        },

      });

    } catch (error) {

      console.error(
        "getClassInteractionCenters error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Failed to fetch centers.",

        error:
          error.message,

      });

    }

  };


/*
|--------------------------------------------------------------------------
| GET CLASS INTERACTIONS
|--------------------------------------------------------------------------
*/

export const getClassInteractions =
  async (
    req,
    res
  ) => {

    try {

      const userId =
        getUserId(req);


      if (!userId) {

        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });

      }


      const {
        programId,
        batchId,
        date,
        startDate,
        endDate,
        districtId,
        blockId,
        centerId,
        subject,
        recordType,
        status,
        recordedBy,
        page = 1,
        limit = 50,
      } = req.query;


      if (
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


      const programBatchAccess =
        await validateProgramBatchAccess(
          userId,
          programId,
          batchId
        );


      if (
        !programBatchAccess.success
      ) {

        return res.status(403).json({
          success: false,
          message:
            programBatchAccess.message,
        });

      }


      const dateResult =
        buildDateFilter(
          date,
          startDate,
          endDate
        );


      if (
        dateResult.error
      ) {

        return res.status(400).json({
          success: false,
          message:
            dateResult.error,
        });

      }


      const accessibleCenterIds =
        await getAccessibleCenterIds(
          userId
        );


      if (
        !accessibleCenterIds.length
      ) {

        return res.status(200).json({

          success: true,

          data: {

            interactions: [],

            counts: {
              total: 0,
              byStatus: {},
              bySubject: {},
            },

            pagination: {
              page:
                Number(page),
              limit:
                Number(limit),
              total: 0,
              totalPages: 0,
            },

          },

        });

      }


      const filter = {

        programId:
          new mongoose.Types.ObjectId(
            programId
          ),

        batchId:
          new mongoose.Types.ObjectId(
            batchId
          ),

        centerId: {
          $in:
            accessibleCenterIds,
        },

      };


      if (
        dateResult.filter
      ) {

        filter.date =
          dateResult.filter;

      }


      if (districtId) {

        if (
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

        filter.districtId =
          districtId;

      }


      if (blockId) {

        if (
          !isValidObjectId(
            blockId
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid blockId.",
          });

        }

        filter.blockId =
          blockId;

      }


      if (centerId) {

        if (
          !isValidObjectId(
            centerId
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid centerId.",
          });

        }


        const accessible =
          accessibleCenterIds.some(
            (id) =>
              id.toString() ===
              centerId.toString()
          );


        if (!accessible) {

          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this center.",
          });

        }


        filter.centerId =
          new mongoose.Types.ObjectId(
            centerId
          );

      }


      if (subject) {

        filter.subject =
          subject.trim();

      }


      if (recordType) {

        if (
          !RECORD_TYPES.includes(
            recordType
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid recordType.",
          });

        }

        filter.recordType =
          recordType;

      }


      if (status) {

        if (
          !STATUSES.includes(
            status
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid status.",
          });

        }

        filter.status =
          status;

      }


      if (recordedBy) {

        if (
          !isValidObjectId(
            recordedBy
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid recordedBy.",
          });

        }

        filter.recordedBy =
          recordedBy;

      }


      const pageNumber =
        Math.max(
          Number(page),
          1
        );

      const limitNumber =
        Math.min(
          Math.max(
            Number(limit),
            1
          ),
          200
        );

      const skip =
        (
          pageNumber - 1
        ) *
        limitNumber;


      const [
        interactions,
        total,
      ] = await Promise.all([

        ClassInteraction.find(
          filter
        )
          .populate(
            "programId",
            "_id programName programCode"
          )
          .populate(
            "batchId",
            "_id batchName startYear endYear programId"
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
            "centerName centerCode"
          )
          .populate(
            "recordedBy",
            "name email"
          )
          .sort({
            date: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limitNumber)
          .lean(),

        ClassInteraction.countDocuments(
          filter
        ),

      ]);


      const statusCounts =
        await ClassInteraction.aggregate([

          {
            $match:
              filter,
          },

          {
            $group: {

              _id:
                "$status",

              count: {
                $sum: 1,
              },

            },
          },

        ]);


      const byStatus = {};


      statusCounts.forEach(
        (item) => {

          byStatus[
            item._id
          ] =
            item.count;

        }
      );


      const subjectCounts =
        await ClassInteraction.aggregate([

          {
            $match:
              filter,
          },

          {
            $group: {

              _id:
                "$subject",

              count: {
                $sum: 1,
              },

            },
          },

        ]);


      const bySubject = {};


      subjectCounts.forEach(
        (item) => {

          bySubject[
            item._id
          ] =
            item.count;

        }
      );


      return res.status(200).json({

        success: true,

        data: {

          interactions,

          counts: {

            total,

            byStatus,

            bySubject,

          },

          pagination: {

            page:
              pageNumber,

            limit:
              limitNumber,

            total,

            totalPages:
              Math.ceil(
                total /
                  limitNumber
              ),

          },

        },

      });

    } catch (error) {

      console.error(
        "getClassInteractions error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Failed to fetch class interactions.",

        error:
          error.message,

      });

    }

  };


/*
|--------------------------------------------------------------------------
| GET CLASS INTERACTION REPORT
|--------------------------------------------------------------------------
|
| Used by the VIEW REPORT page.
|
| admin:
|   full report
|
| cm / cc / aci:
|   own report only
|
*/

export const getClassInteractionReport =
  async (
    req,
    res
  ) => {

    try {

      const userId =
        getUserId(req);


      if (!userId) {

        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });

      }


      const reportAccess =
        await getUserReportMode(
          userId
        );


      if (
        !reportAccess.mode
      ) {

        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to access the class interaction report.",
        });

      }


      const {
        programId,
        batchId,
        startDate,
        endDate,
        subject,
        recordType,
        status,
        search,
      } = req.query;


      const filterResult =
        await buildReportFilter({

          userId,

          mode:
            reportAccess.mode,

          programId,

          batchId,

          startDate,

          endDate,

          subject,

          recordType,

          status,

          search,

        });


      if (
        filterResult.error
      ) {

        return res.status(
          filterResult.forbidden
            ? 403
            : 400
        ).json({

          success: false,

          message:
            filterResult.error,

        });

      }


      const records =
        await ClassInteraction.find(
          filterResult.filter
        )
          .populate(
            "programId",
            "_id programName programCode"
          )
          .populate(
            "batchId",
            "_id batchName startYear endYear programId"
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
            "centerName centerCode"
          )
          .populate(
            "recordedBy",
            "name email"
          )
          .sort({
            date: -1,
            createdAt: -1,
          })
          .lean();


      const reportRecords =
        await formatReportRecords(
          records
        );


      return res.status(200).json({

        success: true,

        data: {

          reportMode:
            reportAccess.mode,

          roles:
            reportAccess.roleNames,

          total:
            reportRecords.length,

          records:
            reportRecords,

        },

      });

    } catch (error) {

      console.error(
        "getClassInteractionReport error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Failed to fetch class interaction report.",

        error:
          error.message,

      });

    }

  };


/*
|--------------------------------------------------------------------------
| EXPORT CLASS INTERACTION REPORT
|--------------------------------------------------------------------------
|
| Same filters + SAME authorization as preview.
|
*/

export const exportClassInteractionReport =
  async (
    req,
    res
  ) => {

    try {

      const userId =
        getUserId(req);


      if (!userId) {

        return res.status(401).json({
          success: false,
          message:
            "Unauthorized user.",
        });

      }


      const reportAccess =
        await getUserReportMode(
          userId
        );


      if (
        !reportAccess.mode
      ) {

        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to export the class interaction report.",
        });

      }


      const {
        programId,
        batchId,
        startDate,
        endDate,
        subject,
        recordType,
        status,
        search,
      } = req.query;


      const filterResult =
        await buildReportFilter({

          userId,

          mode:
            reportAccess.mode,

          programId,

          batchId,

          startDate,

          endDate,

          subject,

          recordType,

          status,

          search,

        });


      if (
        filterResult.error
      ) {

        return res.status(
          filterResult.forbidden
            ? 403
            : 400
        ).json({

          success: false,

          message:
            filterResult.error,

        });

      }


      const records =
        await ClassInteraction.find(
          filterResult.filter
        )
          .populate(
            "programId",
            "_id programName programCode"
          )
          .populate(
            "batchId",
            "_id batchName startYear endYear programId"
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
            "centerName centerCode"
          )
          .populate(
            "recordedBy",
            "name email"
          )
          .sort({
            date: -1,
            createdAt: -1,
          })
          .lean();


      const reportRecords =
        await formatReportRecords(
          records
        );


      /*
      |--------------------------------------------------------------------------
      | REPORT DATA
      |--------------------------------------------------------------------------
      */

      const excelRows =
        reportRecords.map(
          (record) => ({

            Date:
              record.date
                ? new Date(
                    record.date
                  )
                : "",

            "User Name":
              record.userName,

            "User Email":
              record.userEmail,

            Role:
              record.role,

            Program:
              record.programName,

            Batch:
              record.batchName,

            District:
              record.districtName,

            Block:
              record.blockName,

            Center:
              record.centerName,

            "Center Code":
              record.centerCode,

            Subject:
              record.subject,

            "Record Type":
              record.recordType,

            Status:
              record.status,

            Remark:
              record.remark,

          })
        );


      /*
      |--------------------------------------------------------------------------
      | WORKBOOK
      |--------------------------------------------------------------------------
      */

      const workbook =
        XLSX.utils.book_new();


      /*
      |--------------------------------------------------------------------------
      | DATA SHEET
      |--------------------------------------------------------------------------
      */

      const dataSheet =
        XLSX.utils.json_to_sheet(
          excelRows
        );


      /*
      |--------------------------------------------------------------------------
      | COLUMN WIDTHS
      |--------------------------------------------------------------------------
      */

      dataSheet["!cols"] = [

        { wch: 15 }, // Date

        { wch: 25 }, // User Name

        { wch: 35 }, // User Email

        { wch: 25 }, // Role

        { wch: 25 }, // Program

        { wch: 20 }, // Batch

        { wch: 25 }, // District

        { wch: 25 }, // Block

        { wch: 30 }, // Center

        { wch: 20 }, // Center Code

        { wch: 25 }, // Subject

        { wch: 20 }, // Record Type

        { wch: 22 }, // Status

        { wch: 45 }, // Remark

      ];


      /*
      |--------------------------------------------------------------------------
      | APPEND DATA SHEET ONLY
      |--------------------------------------------------------------------------
      */

      XLSX.utils.book_append_sheet(
        workbook,
        dataSheet,
        "Class Interactions"
      );


      /*
      |--------------------------------------------------------------------------
      | XLSX BUFFER
      |--------------------------------------------------------------------------
      */

      const buffer =
        XLSX.write(
          workbook,
          {
            type:
              "buffer",

            bookType:
              "xlsx",
          }
        );


      /*
      |--------------------------------------------------------------------------
      | FILE NAME
      |--------------------------------------------------------------------------
      */

      const fileName =
        `class-interaction-report-${new Date()
          .toISOString()
          .slice(
            0,
            10
          )}.xlsx`;


      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );


      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );


      return res.send(
        buffer
      );

    } catch (error) {

      console.error(
        "exportClassInteractionReport error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Failed to export class interaction report.",

        error:
          error.message,

      });

    }

  };