import mongoose from "mongoose";
import { Designation } from "../../models/program-management/designation.models.js";
import { Department } from "../../models/program-management/department.models.js"
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";

/**
 * @desc    Create a new designation
 * @route   POST /api/v1/designation
 * @access  Protected
 */
const createDesignation = asyncHandler(async (req, res) => {
  const { departmentId, designation, designationCode } = req.body;

  if (!departmentId || !designation || !designationCode) {
    throw new ApiError(
      400,
      "Department ID, designation and designation code are required"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    throw new ApiError(400, "Invalid department ID");
  }

  const department = await Department.findById(departmentId);

  if (!department) {
    throw new ApiError(404, "Department not found");
  }

  const normalizedDesignation = designation.trim();
  const normalizedCode = designationCode.trim().toUpperCase();

  const existingDesignation = await Designation.findOne({
    departmentId,
    $or: [
      { designation: normalizedDesignation },
      { designationCode: normalizedCode },
    ],
  });

  if (existingDesignation) {
    if (
      existingDesignation.designation.toLowerCase() ===
      normalizedDesignation.toLowerCase()
    ) {
      throw new ApiError(
        409,
        "Designation with this name already exists in this department"
      );
    }

    if (existingDesignation.designationCode === normalizedCode) {
      throw new ApiError(
        409,
        "Designation with this code already exists in this department"
      );
    }
  }

  const newDesignation = await Designation.create({
    departmentId,
    designation: normalizedDesignation,
    designationCode: normalizedCode,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        newDesignation,
        "Designation created successfully"
      )
    );
});

/**
 * @desc    Get all designations
 * @route   GET /api/v1/designations
 * @access  Protected
 *
 * Query parameters:
 * ?page=1
 * ?limit=10
 * ?search=teacher
 * ?departmentId=DEPARTMENT_ID
 * ?isActive=true
 */
const getAllDesignations = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 10, 1),
    100
  );


  const skip = (page - 1) * limit;

  const { search, departmentId, isActive } = req.query;

  const filter = {};

  if (departmentId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      throw new ApiError(400, "Invalid department ID");
    }

    filter.departmentId = departmentId;
  }

  if (search?.trim()) {
    filter.$or = [
      {
        designation: {
          $regex: search.trim(),
          $options: "i",
        },
      },
      {
        designationCode: {
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

  const [designations, totalDesignations] = await Promise.all([
    Designation.find(filter)
      .populate("departmentId", "departmentName departmentCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Designation.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalDesignations / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        designations,
        pagination: {
          currentPage: page,
          totalPages,
          totalDesignations,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Designations fetched successfully"
    )
  );
});

/**
 * @desc    Get designation by ID
 * @route   GET /api/v1/designations/:designationId
 * @access  Protected
 */
const getDesignationById = asyncHandler(async (req, res) => {
  const { designationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(designationId)) {
    throw new ApiError(400, "Invalid designation ID");
  }

  const designation = await Designation.findById(designationId).populate(
    "departmentId",
    "departmentName departmentCode"
  );

  if (!designation) {
    throw new ApiError(404, "Designation not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        designation,
        "Designation fetched successfully"
      )
    );
});

/**
 * @desc    Update designation
 * @route   PATCH /api/v1/designations/:designationId
 * @access  Protected
 */
const updateDesignation = asyncHandler(async (req, res) => {
  const { designationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(designationId)) {
    throw new ApiError(400, "Invalid designation ID");
  }

  const {
    departmentId,
    designation,
    designationCode,
  } = req.body;

  if (
    departmentId === undefined &&
    designation === undefined &&
    designationCode === undefined
  ) {
    throw new ApiError(
      400,
      "At least one field is required for update"
    );
  }

  const existingDesignation = await Designation.findById(designationId);

  if (!existingDesignation) {
    throw new ApiError(404, "Designation not found");
  }

  if (departmentId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      throw new ApiError(400, "Invalid department ID");
    }

    const department = await Department.findById(departmentId);

    if (!department) {
      throw new ApiError(404, "Department not found");
    }

    existingDesignation.departmentId = departmentId;
  }

  if (designation !== undefined) {
    const normalizedDesignation = designation.trim();

    if (!normalizedDesignation) {
      throw new ApiError(
        400,
        "Designation cannot be empty"
      );
    }

    existingDesignation.designation = normalizedDesignation;
  }

  if (designationCode !== undefined) {
    const normalizedCode = designationCode.trim().toUpperCase();

    if (!normalizedCode) {
      throw new ApiError(
        400,
        "Designation code cannot be empty"
      );
    }

    existingDesignation.designationCode = normalizedCode;
  }

  const duplicateDesignation = await Designation.findOne({
    departmentId: existingDesignation.departmentId,
    $or: [
      {
        designation: existingDesignation.designation,
      },
      {
        designationCode: existingDesignation.designationCode,
      },
    ],
    _id: { $ne: designationId },
  });

  if (duplicateDesignation) {
    if (
      duplicateDesignation.designation.toLowerCase() ===
      existingDesignation.designation.toLowerCase()
    ) {
      throw new ApiError(
        409,
        "Designation with this name already exists in this department"
      );
    }

    if (
      duplicateDesignation.designationCode ===
      existingDesignation.designationCode
    ) {
      throw new ApiError(
        409,
        "Designation with this code already exists in this department"
      );
    }
  }

  await existingDesignation.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        existingDesignation,
        "Designation updated successfully"
      )
    );
});

/**
 * @desc    Delete designation
 * @route   DELETE /api/v1/designations/:designationId
 * @access  Protected
 */
const deleteDesignation = asyncHandler(async (req, res) => {
  const { designationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(designationId)) {
    throw new ApiError(400, "Invalid designation ID");
  }

  const designation = await Designation.findById(designationId);

  if (!designation) {
    throw new ApiError(404, "Designation not found");
  }

  await Designation.findByIdAndDelete(designationId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Designation deleted successfully"
      )
    );
});

/**
 * @desc    Activate / Deactivate designation
 * @route   PATCH /api/v1/designations/:designationId/status
 * @access  Protected
 */
const toggleDesignationStatus = asyncHandler(async (req, res) => {
  const { designationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(designationId)) {
    throw new ApiError(400, "Invalid designation ID");
  }

  const designation = await Designation.findById(designationId);

  if (!designation) {
    throw new ApiError(404, "Designation not found");
  }

  designation.isActive = !designation.isActive;

  await designation.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      designation,
      `Designation ${
        designation.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
});

/**
 * @desc    Get only active designations
 * @route   GET /api/v1/designations/active
 * @access  Protected
 *
 * Optional query:
 * ?departmentId=DEPARTMENT_ID
 */
const getActiveDesignations = asyncHandler(async (req, res) => {
  const { departmentId } = req.query;

  const filter = {
    isActive: true,
  };

  if (departmentId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      throw new ApiError(400, "Invalid department ID");
    }

    filter.departmentId = departmentId;
  }

  const designations = await Designation.find(filter)
    .populate("departmentId", "departmentName departmentCode")
    .sort({
      designation: 1,
    });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        designations,
        "Active designations fetched successfully"
      )
    );
});

export {
  createDesignation,
  getAllDesignations,
  getDesignationById,
  updateDesignation,
  deleteDesignation,
  toggleDesignationStatus,
  getActiveDesignations,
};