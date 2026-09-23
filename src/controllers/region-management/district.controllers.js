import mongoose from "mongoose";

import { District } from "../../models/region-management/district.models.js";

import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";


/**
 * @desc    Create a new district
 * @route   POST /api/v1/region-management/districts
 * @access  Protected
 */
const createDistrict = asyncHandler(async (req, res) => {
  const { districtId, districtName } = req.body;

  if (!districtName) {
    throw new ApiError(400, "District name is required");
  }

  const existingDistrict = await District.findOne({
    $or: [
      {
        districtName: districtName.trim(),
      },
      ...(districtId
        ? [
            {
              districtId: districtId.trim(),
            },
          ]
        : []),
    ],
  });

  if (existingDistrict) {
    if (
      existingDistrict.districtName.toLowerCase() ===
      districtName.trim().toLowerCase()
    ) {
      throw new ApiError(409, "District with this name already exists");
    }

    if (
      districtId &&
      existingDistrict.districtId === districtId.trim()
    ) {
      throw new ApiError(409, "District with this ID already exists");
    }
  }

  const district = await District.create({
    districtId: districtId?.trim() || "",
    districtName: districtName.trim(),
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        district,
        "District created successfully"
      )
    );
});


/**
 * @desc    Get all districts
 * @route   GET /api/v1/region-management/districts
 * @access  Protected
 *
 * Query:
 * ?page=1
 * ?limit=10
 * ?search=Ambala
 */
const getAllDistricts = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);

  const limit = Math.min(
    Math.max(Number(req.query.limit) || 10, 1),
    100
  );

  

  const skip = (page - 1) * limit;

  const { search } = req.query;

  const filter = {};

  if (search?.trim()) {
    filter.$or = [
      {
        districtName: {
          $regex: search.trim(),
          $options: "i",
        },
      },
      {
        districtId: {
          $regex: search.trim(),
          $options: "i",
        },
      },
    ];
  }

  const [districts, totalDistricts] = await Promise.all([
    District.find(filter)
      .sort({ districtName: 1 })
      .skip(skip)
      .limit(limit),

    District.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalDistricts / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        districts,
        pagination: {
          currentPage: page,
          totalPages,
          totalDistricts,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      "Districts fetched successfully"
    )
  );
});


/**
 * @desc    Get district by MongoDB ID
 * @route   GET /api/v1/region-management/districts/:districtId
 * @access  Protected
 */
const getDistrictById = asyncHandler(async (req, res) => {
  const { districtId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(districtId)) {
    throw new ApiError(400, "Invalid district ID");
  }

  const district = await District.findById(districtId);

  if (!district) {
    throw new ApiError(404, "District not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        district,
        "District fetched successfully"
      )
    );
});


/**
 * @desc    Update district
 * @route   PATCH /api/v1/region-management/districts/:districtId
 * @access  Protected
 */
const updateDistrict = asyncHandler(async (req, res) => {
  const { districtId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(districtId)) {
    throw new ApiError(400, "Invalid district ID");
  }

  const { districtId: newDistrictId, districtName } = req.body;

  if (
    newDistrictId === undefined &&
    districtName === undefined
  ) {
    throw new ApiError(
      400,
      "At least one field is required for update"
    );
  }

  const district = await District.findById(districtId);

  if (!district) {
    throw new ApiError(404, "District not found");
  }

  if (districtName !== undefined) {
    const existingDistrict = await District.findOne({
      districtName: districtName.trim(),
      _id: { $ne: districtId },
    });

    if (existingDistrict) {
      throw new ApiError(
        409,
        "District with this name already exists"
      );
    }

    district.districtName = districtName.trim();
  }

  if (newDistrictId !== undefined) {
    const normalizedDistrictId = newDistrictId.trim();

    const existingDistrict = await District.findOne({
      districtId: normalizedDistrictId,
      _id: { $ne: districtId },
    });

    if (existingDistrict) {
      throw new ApiError(
        409,
        "District with this ID already exists"
      );
    }

    district.districtId = normalizedDistrictId;
  }

  await district.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        district,
        "District updated successfully"
      )
    );
});


/**
 * @desc    Delete district
 * @route   DELETE /api/v1/region-management/districts/:districtId
 * @access  Protected
 */
const deleteDistrict = asyncHandler(async (req, res) => {
  const { districtId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(districtId)) {
    throw new ApiError(400, "Invalid district ID");
  }

  const district = await District.findById(districtId);

  if (!district) {
    throw new ApiError(404, "District not found");
  }

  await District.findByIdAndDelete(districtId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "District deleted successfully"
      )
    );
});


/**
 * @desc    Search districts
 * @route   GET /api/v1/region-management/districts/search?q=amb
 * @access  Protected
 */
const searchDistricts = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q?.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const districts = await District.find({
    $or: [
      {
        districtName: {
          $regex: q.trim(),
          $options: "i",
        },
      },
      {
        districtId: {
          $regex: q.trim(),
          $options: "i",
        },
      },
    ],
  }).sort({
    districtName: 1,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        districts,
        "District search completed successfully"
      )
    );
});


export {
  createDistrict,
  getAllDistricts,
  getDistrictById,
  updateDistrict,
  deleteDistrict,
  searchDistricts,
};