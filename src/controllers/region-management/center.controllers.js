import mongoose from "mongoose";

import { Center } from "../../models/region-management/center.models.js";
import { District } from "../../models/region-management/district.models.js";
import { Block } from "../../models/region-management/block.models.js";

import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";


/**
 * @desc    Create a new center
 * @route   POST /api/v1/region-management/centers
 * @access  Protected
 */
const createCenter = asyncHandler(async (req, res) => {
  const {
    districtId,
    blockId,
    centerCode,
    centerName,
    isCenterAvailable,
    availableClasses,
    availableBoard,
  } = req.body;

  if (!districtId || !blockId || !centerCode || !centerName) {
    throw new ApiError(
      400,
      "District ID, block ID, center code and center name are required"
    );
  }

  // Validate District ID
  if (!mongoose.Types.ObjectId.isValid(districtId)) {
    throw new ApiError(400, "Invalid district ID");
  }

  // Validate Block ID
  if (!mongoose.Types.ObjectId.isValid(blockId)) {
    throw new ApiError(400, "Invalid block ID");
  }

  // Check district exists
  const district = await District.findById(districtId);

  if (!district) {
    throw new ApiError(404, "District not found");
  }

  // Check block exists
  const block = await Block.findById(blockId);

  if (!block) {
    throw new ApiError(404, "Block not found");
  }

  // IMPORTANT:
  // Make sure block belongs to selected district
  if (block.districtId.toString() !== districtId.toString()) {
    throw new ApiError(
      400,
      "Selected block does not belong to the selected district"
    );
  }

  // Check duplicate center code
  const existingCenter = await Center.findOne({
    centerCode: centerCode.trim(),
  });

  if (existingCenter) {
    throw new ApiError(
      409,
      "Center with this code already exists"
    );
  }

  // Check duplicate center name within block
  const existingCenterName = await Center.findOne({
    blockId,
    centerName: centerName.trim(),
  });

  if (existingCenterName) {
    throw new ApiError(
      409,
      "Center with this name already exists in this block"
    );
  }

  const center = await Center.create({
    districtId,
    blockId,
    centerCode: centerCode.trim(),
    centerName: centerName.trim(),
    isCenterAvailable:
      isCenterAvailable !== undefined
        ? isCenterAvailable
        : true,
    availableClasses: availableClasses || [],
    availableBoard: availableBoard || [],
  });

  const createdCenter = await Center.findById(center._id)
    .populate("districtId", "districtId districtName")
    .populate("blockId", "blockId blockName");

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        createdCenter,
        "Center created successfully"
      )
    );
});


/**
 * @desc    Get all centers
 * @route   GET /api/v1/region-management/centers
 * @access  Protected
 *
 * Query:
 * ?page=1
 * ?limit=10
 * ?search=Center
 * ?districtId=xxxxx
 * ?blockId=xxxxx
 * ?isCenterAvailable=true
 */
const getAllCenters = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);

  const limit = Math.min(
    Math.max(Number(req.query.limit) || 10, 1),
    100
  );

  const skip = (page - 1) * limit;

  const {
    search,
    districtId,
    blockId,
    isCenterAvailable,
  } = req.query;

  const filter = {};

  // Filter by district
  if (districtId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(districtId)) {
      throw new ApiError(400, "Invalid district ID");
    }

    const district = await District.findById(districtId);

    if (!district) {
      throw new ApiError(404, "District not found");
    }

    filter.districtId = districtId;
  }

  // Filter by block
  if (blockId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(blockId)) {
      throw new ApiError(400, "Invalid block ID");
    }

    const block = await Block.findById(blockId);

    if (!block) {
      throw new ApiError(404, "Block not found");
    }

    filter.blockId = blockId;
  }

  // Filter by availability
  if (isCenterAvailable !== undefined) {
    if (isCenterAvailable === "true") {
      filter.isCenterAvailable = true;
    } else if (isCenterAvailable === "false") {
      filter.isCenterAvailable = false;
    }
  }

  // Search
  if (search?.trim()) {
    filter.$or = [
      {
        centerName: {
          $regex: search.trim(),
          $options: "i",
        },
      },
      {
        centerCode: {
          $regex: search.trim(),
          $options: "i",
        },
      },
    ];
  }

  const [centers, totalCenters] = await Promise.all([
    Center.find(filter)
      .populate("districtId", "districtId districtName")
      .populate("blockId", "blockId blockName")
      .sort({ centerName: 1 })
      .skip(skip)
      .limit(limit),

    Center.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalCenters / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        centers,
        pagination: {
          currentPage: page,
          totalPages,
          totalCenters,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Centers fetched successfully"
    )
  );
});


/**
 * @desc    Get center by ID
 * @route   GET /api/v1/region-management/centers/:centerId
 * @access  Protected
 */
const getCenterById = asyncHandler(async (req, res) => {
  const { centerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    throw new ApiError(400, "Invalid center ID");
  }

  const center = await Center.findById(centerId)
    .populate("districtId", "districtId districtName")
    .populate("blockId", "blockId blockName");

  if (!center) {
    throw new ApiError(404, "Center not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        center,
        "Center fetched successfully"
      )
    );
});


/**
 * @desc    Update center
 * @route   PATCH /api/v1/region-management/centers/:centerId
 * @access  Protected
 */
const updateCenter = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    throw new ApiError(400, "Invalid center ID");
  }

  const {
    districtId: newDistrictId,
    blockId: newBlockId,
    centerCode,
    centerName,
    isCenterAvailable,
    availableClasses,
    availableBoard,
  } = req.body;

  if (
    newDistrictId === undefined &&
    newBlockId === undefined &&
    centerCode === undefined &&
    centerName === undefined &&
    isCenterAvailable === undefined &&
    availableClasses === undefined &&
    availableBoard === undefined
  ) {
    throw new ApiError(
      400,
      "At least one field is required for update"
    );
  }

  const center = await Center.findById(centerId);

  if (!center) {
    throw new ApiError(404, "Center not found");
  }

  const finalDistrictId =
    newDistrictId !== undefined
      ? newDistrictId
      : center.districtId;

  const finalBlockId =
    newBlockId !== undefined
      ? newBlockId
      : center.blockId;

  // Validate district if being changed
  if (newDistrictId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(newDistrictId)) {
      throw new ApiError(400, "Invalid district ID");
    }

    const district = await District.findById(newDistrictId);

    if (!district) {
      throw new ApiError(404, "District not found");
    }
  }

  // Validate block if being changed
  if (newBlockId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(newBlockId)) {
      throw new ApiError(400, "Invalid block ID");
    }

    const block = await Block.findById(newBlockId);

    if (!block) {
      throw new ApiError(404, "Block not found");
    }
  }

  // Make sure final block belongs to final district
  const finalBlock = await Block.findById(finalBlockId);

  if (!finalBlock) {
    throw new ApiError(404, "Block not found");
  }

  if (
    finalBlock.districtId.toString() !==
    finalDistrictId.toString()
  ) {
    throw new ApiError(
      400,
      "Selected block does not belong to the selected district"
    );
  }

  // Check center code uniqueness
  if (centerCode !== undefined) {
    const normalizedCenterCode = centerCode.trim();

    const existingCenter = await Center.findOne({
      centerCode: normalizedCenterCode,
      _id: { $ne: centerId },
    });

    if (existingCenter) {
      throw new ApiError(
        409,
        "Center with this code already exists"
      );
    }

    center.centerCode = normalizedCenterCode;
  }

  // Check center name uniqueness within block
  if (
    centerName !== undefined ||
    newBlockId !== undefined
  ) {
    const finalCenterName =
      centerName !== undefined
        ? centerName.trim()
        : center.centerName;

    const existingCenter = await Center.findOne({
      blockId: finalBlockId,
      centerName: finalCenterName,
      _id: { $ne: centerId },
    });

    if (existingCenter) {
      throw new ApiError(
        409,
        "Center with this name already exists in this block"
      );
    }

    center.centerName = finalCenterName;
  }

  if (newDistrictId !== undefined) {
    center.districtId = newDistrictId;
  }

  if (newBlockId !== undefined) {
    center.blockId = newBlockId;
  }

  if (isCenterAvailable !== undefined) {
    center.isCenterAvailable = isCenterAvailable;
  }

  if (availableClasses !== undefined) {
    center.availableClasses = availableClasses;
  }

  if (availableBoard !== undefined) {
    center.availableBoard = availableBoard;
  }

  await center.save();

  const updatedCenter = await Center.findById(center._id)
    .populate("districtId", "districtId districtName")
    .populate("blockId", "blockId blockName");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedCenter,
        "Center updated successfully"
      )
    );
});


/**
 * @desc    Delete center
 * @route   DELETE /api/v1/region-management/centers/:centerId
 * @access  Protected
 */
const deleteCenter = asyncHandler(async (req, res) => {
  const { centerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    throw new ApiError(400, "Invalid center ID");
  }

  const center = await Center.findById(centerId);

  if (!center) {
    throw new ApiError(404, "Center not found");
  }

  await Center.findByIdAndDelete(centerId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Center deleted successfully"
      )
    );
});


/**
 * @desc    Search centers
 * @route   GET /api/v1/region-management/centers/search?q=xyz
 * @access  Protected
 *
 * Optional:
 * ?districtId=xxxxx
 * ?blockId=xxxxx
 */
const searchCenters = asyncHandler(async (req, res) => {
  const { q, districtId, blockId } = req.query;


  if (!q?.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const filter = {
    $or: [
      {
        centerName: {
          $regex: q.trim(),
          $options: "i",
        },
      },
      {
        centerCode: {
          $regex: q.trim(),
          $options: "i",
        },
      },
    ],
  };

  if (districtId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(districtId)) {
      throw new ApiError(400, "Invalid district ID");
    }

    const district = await District.findById(districtId);

    if (!district) {
      throw new ApiError(404, "District not found");
    }

    filter.districtId = districtId;
  }

  if (blockId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(blockId)) {
      throw new ApiError(400, "Invalid block ID");
    }

    const block = await Block.findById(blockId);

    if (!block) {
      throw new ApiError(404, "Block not found");
    }

    filter.blockId = blockId;
  }

  const centers = await Center.find(filter)
    .populate("districtId", "districtId districtName")
    .populate("blockId", "blockId blockName")
    .sort({
      centerName: 1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        centers,
        "Center search completed successfully"
      )
    );
});


/**
 * @desc    Get all centers in a specific district
 * @route   GET /api/v1/region-management/centers/district/:districtId
 * @access  Protected
 */
const getCentersByDistrict = asyncHandler(async (req, res) => {
  const { districtId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(districtId)) {
    throw new ApiError(400, "Invalid district ID");
  }

  const district = await District.findById(districtId);

  if (!district) {
    throw new ApiError(404, "District not found");
  }

  const centers = await Center.find({
    districtId,
  })
    .populate("districtId", "districtId districtName")
    .populate("blockId", "blockId blockName")
    .sort({
      centerName: 1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        centers,
        "District centers fetched successfully"
      )
    );
});


/**
 * @desc    Get all centers in a specific block
 * @route   GET /api/v1/region-management/centers/block/:blockId
 * @access  Protected
 */
const getCentersByBlock = asyncHandler(async (req, res) => {
  const { blockId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(blockId)) {
    throw new ApiError(400, "Invalid block ID");
  }

  const block = await Block.findById(blockId);

  if (!block) {
    throw new ApiError(404, "Block not found");
  }

  const centers = await Center.find({
    blockId,
  })
    .populate("districtId", "districtId districtName")
    .populate("blockId", "blockId blockName")
    .sort({
      centerName: 1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        centers,
        "Block centers fetched successfully"
      )
    );
});


/**
 * @desc    Get available centers
 * @route   GET /api/v1/region-management/centers/available
 * @access  Protected
 */
const getAvailableCenters = asyncHandler(async (req, res) => {
  const centers = await Center.find({
    isCenterAvailable: true,
  })
    .populate("districtId", "districtId districtName")
    .populate("blockId", "blockId blockName")
    .sort({
      centerName: 1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        centers,
        "Available centers fetched successfully"
      )
    );
});


export {
  createCenter,
  getAllCenters,
  getCenterById,
  updateCenter,
  deleteCenter,
  searchCenters,
  getCentersByDistrict,
  getCentersByBlock,
  getAvailableCenters,
};