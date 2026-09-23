import mongoose from "mongoose";

import { Block } from "../../models/region-management/block.models.js";
import { District } from "../../models/region-management/district.models.js";

import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";


/**
 * @desc    Create a new block
 * @route   POST /api/v1/region-management/blocks
 * @access  Protected
 */
const createBlock = asyncHandler(async (req, res) => {
  const { districtId, blockId, blockName } = req.body;

  if (!districtId || !blockName) {
    throw new ApiError(
      400,
      "District ID and block name are required"
    );
  }

  // Validate district MongoDB ObjectId
  if (!mongoose.Types.ObjectId.isValid(districtId)) {
    throw new ApiError(400, "Invalid district ID");
  }

  // Check whether district exists
  const district = await District.findById(districtId);

  if (!district) {
    throw new ApiError(404, "District not found");
  }

  // Check duplicate block name within the same district
  const existingBlock = await Block.findOne({
    districtId,
    blockName: blockName.trim(),
  });

  if (existingBlock) {
    throw new ApiError(
      409,
      "Block with this name already exists in this district"
    );
  }

  // Check duplicate block ID if provided
  if (blockId?.trim()) {
    const existingBlockId = await Block.findOne({
      blockId: blockId.trim(),
    });

    if (existingBlockId) {
      throw new ApiError(
        409,
        "Block with this ID already exists"
      );
    }
  }

  const block = await Block.create({
    districtId,
    blockId: blockId?.trim() || "",
    blockName: blockName.trim(),
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        block,
        "Block created successfully"
      )
    );
});


/**
 * @desc    Get all blocks
 * @route   GET /api/v1/region-management/blocks
 * @access  Protected
 *
 * Query:
 * ?page=1
 * ?limit=10
 * ?search=block
 * ?districtId=xxxxx
 */
const getAllBlocks = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);

  const limit = Math.min(
    Math.max(Number(req.query.limit) || 10, 1),
    100
  );

  const skip = (page - 1) * limit;

  const { search, districtId } = req.query;

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

  // Search by block name or block ID
  if (search?.trim()) {
    filter.$or = [
      {
        blockName: {
          $regex: search.trim(),
          $options: "i",
        },
      },
      {
        blockId: {
          $regex: search.trim(),
          $options: "i",
        },
      },
    ];
  }

  const [blocks, totalBlocks] = await Promise.all([
    Block.find(filter)
      .populate("districtId", "districtId districtName")
      .sort({ blockName: 1 })
      .skip(skip)
      .limit(limit),

    Block.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalBlocks / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        blocks,
        pagination: {
          currentPage: page,
          totalPages,
          totalBlocks,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Blocks fetched successfully"
    )
  );
});


/**
 * @desc    Get block by MongoDB ID
 * @route   GET /api/v1/region-management/blocks/:blockId
 * @access  Protected
 */
const getBlockById = asyncHandler(async (req, res) => {
  const { blockId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(blockId)) {
    throw new ApiError(400, "Invalid block ID");
  }

  const block = await Block.findById(blockId).populate(
    "districtId",
    "districtId districtName"
  );

  if (!block) {
    throw new ApiError(404, "Block not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        block,
        "Block fetched successfully"
      )
    );
});


/**
 * @desc    Update block
 * @route   PATCH /api/v1/region-management/blocks/:blockId
 * @access  Protected
 */
const updateBlock = asyncHandler(async (req, res) => {
  const { blockId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(blockId)) {
    throw new ApiError(400, "Invalid block ID");
  }

  const {
    districtId: newDistrictId,
    blockId: newBlockId,
    blockName,
  } = req.body;

  if (
    newDistrictId === undefined &&
    newBlockId === undefined &&
    blockName === undefined
  ) {
    throw new ApiError(
      400,
      "At least one field is required for update"
    );
  }

  const block = await Block.findById(blockId);

  if (!block) {
    throw new ApiError(404, "Block not found");
  }

  // Update district
  if (newDistrictId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(newDistrictId)) {
      throw new ApiError(400, "Invalid district ID");
    }

    const district = await District.findById(newDistrictId);

    if (!district) {
      throw new ApiError(404, "District not found");
    }

    block.districtId = newDistrictId;
  }

  // Update block name
  if (blockName !== undefined) {
    const finalDistrictId =
      newDistrictId !== undefined
        ? newDistrictId
        : block.districtId;

    const existingBlock = await Block.findOne({
      districtId: finalDistrictId,
      blockName: blockName.trim(),
      _id: { $ne: blockId },
    });

    if (existingBlock) {
      throw new ApiError(
        409,
        "Block with this name already exists in this district"
      );
    }

    block.blockName = blockName.trim();
  }

  // Update block ID
  if (newBlockId !== undefined) {
    const normalizedBlockId = newBlockId.trim();

    if (normalizedBlockId) {
      const existingBlockId = await Block.findOne({
        blockId: normalizedBlockId,
        _id: { $ne: blockId },
      });

      if (existingBlockId) {
        throw new ApiError(
          409,
          "Block with this ID already exists"
        );
      }
    }

    block.blockId = normalizedBlockId;
  }

  await block.save();

  const updatedBlock = await Block.findById(block._id).populate(
    "districtId",
    "districtId districtName"
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedBlock,
        "Block updated successfully"
      )
    );
});


/**
 * @desc    Delete block
 * @route   DELETE /api/v1/region-management/blocks/:blockId
 * @access  Protected
 */
const deleteBlock = asyncHandler(async (req, res) => {
  const { blockId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(blockId)) {
    throw new ApiError(400, "Invalid block ID");
  }

  const block = await Block.findById(blockId);

  if (!block) {
    throw new ApiError(404, "Block not found");
  }

  await Block.findByIdAndDelete(blockId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Block deleted successfully"
      )
    );
});


/**
 * @desc    Search blocks
 * @route   GET /api/v1/region-management/blocks/search?q=xyz
 * @access  Protected
 *
 * Optional:
 * ?districtId=xxxxx
 */
const searchBlocks = asyncHandler(async (req, res) => {
  const { q, districtId } = req.query;

  if (!q?.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const filter = {
    $or: [
      {
        blockName: {
          $regex: q.trim(),
          $options: "i",
        },
      },
      {
        blockId: {
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

  const blocks = await Block.find(filter)
    .populate("districtId", "districtId districtName")
    .sort({
      blockName: 1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        blocks,
        "Block search completed successfully"
      )
    );
});


/**
 * @desc    Get all blocks belonging to a specific district
 * @route   GET /api/v1/region-management/blocks/district/:districtId
 * @access  Protected
 */
const getBlocksByDistrict = asyncHandler(async (req, res) => {
  const { districtId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(districtId)) {
    throw new ApiError(400, "Invalid district ID");
  }

  const district = await District.findById(districtId);

  if (!district) {
    throw new ApiError(404, "District not found");
  }

  const blocks = await Block.find({
    districtId,
  })
    .populate("districtId", "districtId districtName")
    .sort({
      blockName: 1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        blocks,
        "District blocks fetched successfully"
      )
    );
});


export {
  createBlock,
  getAllBlocks,
  getBlockById,
  updateBlock,
  deleteBlock,
  searchBlocks,
  getBlocksByDistrict,
};