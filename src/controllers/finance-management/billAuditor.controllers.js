import mongoose from "mongoose";

import { BillAuditor } from "../../models/finance-management/billAuditor.models.js";


// ============================================================
// Create Bill Auditor
// ============================================================

export const createBillAuditor = async (req, res) => {
  try {
    const {
      userId,
      roleAccess,
      action,
      regionScope,
      districtId,
      blockId,
      centerId,
    } = req.body;

    if (!userId || !roleAccess || !action || !regionScope) {
      return res.status(400).json({
        success: false,
        message:
          "userId, roleAccess, action and regionScope are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    const validRoles = ["CC", "ACI", "CM"];
    const validActions = ["verify", "approve"];
    const validScopes = ["global", "district", "block", "center"];

    if (!validRoles.includes(roleAccess)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roleAccess",
      });
    }

    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action",
      });
    }

    if (!validScopes.includes(regionScope)) {
      return res.status(400).json({
        success: false,
        message: "Invalid regionScope",
      });
    }

    // --------------------------------------------------------
    // Region validation
    // --------------------------------------------------------

    if (regionScope === "global") {
      if (districtId || blockId || centerId) {
        return res.status(400).json({
          success: false,
          message:
            "districtId, blockId and centerId must be empty for global scope",
        });
      }
    }

    if (regionScope === "district") {
      if (!districtId) {
        return res.status(400).json({
          success: false,
          message: "districtId is required for district scope",
        });
      }

      if (blockId || centerId) {
        return res.status(400).json({
          success: false,
          message:
            "blockId and centerId must be empty for district scope",
        });
      }
    }

    if (regionScope === "block") {
      if (!districtId || !blockId) {
        return res.status(400).json({
          success: false,
          message:
            "districtId and blockId are required for block scope",
        });
      }

      if (centerId) {
        return res.status(400).json({
          success: false,
          message: "centerId must be empty for block scope",
        });
      }
    }

    if (regionScope === "center") {
      if (!districtId || !blockId || !centerId) {
        return res.status(400).json({
          success: false,
          message:
            "districtId, blockId and centerId are required for center scope",
        });
      }
    }

    // --------------------------------------------------------
    // Duplicate check
    // --------------------------------------------------------

    const existingAuditor = await BillAuditor.findOne({
      userId,
      roleAccess,
      action,
      regionScope,
      districtId: districtId || null,
      blockId: blockId || null,
      centerId: centerId || null,
    });

    if (existingAuditor) {
      return res.status(409).json({
        success: false,
        message: "This bill auditor mapping already exists",
      });
    }

    // --------------------------------------------------------
    // Create mapping
    // --------------------------------------------------------

    const billAuditor = await BillAuditor.create({
      userId,
      roleAccess,
      action,
      regionScope,
      districtId: districtId || null,
      blockId: blockId || null,
      centerId: centerId || null,
    });

    return res.status(201).json({
      success: true,
      message: "Bill auditor mapping created successfully",
      data: billAuditor,
    });
  } catch (error) {
    console.error("createBillAuditor error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create bill auditor mapping",
      error: error.message,
    });
  }
};


// ============================================================
// Get All Bill Auditors
// ============================================================

export const getBillAuditors = async (req, res) => {
  try {
    const {
      userId,
      roleAccess,
      action,
      regionScope,
      districtId,
      blockId,
      centerId,
      isActive,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};

    if (userId) {
      filter.userId = userId;
    }

    if (roleAccess) {
      filter.roleAccess = roleAccess;
    }

    if (action) {
      filter.action = action;
    }

    if (regionScope) {
      filter.regionScope = regionScope;
    }

    if (districtId) {
      filter.districtId = districtId;
    }

    if (blockId) {
      filter.blockId = blockId;
    }

    if (centerId) {
      filter.centerId = centerId;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit), 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const [billAuditors, total] = await Promise.all([
      BillAuditor.find(filter)
        .populate("userId", "name email userId")
        .populate("districtId", "districtName districtId")
        .populate("blockId", "blockName blockId")
        .populate("centerId", "centerName centerCode")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber),

      BillAuditor.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "Bill auditor mappings fetched successfully",
      data: {
        billAuditors,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages: Math.ceil(total / limitNumber),
        },
      },
    });
  } catch (error) {
    console.error("getBillAuditors error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bill auditor mappings",
      error: error.message,
    });
  }
};


// ============================================================
// Get Bill Auditor By ID
// ============================================================

export const getBillAuditorById = async (req, res) => {
  try {
    const { billAuditorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(billAuditorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill auditor ID",
      });
    }

    const billAuditor = await BillAuditor.findById(billAuditorId)
      .populate("userId", "name email userId")
      .populate("districtId", "districtName districtId")
      .populate("blockId", "blockName blockId")
      .populate("centerId", "centerName centerCode");

    if (!billAuditor) {
      return res.status(404).json({
        success: false,
        message: "Bill auditor mapping not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bill auditor mapping fetched successfully",
      data: billAuditor,
    });
  } catch (error) {
    console.error("getBillAuditorById error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bill auditor mapping",
      error: error.message,
    });
  }
};


// ============================================================
// Update Bill Auditor
// ============================================================

export const updateBillAuditor = async (req, res) => {
  try {
    const { billAuditorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(billAuditorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill auditor ID",
      });
    }

    const existingAuditor = await BillAuditor.findById(
      billAuditorId
    );

    if (!existingAuditor) {
      return res.status(404).json({
        success: false,
        message: "Bill auditor mapping not found",
      });
    }

    const {
      userId,
      roleAccess,
      action,
      regionScope,
      districtId,
      blockId,
      centerId,
      isActive,
    } = req.body;

    if (userId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId",
        });
      }

      existingAuditor.userId = userId;
    }

    if (roleAccess !== undefined) {
      if (!["CC", "ACI", "CM"].includes(roleAccess)) {
        return res.status(400).json({
          success: false,
          message: "Invalid roleAccess",
        });
      }

      existingAuditor.roleAccess = roleAccess;
    }

    if (action !== undefined) {
      if (!["verify", "approve"].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Invalid action",
        });
      }

      existingAuditor.action = action;
    }

    if (regionScope !== undefined) {
      if (
        !["global", "district", "block", "center"].includes(
          regionScope
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid regionScope",
        });
      }

      existingAuditor.regionScope = regionScope;
    }

    if (districtId !== undefined) {
      existingAuditor.districtId = districtId || null;
    }

    if (blockId !== undefined) {
      existingAuditor.blockId = blockId || null;
    }

    if (centerId !== undefined) {
      existingAuditor.centerId = centerId || null;
    }

    if (isActive !== undefined) {
      existingAuditor.isActive = isActive;
    }

    // --------------------------------------------------------
    // Validate final region configuration
    // --------------------------------------------------------

    if (existingAuditor.regionScope === "global") {
      if (
        existingAuditor.districtId ||
        existingAuditor.blockId ||
        existingAuditor.centerId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Global scope cannot have districtId, blockId or centerId",
        });
      }
    }

    if (existingAuditor.regionScope === "district") {
      if (
        !existingAuditor.districtId ||
        existingAuditor.blockId ||
        existingAuditor.centerId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "District scope requires districtId and cannot have blockId or centerId",
        });
      }
    }

    if (existingAuditor.regionScope === "block") {
      if (
        !existingAuditor.districtId ||
        !existingAuditor.blockId ||
        existingAuditor.centerId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Block scope requires districtId and blockId and cannot have centerId",
        });
      }
    }

    if (existingAuditor.regionScope === "center") {
      if (
        !existingAuditor.districtId ||
        !existingAuditor.blockId ||
        !existingAuditor.centerId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Center scope requires districtId, blockId and centerId",
        });
      }
    }

    await existingAuditor.save();

    return res.status(200).json({
      success: true,
      message: "Bill auditor mapping updated successfully",
      data: existingAuditor,
    });
  } catch (error) {
    console.error("updateBillAuditor error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update bill auditor mapping",
      error: error.message,
    });
  }
};


// ============================================================
// Delete Bill Auditor
// ============================================================

export const deleteBillAuditor = async (req, res) => {
  try {
    const { billAuditorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(billAuditorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill auditor ID",
      });
    }

    const billAuditor = await BillAuditor.findByIdAndDelete(
      billAuditorId
    );

    if (!billAuditor) {
      return res.status(404).json({
        success: false,
        message: "Bill auditor mapping not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bill auditor mapping deleted successfully",
      data: billAuditor,
    });
  } catch (error) {
    console.error("deleteBillAuditor error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete bill auditor mapping",
      error: error.message,
    });
  }
};