import mongoose from "mongoose";
import { Program } from "../../models/program-management/prgroam.models.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";

/**
 * @desc    Create a new program
 * @route   POST /api/v1/programs
 * @access  Protected
 */
const createProgram = asyncHandler(async (req, res) => {
  const { programName, programCode, description } = req.body;

  if (!programName || !programCode) {
    throw new ApiError(400, "Program name and program code are required");
  }

  const existingProgram = await Program.findOne({
    $or: [
      { programName: programName.trim() },
      { programCode: programCode.trim().toUpperCase() },
    ],
  });

  if (existingProgram) {
    if (
      existingProgram.programName.toLowerCase() ===
      programName.trim().toLowerCase()
    ) {
      throw new ApiError(409, "Program with this name already exists");
    }

    if (
      existingProgram.programCode === programCode.trim().toUpperCase()
    ) {
      throw new ApiError(409, "Program with this code already exists");
    }
  }

  const program = await Program.create({
    programName: programName.trim(),
    programCode: programCode.trim().toUpperCase(),
    description: description?.trim() || "",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, program, "Program created successfully"));
});

/**
 * @desc    Get all programs
 * @route   GET /api/v1/programs
 * @access  Protected
 *
 * Query parameters:
 * ?page=1
 * ?limit=10
 * ?search=buniyaad
 * ?isActive=true
 */
const getAllPrograms = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  const skip = (page - 1) * limit;

  const { search, isActive } = req.query;

  const filter = {};

  if (search?.trim()) {
    filter.$or = [
      {
        programName: {
          $regex: search.trim(),
          $options: "i",
        },
      },
      {
        programCode: {
          $regex: search.trim(),
          $options: "i",
        },
      },
      {
        description: {
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

  const [programs, totalPrograms] = await Promise.all([
    Program.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Program.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalPrograms / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        programs,
        pagination: {
          currentPage: page,
          totalPages,
          totalPrograms,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Programs fetched successfully"
    )
  );
});

/**
 * @desc    Get program by ID
 * @route   GET /api/v1/programs/:programId
 * @access  Protected
 */
const getProgramById = asyncHandler(async (req, res) => {
  const { programId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(programId)) {
    throw new ApiError(400, "Invalid program ID");
  }

  const program = await Program.findById(programId);

  if (!program) {
    throw new ApiError(404, "Program not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, program, "Program fetched successfully"));
});

/**
 * @desc    Update program
 * @route   PATCH /api/v1/programs/:programId
 * @access  Protected
 */
const updateProgram = asyncHandler(async (req, res) => {
  const { programId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(programId)) {
    throw new ApiError(400, "Invalid program ID");
  }

  const { programName, programCode, description } = req.body;

  if (
    programName === undefined &&
    programCode === undefined &&
    description === undefined
  ) {
    throw new ApiError(400, "At least one field is required for update");
  }

  const program = await Program.findById(programId);

  if (!program) {
    throw new ApiError(404, "Program not found");
  }

  if (programName !== undefined) {
    const existingName = await Program.findOne({
      programName: programName.trim(),
      _id: { $ne: programId },
    });

    if (existingName) {
      throw new ApiError(409, "Program with this name already exists");
    }

    program.programName = programName.trim();
  }

  if (programCode !== undefined) {
    const normalizedCode = programCode.trim().toUpperCase();

    const existingCode = await Program.findOne({
      programCode: normalizedCode,
      _id: { $ne: programId },
    });

    if (existingCode) {
      throw new ApiError(409, "Program with this code already exists");
    }

    program.programCode = normalizedCode;
  }

  if (description !== undefined) {
    program.description = description.trim();
  }

  await program.save();

  return res
    .status(200)
    .json(new ApiResponse(200, program, "Program updated successfully"));
});

/**
 * @desc    Delete program
 * @route   DELETE /api/v1/programs/:programId
 * @access  Protected
 */
const deleteProgram = asyncHandler(async (req, res) => {
  const { programId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(programId)) {
    throw new ApiError(400, "Invalid program ID");
  }

  const program = await Program.findById(programId);

  if (!program) {
    throw new ApiError(404, "Program not found");
  }

  await Program.findByIdAndDelete(programId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Program deleted successfully"));
});

/**
 * @desc    Activate / Deactivate program
 * @route   PATCH /api/v1/programs/:programId/status
 * @access  Protected
 */
const toggleProgramStatus = asyncHandler(async (req, res) => {
  const { programId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(programId)) {
    throw new ApiError(400, "Invalid program ID");
  }

  const program = await Program.findById(programId);

  if (!program) {
    throw new ApiError(404, "Program not found");
  }

  program.isActive = !program.isActive;

  await program.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      program,
      `Program ${
        program.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
});

/**
 * @desc    Get only active programs
 * @route   GET /api/v1/programs/active
 * @access  Protected
 */
const getActivePrograms = asyncHandler(async (req, res) => {
  const programs = await Program.find({
    isActive: true,
  }).sort({
    programName: 1,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        programs,
        "Active programs fetched successfully"
      )
    );
});

/**
 * @desc    Search programs
 * @route   GET /api/v1/programs/search
 * @access  Protected
 *
 * Query:
 * ?q=buniyaad
 */
const searchPrograms = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q?.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const programs = await Program.find({
    $or: [
      {
        programName: {
          $regex: q.trim(),
          $options: "i",
        },
      },
      {
        programCode: {
          $regex: q.trim(),
          $options: "i",
        },
      },
    ],
  }).sort({
    programName: 1,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        programs,
        "Program search completed successfully"
      )
    );
});

export {
  createProgram,
  getAllPrograms,
  getProgramById,
  updateProgram,
  deleteProgram,
  toggleProgramStatus,
  getActivePrograms,
  searchPrograms,
};