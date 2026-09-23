import mongoose from "mongoose";

import { MonitoringRegionAccess } from "../../models/academic-management/monitoringRegionAccess.models.js";


import { User } from "../../models/user.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { Role } from "../../models/permissions-management/role.models.js";

import { Program } from "../../models/program-management/prgroam.models.js";
import { Batch } from "../../models/program-management/batch.models.js";

import { District } from "../../models/region-management/district.models.js";
import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";


// ============================================================
// Helpers
// ============================================================

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id;
};


// ============================================================
// GET ROLES
// ============================================================

export const getMonitoringRoles = async (req, res) => {
  try {
    const roles = await Role.find({
      isActive: true,
    })
      .select("_id roleName roleCode")
      .sort({ roleName: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Monitoring roles fetched successfully",
      data: roles,
    });
  } catch (error) {
    console.error("getMonitoringRoles error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch monitoring roles",
      error: error.message,
    });
  }
};


// ============================================================
// GET ACTIVE USERS BY ROLE
// ============================================================

export const getMonitoringUsersByRole = async (req, res) => {
  try {
    const { roleId, roleCode } = req.query;

    let finalRoleId = roleId;

    /*
     * If roleCode is supplied, find the Role first.
     */
    if (!finalRoleId && roleCode) {
      const role = await Role.findOne({
        roleCode,
        isActive: true,
      }).select("_id");

      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role not found",
        });
      }

      finalRoleId = role._id;
    }

    if (!finalRoleId || !isValidObjectId(finalRoleId)) {
      return res.status(400).json({
        success: false,
        message: "Valid roleId or roleCode is required",
      });
    }

    /*
     * First find users having this active role.
     */
    const userRoles = await UserRole.find({
      roleId: finalRoleId,
      isActive: true,
    })
      .populate({
        path: "userId",
        select: "_id name email contact isActive profileimage",
        match: {
          isActive: true,
        },
      })
      .populate({
        path: "roleId",
        select: "_id roleName roleCode",
      })
      .lean();

    const users = userRoles
      .filter((item) => item.userId)
      .map((item) => ({
        _id: item.userId._id,
        name: item.userId.name,
        email: item.userId.email,
        contact: item.userId.contact,
        profileimage: item.userId.profileimage,
        role: item.roleId,
      }));

    return res.status(200).json({
      success: true,
      message: "Monitoring users fetched successfully",
      data: users,
    });
  } catch (error) {
    console.error("getMonitoringUsersByRole error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch monitoring users",
      error: error.message,
    });
  }
};




// ============================================================
// GET CURRENT USER MONITORING ACCESS
// ============================================================

export const getMyMonitoringAccess = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId || !isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user could not be identified",
      });
    }

    const access = await MonitoringRegionAccess.find({
      userId,
      isActive: true,
    })
      .populate(
        "programId",
        "programName programCode"
      )
      .populate(
        "batchId",
        "batchName startYear endYear programId"
      )
      .populate(
        "districtId",
        "districtName"
      )
      .populate(
        "blockId",
        "blockName blockId"
      )
      .populate(
        "centerId",
        "centerCode centerName isCenterAvailable"
      )
      .lean();

    /*
     * --------------------------------------------------------
     * Only currently available centers should be usable
     * for monitoring.
     *
     * If a center was assigned earlier but later becomes
     * unavailable, it will not be returned.
     * --------------------------------------------------------
     */

    const activeAccess = access.filter(
      (item) =>
        item?.centerId?.isCenterAvailable === true
    );

    return res.status(200).json({
      success: true,
      message:
        "Current user monitoring access fetched successfully",
      data: activeAccess,
    });
  } catch (error) {
    console.error(
      "getMyMonitoringAccess error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch current user monitoring access",
      error: error.message,
    });
  }
};






// ============================================================
// GET USER MONITORING ACCESS
// ============================================================

export const getUserMonitoringAccess = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid userId is required",
      });
    }

    const access = await MonitoringRegionAccess.find({
      userId,
      isActive: true,
    })
      .populate("programId", "programName programCode")
      .populate("batchId", "batchName startYear endYear")
      .populate("districtId", "districtName")
      .populate("blockId", "blockName")
      .populate("centerId", "centerCode centerName isCenterAvailable")
      .populate("assignedBy", "name email")
      .sort({
        programId: 1,
        batchId: 1,
        districtId: 1,
        blockId: 1,
        centerId: 1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      message: "User monitoring access fetched successfully",
      data: access,
    });
  } catch (error) {
    console.error("getUserMonitoringAccess error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user monitoring access",
      error: error.message,
    });
  }
};


// ============================================================
// ASSIGN MONITORING CENTERS
// ============================================================

export const assignMonitoringCenters = async (
  req,
  res
) => {
  try {
    const {
      userId,
      programIds,
      batchIds,
      assignmentLevel,
      districtIds,
      blockIds,
      centerIds,
    } = req.body;

    // --------------------------------------------------------
    // Normalize arrays
    // --------------------------------------------------------

    const normalizedProgramIds = Array.isArray(
      programIds
    )
      ? programIds
      : programIds
      ? [programIds]
      : [];

    const normalizedBatchIds = Array.isArray(
      batchIds
    )
      ? batchIds
      : batchIds
      ? [batchIds]
      : [];

    const normalizedDistrictIds =
      Array.isArray(districtIds)
        ? districtIds
        : districtIds
        ? [districtIds]
        : [];

    const normalizedBlockIds =
      Array.isArray(blockIds)
        ? blockIds
        : blockIds
        ? [blockIds]
        : [];

    const normalizedCenterIds =
      Array.isArray(centerIds)
        ? centerIds
        : centerIds
        ? [centerIds]
        : [];

    // --------------------------------------------------------
    // Validation
    // --------------------------------------------------------

    if (
      !userId ||
      !isValidObjectId(userId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid userId is required",
      });
    }

    if (
      normalizedProgramIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one program is required",
      });
    }

    if (
      normalizedBatchIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one batch is required",
      });
    }

    if (
      !["district", "block", "center"].includes(
        assignmentLevel
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid assignmentLevel is required",
      });
    }

    // --------------------------------------------------------
    // Validate IDs
    // --------------------------------------------------------

    const allIds = [
      ...normalizedProgramIds,
      ...normalizedBatchIds,
      ...normalizedDistrictIds,
      ...normalizedBlockIds,
      ...normalizedCenterIds,
    ];

    if (
      allIds.some(
        (id) => !isValidObjectId(id)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "One or more provided IDs are invalid",
      });
    }

    // --------------------------------------------------------
    // Assignment location validation
    // --------------------------------------------------------

    if (
      assignmentLevel === "district" &&
      normalizedDistrictIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one district is required",
      });
    }

    if (
      assignmentLevel === "block" &&
      normalizedBlockIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one block is required",
      });
    }

    if (
      assignmentLevel === "center" &&
      normalizedCenterIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one center is required",
      });
    }

    // --------------------------------------------------------
    // Fetch batches
    // --------------------------------------------------------

    const batches = await Batch.find({
      _id: {
        $in: normalizedBatchIds,
      },
    }).lean();

    if (
      batches.length !==
      normalizedBatchIds.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "One or more selected batches were not found",
      });
    }

    // --------------------------------------------------------
    // Validate selected batches belong to
    // selected programs
    // --------------------------------------------------------

    const invalidBatch = batches.find(
      (batch) =>
        !normalizedProgramIds.some(
          (programId) =>
            String(batch.programId) ===
            String(programId)
        )
    );

    if (invalidBatch) {
      return res.status(400).json({
        success: false,
        message:
          "One or more selected batches do not belong to the selected programs",
      });
    }

    // --------------------------------------------------------
    // Resolve centers
    // --------------------------------------------------------

    const centerFilter = {
      isCenterAvailable: true,
    };

    if (
      assignmentLevel === "district"
    ) {
      centerFilter.districtId = {
        $in: normalizedDistrictIds,
      };
    }

    if (
      assignmentLevel === "block"
    ) {
      centerFilter.blockId = {
        $in: normalizedBlockIds,
      };
    }

    if (
      assignmentLevel === "center"
    ) {
      centerFilter._id = {
        $in: normalizedCenterIds,
      };
    }

    const centers = await Center.find(
      centerFilter
    ).lean();

    if (centers.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No active centers found for the selected assignment",
      });
    }

    // --------------------------------------------------------
    // Create access records
    //
    // Each:
    // Program + Batch + Center
    // becomes one access document.
    // --------------------------------------------------------

    const assignedBy =
      req.user?._id ||
      req.user?.id;

    if (!assignedBy) {
      return res.status(401).json({
        success: false,
        message:
          "Authenticated user could not be identified",
      });
    }

    const documents = [];

    for (const programId of normalizedProgramIds) {
      for (const batch of batches) {

        /*
         * Only create records where batch belongs
         * to the current program.
         */
        if (
          String(batch.programId) !==
          String(programId)
        ) {
          continue;
        }

        for (const center of centers) {
          documents.push({
            userId,
            assignedBy,
            programId,
            batchId: batch._id,
            districtId:
              center.districtId,
            blockId:
              center.blockId,
            centerId:
              center._id,
            isActive: true,
          });
        }
      }
    }

    if (documents.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No valid program-batch-center combinations found",
      });
    }

    // --------------------------------------------------------
    // Insert / reactivate
    // --------------------------------------------------------

    let createdCount = 0;
    let reactivatedCount = 0;

    for (const document of documents) {
      const existing =
        await MonitoringRegionAccess.findOne({
          userId: document.userId,
          programId:
            document.programId,
          batchId:
            document.batchId,
          centerId:
            document.centerId,
        });

      if (existing) {
        if (!existing.isActive) {
          existing.isActive = true;
          existing.assignedBy =
            document.assignedBy;

          existing.districtId =
            document.districtId;

          existing.blockId =
            document.blockId;

          await existing.save();

          reactivatedCount++;
        }

        continue;
      }

      await MonitoringRegionAccess.create(
        document
      );

      createdCount++;
    }

    return res.status(200).json({
      success: true,
      message:
        "Monitoring centers assigned successfully",
      data: {
        createdCount,
        reactivatedCount,
        totalCenters: centers.length,
      },
    });
  } catch (error) {
    console.error(
      "assignMonitoringCenters error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to assign monitoring centers",
      error: error.message,
    });
  }
};


// ============================================================
// REVOKE SINGLE MONITORING ACCESS
// ============================================================

export const revokeMonitoringAccess = async (req, res) => {
  try {
    const { accessId } = req.params;

    if (!accessId || !isValidObjectId(accessId)) {
      return res.status(400).json({
        success: false,
        message: "Valid accessId is required",
      });
    }

    const access = await MonitoringRegionAccess.findOneAndUpdate(
      {
        _id: accessId,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      },
      {
        new: true,
      }
    );

    if (!access) {
      return res.status(404).json({
        success: false,
        message: "Active monitoring access not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Monitoring access revoked successfully",
      data: access,
    });
  } catch (error) {
    console.error("revokeMonitoringAccess error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revoke monitoring access",
      error: error.message,
    });
  }
};


// ============================================================
// REVOKE ALL ACCESS FOR USER + PROGRAM + BATCH
// ============================================================

export const revokeUserMonitoringAccess = async (req, res) => {
  try {
    const {
      userId,
      programId,
      batchId,
    } = req.body;

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid userId is required",
      });
    }

    if (!programId || !isValidObjectId(programId)) {
      return res.status(400).json({
        success: false,
        message: "Valid programId is required",
      });
    }

    if (!batchId || !isValidObjectId(batchId)) {
      return res.status(400).json({
        success: false,
        message: "Valid batchId is required",
      });
    }

    const result = await MonitoringRegionAccess.updateMany(
      {
        userId,
        programId,
        batchId,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "User monitoring access revoked successfully",
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("revokeUserMonitoringAccess error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revoke user monitoring access",
      error: error.message,
    });
  }
};


// ============================================================
// GET AVAILABLE CENTERS FOR ASSIGNMENT
// ============================================================

export const getAvailableMonitoringCenters = async (req, res) => {
  try {
    const {
      districtId,
      blockId,
      search,
    } = req.query;

    const filter = {
      isCenterAvailable: true,
    };

    if (districtId) {
      if (!isValidObjectId(districtId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid districtId",
        });
      }

      filter.districtId = districtId;
    }

    if (blockId) {
      if (!isValidObjectId(blockId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid blockId",
        });
      }

      filter.blockId = blockId;
    }

    if (search?.trim()) {
      const regex = new RegExp(search.trim(), "i");

      filter.$or = [
        { centerName: regex },
        { centerCode: regex },
      ];
    }

    const centers = await Center.find(filter)
      .select(
        "_id districtId blockId centerCode centerName isCenterAvailable"
      )
      .populate("districtId", "districtName")
      .populate("blockId", "blockName")
      .sort({
        centerName: 1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Available monitoring centers fetched successfully",
      data: centers,
    });
  } catch (error) {
    console.error(
      "getAvailableMonitoringCenters error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch available monitoring centers",
      error: error.message,
    });
  }
};









// ============================================================
// REVOKE MONITORING ACCESS BY ASSIGNMENT LEVEL
// ============================================================

export const revokeMonitoringAccessByLevel = async (
  req,
  res
) => {
  try {
    const {
      userId,
      programId,
      batchId,
      assignmentLevel,
      districtId,
      blockId,
      centerId,
    } = req.body;

    // --------------------------------------------------------
    // Basic validation
    // --------------------------------------------------------

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid userId is required",
      });
    }

    if (!programId || !isValidObjectId(programId)) {
      return res.status(400).json({
        success: false,
        message: "Valid programId is required",
      });
    }

    if (!batchId || !isValidObjectId(batchId)) {
      return res.status(400).json({
        success: false,
        message: "Valid batchId is required",
      });
    }

    const validLevels = [
      "district",
      "block",
      "center",
    ];

    if (
      !assignmentLevel ||
      !validLevels.includes(assignmentLevel)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "assignmentLevel must be district, block or center",
      });
    }

    // --------------------------------------------------------
    // Base filter
    // --------------------------------------------------------

    const filter = {
      userId,
      programId,
      batchId,
      isActive: true,
    };

    // --------------------------------------------------------
    // District level
    // --------------------------------------------------------

    if (assignmentLevel === "district") {
      if (
        !districtId ||
        !isValidObjectId(districtId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid districtId is required",
        });
      }

      filter.districtId = districtId;
    }

    // --------------------------------------------------------
    // Block level
    // --------------------------------------------------------

    if (assignmentLevel === "block") {
      if (
        !blockId ||
        !isValidObjectId(blockId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid blockId is required",
        });
      }

      filter.blockId = blockId;
    }

    // --------------------------------------------------------
    // Center level
    // --------------------------------------------------------

    if (assignmentLevel === "center") {
      if (
        !centerId ||
        !isValidObjectId(centerId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid centerId is required",
        });
      }

      filter.centerId = centerId;
    }

    // --------------------------------------------------------
    // Revoke all matching active access
    // --------------------------------------------------------

    const result =
      await MonitoringRegionAccess.updateMany(
        filter,
        {
          $set: {
            isActive: false,
          },
        }
      );

    return res.status(200).json({
      success: true,
      message:
        "Monitoring access revoked successfully",
      data: {
        revokedCount: result.modifiedCount,
        assignmentLevel,
      },
    });
  } catch (error) {
    console.error(
      "revokeMonitoringAccessByLevel error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to revoke monitoring access",
      error: error.message,
    });
  }
};