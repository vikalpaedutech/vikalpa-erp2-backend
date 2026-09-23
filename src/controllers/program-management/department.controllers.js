import mongoose from "mongoose";
import { Department } from "../../models/program-management/department.models.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";

/**
 * @desc    Create a new department
 * @route   POST /api/v1/departments
 * @access  Protected
 */
const createDepartment = asyncHandler(async (req, res) => {
  const { departmentName, departmentCode } = req.body;

  if (!departmentName || !departmentCode) {
    throw new ApiError(
      400,
      "Department name and department code are required"
    );
  }

  const normalizedName = departmentName.trim();
  const normalizedCode = departmentCode.trim().toUpperCase();

  const existingDepartment = await Department.findOne({
    $or: [
      { departmentName: normalizedName },
      { departmentCode: normalizedCode },
    ],
  });

  if (existingDepartment) {
    if (
      existingDepartment.departmentName.toLowerCase() ===
      normalizedName.toLowerCase()
    ) {
      throw new ApiError(
        409,
        "Department with this name already exists"
      );
    }

    if (existingDepartment.departmentCode === normalizedCode) {
      throw new ApiError(
        409,
        "Department with this code already exists"
      );
    }
  }

  const department = await Department.create({
    departmentName: normalizedName,
    departmentCode: normalizedCode,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        department,
        "Department created successfully"
      )
    );
});

/**
 * @desc    Get all departments
 * @route   GET /api/v1/departments
 * @access  Protected
 *
 * Query parameters:
 * ?page=1
 * ?limit=10
 * ?search=academic
 * ?isActive=true
 */
const getAllDepartments = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 10, 1),
    100
  );

  const skip = (page - 1) * limit;

  const { search, isActive } = req.query;

  const filter = {};

  if (search?.trim()) {
    filter.$or = [
      {
        departmentName: {
          $regex: search.trim(),
          $options: "i",
        },
      },
      {
        departmentCode: {
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

  const [departments, totalDepartments] = await Promise.all([
    Department.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Department.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalDepartments / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        departments,
        pagination: {
          currentPage: page,
          totalPages,
          totalDepartments,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Departments fetched successfully"
    )
  );
});

/**
 * @desc    Get department by ID
 * @route   GET /api/v1/departments/:departmentId
 * @access  Protected
 */
const getDepartmentById = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    throw new ApiError(400, "Invalid department ID");
  }

  const department = await Department.findById(departmentId);

  if (!department) {
    throw new ApiError(404, "Department not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        department,
        "Department fetched successfully"
      )
    );
});

/**
 * @desc    Update department
 * @route   PATCH /api/v1/departments/:departmentId
 * @access  Protected
 */
const updateDepartment = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    throw new ApiError(400, "Invalid department ID");
  }

  const { departmentName, departmentCode } = req.body;

  if (
    departmentName === undefined &&
    departmentCode === undefined
  ) {
    throw new ApiError(
      400,
      "At least one field is required for update"
    );
  }

  const department = await Department.findById(departmentId);

  if (!department) {
    throw new ApiError(404, "Department not found");
  }

  if (departmentName !== undefined) {
    const normalizedName = departmentName.trim();

    if (!normalizedName) {
      throw new ApiError(
        400,
        "Department name cannot be empty"
      );
    }

    const existingName = await Department.findOne({
      departmentName: normalizedName,
      _id: { $ne: departmentId },
    });

    if (existingName) {
      throw new ApiError(
        409,
        "Department with this name already exists"
      );
    }

    department.departmentName = normalizedName;
  }

  if (departmentCode !== undefined) {
    const normalizedCode = departmentCode.trim().toUpperCase();

    if (!normalizedCode) {
      throw new ApiError(
        400,
        "Department code cannot be empty"
      );
    }

    const existingCode = await Department.findOne({
      departmentCode: normalizedCode,
      _id: { $ne: departmentId },
    });

    if (existingCode) {
      throw new ApiError(
        409,
        "Department with this code already exists"
      );
    }

    department.departmentCode = normalizedCode;
  }

  await department.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        department,
        "Department updated successfully"
      )
    );
});

/**
 * @desc    Delete department
 * @route   DELETE /api/v1/departments/:departmentId
 * @access  Protected
 */
const deleteDepartment = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    throw new ApiError(400, "Invalid department ID");
  }

  const department = await Department.findById(departmentId);

  if (!department) {
    throw new ApiError(404, "Department not found");
  }

  await Department.findByIdAndDelete(departmentId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Department deleted successfully"
      )
    );
});

/**
 * @desc    Activate / Deactivate department
 * @route   PATCH /api/v1/departments/:departmentId/status
 * @access  Protected
 */
const toggleDepartmentStatus = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    throw new ApiError(400, "Invalid department ID");
  }

  const department = await Department.findById(departmentId);

  if (!department) {
    throw new ApiError(404, "Department not found");
  }

  department.isActive = !department.isActive;

  await department.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      department,
      `Department ${
        department.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
});

/**
 * @desc    Get only active departments
 * @route   GET /api/v1/departments/active
 * @access  Protected
 */
const getActiveDepartments = asyncHandler(async (req, res) => {
  const departments = await Department.find({
    isActive: true,
  }).sort({
    departmentName: 1,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        departments,
        "Active departments fetched successfully"
      )
    );
});

export {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  toggleDepartmentStatus,
  getActiveDepartments,
};