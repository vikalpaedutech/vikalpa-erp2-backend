import { UserRole } from "../../models/user-management/userRole.models.js";
import { Role } from "../../models/permissions-management/role.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";
import { UserAttendance } from "../../models/user-management/userAttendance.models.js";

import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";

import {
  ATTENDANCE_ACCESS_HIERARCHY,
} from "../../utils/attendanceAccess.constants.js";

// ============================================================
// NORMALIZE ROLE CODE
// ============================================================

const normalizeRoleCode = (roleCode = "") => {
  return String(roleCode).trim().toLowerCase();
};

// ============================================================
// GET ALLOWED ATTENDANCE TARGET ROLE CODES
// ============================================================

export const getAllowedAttendanceTargetRoles = async (
  viewerId
) => {


  // ----------------------------------------------------------
  // GET VIEWER ROLE MAPPINGS
  // ----------------------------------------------------------

  const viewerRoles =
    await UserRole.find({
      userId: viewerId,
      isActive: true,
    })
      .populate({
        path: "roleId",
        select:
          "roleName roleCode isActive",
      })
      .lean();




  if (!viewerRoles.length) {

    return [];
  }

  // ----------------------------------------------------------
  // BUILD ALLOWED TARGET ROLE CODES
  // ----------------------------------------------------------

  const allowedRoles = new Set();

  for (
    const userRole of viewerRoles
  ) {


    if (!userRole.roleId) {

      continue;
    }

    if (
      !userRole.roleId.isActive
    ) {

      continue;
    }

    const viewerRoleCode =
      normalizeRoleCode(
        userRole.roleId.roleCode
      );


    const targetRoles =
      ATTENDANCE_ACCESS_HIERARCHY[
        viewerRoleCode
      ] || [];


    for (
      const targetRole of targetRoles
    ) {
      const normalizedTargetRole =
        normalizeRoleCode(
          targetRole
        );

      allowedRoles.add(
        normalizedTargetRole
      );
    }
  }

  const finalAllowedRoles = [
    ...allowedRoles,
  ];



  return finalAllowedRoles;
};

// ============================================================
// GET VIEWER REGION ACCESS
// ============================================================

export const getViewerRegionAccess = async (
  viewerId
) => {
  const viewerRegionAccess =
    await UserRegionAccess.find({
      userId: viewerId,
    }).lean();




  return viewerRegionAccess;
};

// ============================================================
// BUILD VIEWER REGION HIERARCHY
// ============================================================

const buildViewerRegionHierarchy = async (
  viewerRegionAccess
) => {

  const hasGlobalAccess =
    viewerRegionAccess.some(
      (access) =>
        access.scope === "global"
    );


  // ----------------------------------------------------------
  // GLOBAL ACCESS
  // ----------------------------------------------------------

  if (hasGlobalAccess) {

    return {
      hasGlobalAccess: true,

      districtIds: new Set(),

      blockIds: new Set(),

      centerIds: new Set(),
    };
  }

  // ----------------------------------------------------------
  // INITIAL SETS
  // ----------------------------------------------------------

  const districtIds = new Set();

  const blockIds = new Set();

  const centerIds = new Set();

  // ----------------------------------------------------------
  // DIRECT VIEWER ACCESS
  // ----------------------------------------------------------

  for (
    const access of viewerRegionAccess
  ) {


    if (
      access.scope === "district" &&
      access.districtId
    ) {
      districtIds.add(
        String(
          access.districtId
        )
      );
    }

    if (
      access.scope === "block" &&
      access.blockId
    ) {
      blockIds.add(
        String(
          access.blockId
        )
      );
    }

    if (
      access.scope === "center" &&
      access.centerId
    ) {
      centerIds.add(
        String(
          access.centerId
        )
      );
    }
  }




  // ==========================================================
  // DISTRICT → BLOCK
  // ==========================================================

  if (
    districtIds.size > 0
  ) {
    const districtBlocks =
      await Block.find({
        districtId: {
          $in: [
            ...districtIds,
          ],
        },
      })
        .select(
          "_id districtId blockId blockName"
        )
        .lean();



    for (
      const block of districtBlocks
    ) {
      blockIds.add(
        String(
          block._id
        )
      );
    }
  }

  // ==========================================================
  // DISTRICT / BLOCK → CENTER
  // ==========================================================

  const centerConditions = [];

  if (
    districtIds.size > 0
  ) {
    centerConditions.push({
      districtId: {
        $in: [
          ...districtIds,
        ],
      },
    });
  }

  if (
    blockIds.size > 0
  ) {
    centerConditions.push({
      blockId: {
        $in: [
          ...blockIds,
        ],
      },
    });
  }

  if (
    centerConditions.length > 0
  ) {
    const hierarchyCenters =
      await Center.find({
        $or: centerConditions,
      })
        .select(
          "_id districtId blockId centerCode centerName"
        )
        .lean();



    for (
      const center of hierarchyCenters
    ) {
      centerIds.add(
        String(
          center._id
        )
      );
    }
  }

  const result = {
    hasGlobalAccess: false,

    districtIds,

    blockIds,

    centerIds,
  };



  return result;
};

// ============================================================
// GET OBJECT ID STRING
// ============================================================

const getIdString = (value) => {
  if (!value) {
    return null;
  }

  // ----------------------------------------------------------
  // POPULATED OBJECT
  // Example:
  // {
  //   _id: ObjectId(...)
  //   districtName: "Ambala"
  // }
  // ----------------------------------------------------------

  if (
    typeof value === "object" &&
    value._id
  ) {
    return String(
      value._id
    );
  }

  // ----------------------------------------------------------
  // NORMAL OBJECT ID
  // ----------------------------------------------------------

  return String(
    value
  );
};

// ============================================================
// CHECK TARGET REGION ACCESS
// ============================================================

const isTargetRegionAccessible = (
  targetRegionAccess,
  viewerRegionHierarchy
) => {


  // ----------------------------------------------------------
  // TARGET IDS
  // ----------------------------------------------------------

  const targetDistrictId =
    getIdString(
      targetRegionAccess.districtId
    );

  const targetBlockId =
    getIdString(
      targetRegionAccess.blockId
    );

  const targetCenterId =
    getIdString(
      targetRegionAccess.centerId
    );




  // ----------------------------------------------------------
  // VIEWER HIERARCHY
  // ----------------------------------------------------------




  // ==========================================================
  // GLOBAL VIEWER
  // ==========================================================

  if (
    viewerRegionHierarchy.hasGlobalAccess
  ) {

    return true;
  }

  // ==========================================================
  // TARGET GLOBAL
  // ==========================================================

  if (
    targetRegionAccess.scope ===
    "global"
  ) {

    return false;
  }

  // ==========================================================
  // TARGET DISTRICT
  // ==========================================================

  if (
    targetRegionAccess.scope ===
    "district"
  ) {
    const districtMatch =
      targetDistrictId &&
      viewerRegionHierarchy.districtIds.has(
        targetDistrictId
      );



    return Boolean(
      districtMatch
    );
  }

  // ==========================================================
  // TARGET BLOCK
  // ==========================================================

  if (
    targetRegionAccess.scope ===
    "block"
  ) {
    const blockMatch =
      targetBlockId &&
      viewerRegionHierarchy.blockIds.has(
        targetBlockId
      );

    const districtMatch =
      targetDistrictId &&
      viewerRegionHierarchy.districtIds.has(
        targetDistrictId
      );



    const result =
      Boolean(
        blockMatch ||
        districtMatch
      );


    return result;
  }

  // ==========================================================
  // TARGET CENTER
  // ==========================================================

  if (
    targetRegionAccess.scope ===
    "center"
  ) {
    const centerMatch =
      targetCenterId &&
      viewerRegionHierarchy.centerIds.has(
        targetCenterId
      );

    const blockMatch =
      targetBlockId &&
      viewerRegionHierarchy.blockIds.has(
        targetBlockId
      );

    const districtMatch =
      targetDistrictId &&
      viewerRegionHierarchy.districtIds.has(
        targetDistrictId
      );




    const result =
      Boolean(
        centerMatch ||
        blockMatch ||
        districtMatch
      );


    return result;
  }

  // ==========================================================
  // UNKNOWN SCOPE
  // ==========================================================


  return false;
};

// ============================================================
// GET ACCESSIBLE ATTENDANCE USERS
// ============================================================

export const getAccessibleAttendanceUsers = async ({
  viewerId,
}) => {


  // ==========================================================
  // 1. GET TARGET ROLE CODES
  // ==========================================================

  const allowedTargetRoleCodes =
    await getAllowedAttendanceTargetRoles(
      viewerId
    );


  if (
    !allowedTargetRoleCodes.length
  ) {

    return [];
  }

  // ==========================================================
  // 2. GET VIEWER REGION ACCESS
  // ==========================================================

  const viewerRegionAccess =
    await getViewerRegionAccess(
      viewerId
    );

  if (
    !viewerRegionAccess.length
  ) {

    return [];
  }

  // ==========================================================
  // 3. BUILD REGION HIERARCHY
  // ==========================================================

  const viewerRegionHierarchy =
    await buildViewerRegionHierarchy(
      viewerRegionAccess
    );

  // ==========================================================
  // 4. GET ACTIVE ROLES
  // ==========================================================

  const targetRoles =
    await Role.find({
      isActive: true,
    })
      .select(
        "_id roleName roleCode isActive"
      )
      .lean();




  // ==========================================================
  // 5. MATCH TARGET ROLES BY ROLE CODE
  // ==========================================================

  const matchedTargetRoles =
    targetRoles.filter(
      (role) =>
        allowedTargetRoleCodes.includes(
          normalizeRoleCode(
            role.roleCode
          )
        )
    );




  if (
    !matchedTargetRoles.length
  ) {

    return [];
  }

  // ==========================================================
  // 6. TARGET ROLE IDS
  // ==========================================================

  const targetRoleIds =
    matchedTargetRoles.map(
      (role) => role._id
    );


  // ==========================================================
  // 7. GET USERS HAVING TARGET ROLES
  // ==========================================================

  const targetUserRoles =
    await UserRole.find({
      roleId: {
        $in: targetRoleIds,
      },

      isActive: true,
    })
      .select(
        "userId roleId isActive"
      )
      .lean();




  if (
    !targetUserRoles.length
  ) {

    return [];
  }

  // ==========================================================
  // 8. UNIQUE TARGET USER IDS
  // ==========================================================

  const targetUserIds = [
    ...new Set(
      targetUserRoles.map(
        (item) =>
          String(
            item.userId
          )
      )
    ),
  ];




  // ==========================================================
  // 9. TARGET USERS REGION ACCESS
  // ==========================================================

  const targetRegionAccess =
    await UserRegionAccess.find({
      userId: {
        $in: targetUserIds,
      },
    })
      .populate({
        path: "userId",
        select:
          "userId name email isActive",
      })
      .populate({
        path: "districtId",
        select:
          "districtId districtName",
      })
      .populate({
        path: "blockId",
        select:
          "blockId blockName",
      })
      .populate({
        path: "centerId",
        select:
          "centerCode centerName",
      })
      .lean();




  if (
    !targetRegionAccess.length
  ) {

    return [];
  }

  // ==========================================================
  // 10. BUILD UNIQUE ACCESSIBLE USERS
  // ==========================================================

  const usersMap = new Map();

  for (
    const regionAccess of targetRegionAccess
  ) {



    // --------------------------------------------------------
    // USER EXISTS
    // --------------------------------------------------------

    if (
      !regionAccess.userId
    ) {

      continue;
    }

    // --------------------------------------------------------
    // USER ACTIVE
    // --------------------------------------------------------

    if (
      !regionAccess.userId.isActive
    ) {

      continue;
    }

    // --------------------------------------------------------
    // REGION ACCESS CHECK
    // --------------------------------------------------------

    const regionAccessible =
      isTargetRegionAccessible(
        regionAccess,
        viewerRegionHierarchy
      );


    if (
      !regionAccessible
    ) {

      continue;
    }

    // --------------------------------------------------------
    // USER ID
    // --------------------------------------------------------

    const userId =
      String(
        regionAccess.userId._id
      );

    // --------------------------------------------------------
    // DUPLICATE CHECK
    // --------------------------------------------------------

    if (
      usersMap.has(userId)
    ) {

      continue;
    }

    // --------------------------------------------------------
    // FIND USER ROLE
    // --------------------------------------------------------

    const userRoles =
      targetUserRoles.filter(
        (item) =>
          String(
            item.userId
          ) === userId
      );


    const matchedRole =
      userRoles
        .map((item) =>
          matchedTargetRoles.find(
            (role) =>
              String(
                role._id
              ) ===
              String(
                item.roleId
              )
          )
        )
        .find(Boolean);


    // --------------------------------------------------------
    // BUILD ACCESSIBLE USER
    // --------------------------------------------------------

    const accessibleUser = {
      userId:
        regionAccess.userId._id,

      employeeId:
        regionAccess.userId.userId,

      name:
        regionAccess.userId.name,

      email:
        regionAccess.userId.email,

      role: matchedRole
        ? {
            _id:
              matchedRole._id,

            roleName:
              matchedRole.roleName,

            roleCode:
              matchedRole.roleCode,
          }
        : null,

      regionAccess: {
        scope:
          regionAccess.scope,

        district:
          regionAccess.districtId,

        block:
          regionAccess.blockId,

        center:
          regionAccess.centerId,
      },
    };

    usersMap.set(
      userId,
      accessibleUser
    );


  }

  // ==========================================================
  // FINAL ACCESSIBLE USERS
  // ==========================================================

  const finalUsers = [
    ...usersMap.values(),
  ];







  return finalUsers;
};

// ============================================================
// GET ACCESS BASED ATTENDANCE
// ============================================================

export const getAccessBasedAttendance = async ({
  viewerId,
  fromDate,
  toDate,
  attendanceType,
  status,
  attendanceSource,
}) => {



  // ==========================================================
  // GET ACCESSIBLE USERS
  // ==========================================================

  const accessibleUsers =
    await getAccessibleAttendanceUsers({
      viewerId,
    });


  if (
    !accessibleUsers.length
  ) {


    return {
      users: [],
      attendance: [],
    };
  }

  // ==========================================================
  // USER IDS
  // ==========================================================

  const userIds =
    accessibleUsers.map(
      (user) =>
        user.userId
    );


  // ==========================================================
  // BUILD ATTENDANCE FILTER
  // ==========================================================

  const filter = {
    userId: {
      $in: userIds,
    },
  };

  // ==========================================================
  // DATE FILTER
  // ==========================================================

  if (
    fromDate ||
    toDate
  ) {
    const dateFilter = {};

    if (fromDate) {
      const startDate =
        new Date(
          `${fromDate}T00:00:00.000Z`
        );

      if (
        isNaN(
          startDate.getTime()
        )
      ) {
        const error =
          new Error(
            "Invalid fromDate."
          );

        error.statusCode = 400;

        throw error;
      }

      dateFilter.$gte =
        startDate;
    }

    if (toDate) {
      const endDate =
        new Date(
          `${toDate}T23:59:59.999Z`
        );

      if (
        isNaN(
          endDate.getTime()
        )
      ) {
        const error =
          new Error(
            "Invalid toDate."
          );

        error.statusCode = 400;

        throw error;
      }

      dateFilter.$lte =
        endDate;
    }

    filter.date =
      dateFilter;
  }

  // ==========================================================
  // ATTENDANCE TYPE
  // ==========================================================

  if (
    attendanceType
  ) {
    filter.attendanceType =
      attendanceType;
  }

  // ==========================================================
  // STATUS
  // ==========================================================

  if (status) {
    filter.status =
      status;
  }

  // ==========================================================
  // ATTENDANCE SOURCE
  // ==========================================================

  if (
    attendanceSource
  ) {
    filter.attendanceSource =
      attendanceSource;
  }



  // ==========================================================
  // FETCH ATTENDANCE
  // ==========================================================

  const attendance =
    await UserAttendance.find(
      filter
    )
      .populate({
        path: "userId",
        select:
          "userId name email",
      })
      .populate({
        path: "markedBy",
        select:
          "name email",
      })
      .populate({
        path: "leaveId",
      })
      .sort({
        date: -1,
        createdAt: -1,
      })
      .lean();





  return {
    users:
      accessibleUsers,

    attendance,
  };
};