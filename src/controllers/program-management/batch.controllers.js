import mongoose from "mongoose";
import { Batch } from "../../models/program-management/batch.models.js";
import { Program } from "../../models/program-management/prgroam.models.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";

/**
 * @desc    Create a new batch
 * @route   POST /api/v1/batches
 * @access  Protected
 */
const createBatch = asyncHandler(async (req, res) => {
  const { programId, batchName, startYear, endYear } = req.body;

  if (
    !programId ||
    !batchName ||
    startYear === undefined ||
    endYear === undefined
  ) {
    throw new ApiError(
      400,
      "Program ID, batch name, start year and end year are required"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(programId)) {
    throw new ApiError(400, "Invalid program ID");
  }

  const program = await Program.findById(programId);

  if (!program) {
    throw new ApiError(404, "Program not found");
  }

  const normalizedBatchName = batchName.trim();

  const existingBatch = await Batch.findOne({
    programId,
    batchName: normalizedBatchName,
  });

  if (existingBatch) {
    throw new ApiError(
      409,
      "Batch with this name already exists for this program"
    );
  }

  if (startYear < 2000 || startYear > 2100) {
    throw new ApiError(400, "Start year must be between 2000 and 2100");
  }

  if (endYear < 2000 || endYear > 2100) {
    throw new ApiError(400, "End year must be between 2000 and 2100");
  }

  if (endYear <= startYear) {
    throw new ApiError(400, "End year must be greater than start year");
  }

  const batch = await Batch.create({
    programId,
    batchName: normalizedBatchName,
    startYear,
    endYear,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, batch, "Batch created successfully"));
});

/**
 * @desc    Get all batches
 * @route   GET /api/v1/batches
 * @access  Protected
 *
 * Query parameters:
 * ?page=1
 * ?limit=10
 * ?search=2026
 * ?programId=PROGRAM_ID
 * ?isActive=true
 */
const getAllBatches = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  const skip = (page - 1) * limit;

  const { search, programId, isActive } = req.query;

  const filter = {};

  if (programId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(programId)) {
      throw new ApiError(400, "Invalid program ID");
    }

    filter.programId = programId;
  }

  if (search?.trim()) {
    filter.$or = [
      {
        batchName: {
          $regex: search.trim(),
          $options: "i",
        },
      },
    ];
  }

  if (isActive !== undefined) {
    if (isActive === "true") {
      filter.isActive = true;
    } else if (isActive === "false") {
      filter.isActive = false;
    }
  }

  const [batches, totalBatches] = await Promise.all([
    Batch.find(filter)
      .populate("programId", "programName programCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Batch.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalBatches / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        batches,
        pagination: {
          currentPage: page,
          totalPages,
          totalBatches,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Batches fetched successfully"
    )
  );
});

/**
 * @desc    Get batch by ID
 * @route   GET /api/v1/batches/:batchId
 * @access  Protected
 */
const getBatchById = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new ApiError(400, "Invalid batch ID");
  }

  const batch = await Batch.findById(batchId).populate(
    "programId",
    "programName programCode"
  );

  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, batch, "Batch fetched successfully"));
});

/**
 * @desc    Update batch
 * @route   PATCH /api/v1/batches/:batchId
 * @access  Protected
 */
const updateBatch = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new ApiError(400, "Invalid batch ID");
  }

  const { programId, batchName, startYear, endYear } = req.body;

  if (
    programId === undefined &&
    batchName === undefined &&
    startYear === undefined &&
    endYear === undefined
  ) {
    throw new ApiError(400, "At least one field is required for update");
  }

  const batch = await Batch.findById(batchId);

  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  if (programId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(programId)) {
      throw new ApiError(400, "Invalid program ID");
    }

    const program = await Program.findById(programId);

    if (!program) {
      throw new ApiError(404, "Program not found");
    }

    batch.programId = programId;
  }

  if (batchName !== undefined) {
    const normalizedBatchName = batchName.trim();

    if (!normalizedBatchName) {
      throw new ApiError(400, "Batch name cannot be empty");
    }

    const existingBatch = await Batch.findOne({
      programId: batch.programId,
      batchName: normalizedBatchName,
      _id: { $ne: batchId },
    });

    if (existingBatch) {
      throw new ApiError(
        409,
        "Batch with this name already exists for this program"
      );
    }

    batch.batchName = normalizedBatchName;
  }

  if (startYear !== undefined) {
    if (startYear < 2000 || startYear > 2100) {
      throw new ApiError(400, "Start year must be between 2000 and 2100");
    }

    batch.startYear = startYear;
  }

  if (endYear !== undefined) {
    if (endYear < 2000 || endYear > 2100) {
      throw new ApiError(400, "End year must be between 2000 and 2100");
    }

    batch.endYear = endYear;
  }

  if (batch.endYear <= batch.startYear) {
    throw new ApiError(400, "End year must be greater than start year");
  }

  const duplicateBatch = await Batch.findOne({
    programId: batch.programId,
    batchName: batch.batchName,
    _id: { $ne: batchId },
  });

  if (duplicateBatch) {
    throw new ApiError(
      409,
      "Batch with this name already exists for this program"
    );
  }

  await batch.save();

  return res
    .status(200)
    .json(new ApiResponse(200, batch, "Batch updated successfully"));
});

/**
 * @desc    Delete batch
 * @route   DELETE /api/v1/batches/:batchId
 * @access  Protected
 */
const deleteBatch = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new ApiError(400, "Invalid batch ID");
  }

  const batch = await Batch.findById(batchId);

  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  await Batch.findByIdAndDelete(batchId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Batch deleted successfully"));
});

/**
 * @desc    Activate / Deactivate batch
 * @route   PATCH /api/v1/batches/:batchId/status
 * @access  Protected
 */
const toggleBatchStatus = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new ApiError(400, "Invalid batch ID");
  }

  const batch = await Batch.findById(batchId);

  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  batch.isActive = !batch.isActive;

  await batch.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      batch,
      `Batch ${
        batch.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
});

/**
 * @desc    Get only active batches
 * @route   GET /api/v1/batches/active
 * @access  Protected
 */
const getActiveBatches = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
    isActive: true,
  })
    .populate("programId", "programName programCode")
    .sort({
      startYear: -1,
      batchName: 1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        batches,
        "Active batches fetched successfully"
      )
    );
});

export {
  createBatch,
  getAllBatches,
  getBatchById,
  updateBatch,
  deleteBatch,
  toggleBatchStatus,
  getActiveBatches,
};