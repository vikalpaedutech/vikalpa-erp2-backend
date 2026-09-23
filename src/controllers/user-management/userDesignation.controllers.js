import mongoose from "mongoose";

import { User } from "../../models/user.models.js";
import { Designation } from "../../models/program-management/designation.models.js";
import { UserDesignation } from "../../models/user-management/userDesignation.models.js";

import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";


/**
 * @desc    Assign a designation to a user
 * @route   POST /api/v1/user-management/user-designations
 * @access  Private
 */
const assignDesignationToUser = asyncHandler(async (req, res) => {
  const {
    userId,
    designationId,
    isPrimary = false,
  } = req.body;


  if (!userId || !designationId) {
    throw new ApiError(
      400,
      "User ID and designation ID are required"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (!mongoose.Types.ObjectId.isValid(designationId)) {
    throw new ApiError(400, "Invalid designation ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.isActive) {
    throw new ApiError(400, "Cannot assign designation to an inactive user");
  }

  const designation = await Designation.findById(designationId);

  if (!designation) {
    throw new ApiError(404, "Designation not found");
  }

  if (!designation.isActive) {
    throw new ApiError(400, "Cannot assign an inactive designation");
  }

  const existingAssignment = await UserDesignation.findOne({
    userId,
    designationId,
  });

  if (existingAssignment) {
    throw new ApiError(
      409,
      "This designation is already assigned to the user"
    );
  }

  /*
   * If this designation is being assigned as primary,
   * remove primary status from the user's existing
   * active primary designation.
   */
  if (isPrimary) {
    await UserDesignation.updateMany(
      {
        userId,
        isPrimary: true,
        isActive: true,
      },
      {
        $set: {
          isPrimary: false,
        },
      }
    );
  }

  const userDesignation = await UserDesignation.create({
    userId,
    designationId,
    isPrimary,
    isActive: true,
  });

  const createdUserDesignation = await UserDesignation.findById(
    userDesignation._id
  )
    .populate("userId", "-password -refreshToken")
    .populate("designationId");

  return res.status(201).json(
    new ApiResponse(
      201,
      createdUserDesignation,
      "Designation assigned to user successfully"
    )
  );
});


/**
 * @desc    Get all user-designation mappings
 * @route   GET /api/v1/user-management/user-designations
 * @access  Private
 */
const getAllUserDesignations = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
  } = req.query;

  const pageNumber = Math.max(parseInt(page) || 1, 1);
  const limitNumber = Math.min(
    Math.max(parseInt(limit) || 10, 1),
    100
  );

  const skip = (pageNumber - 1) * limitNumber;

  const [userDesignations, totalUserDesignations] =
    await Promise.all([
      UserDesignation.find()
        .populate("userId", "-password -refreshToken")
        .populate("designationId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber),

      UserDesignation.countDocuments(),
    ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        userDesignations,
        pagination: {
          totalUserDesignations,
          currentPage: pageNumber,
          totalPages: Math.ceil(
            totalUserDesignations / limitNumber
          ),
          limit: limitNumber,
        },
      },
      "User-designation mappings fetched successfully"
    )
  );
});


/**
 * @desc    Get user-designation mapping by ID
 * @route   GET /api/v1/user-management/user-designations/:userDesignationId
 * @access  Private
 */
const getUserDesignationById = asyncHandler(async (req, res) => {
  const { userDesignationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userDesignationId)) {
    throw new ApiError(
      400,
      "Invalid user-designation ID"
    );
  }

  const userDesignation = await UserDesignation.findById(
    userDesignationId
  )
    .populate("userId", "-password -refreshToken")
    .populate("designationId");

  if (!userDesignation) {
    throw new ApiError(
      404,
      "User-designation mapping not found"
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      userDesignation,
      "User-designation mapping fetched successfully"
    )
  );
});


/**
 * @desc    Get all designations assigned to a user
 * @route   GET /api/v1/user-management/user-designations/user/:userId
 * @access  Private
 */
const getDesignationsByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const userDesignations = await UserDesignation.find({
    userId,
  })
    .populate("designationId")
    .sort({
      isPrimary: -1,
      createdAt: -1,
    });

  return res.status(200).json(
    new ApiResponse(
      200,
      userDesignations,
      "User designations fetched successfully"
    )
  );
});


/**
 * @desc    Get all users assigned to a designation
 * @route   GET /api/v1/user-management/user-designations/designation/:designationId
 * @access  Private
 */
const getUsersByDesignation = asyncHandler(async (req, res) => {
  const { designationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(designationId)) {
    throw new ApiError(400, "Invalid designation ID");
  }

  const designation = await Designation.findById(designationId);

  if (!designation) {
    throw new ApiError(404, "Designation not found");
  }

  const userDesignations = await UserDesignation.find({
    designationId,
  })
    .populate("userId", "-password -refreshToken")
    .sort({
      createdAt: -1,
    });

  return res.status(200).json(
    new ApiResponse(
      200,
      userDesignations,
      "Users assigned to designation fetched successfully"
    )
  );
});


/**
 * @desc    Toggle user-designation assignment status
 * @route   PATCH /api/v1/user-management/user-designations/:userDesignationId/status
 * @access  Private
 */
const toggleUserDesignationStatus = asyncHandler(
  async (req, res) => {
    const { userDesignationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userDesignationId)) {
      throw new ApiError(
        400,
        "Invalid user-designation ID"
      );
    }

    const userDesignation = await UserDesignation.findById(
      userDesignationId
    );

    if (!userDesignation) {
      throw new ApiError(
        404,
        "User-designation mapping not found"
      );
    }

    userDesignation.isActive = !userDesignation.isActive;

    /*
     * An inactive designation assignment cannot remain primary.
     */
    if (!userDesignation.isActive) {
      userDesignation.isPrimary = false;
    }

    await userDesignation.save();

    const updatedUserDesignation =
      await UserDesignation.findById(userDesignation._id)
        .populate("userId", "-password -refreshToken")
        .populate("designationId");

    return res.status(200).json(
      new ApiResponse(
        200,
        updatedUserDesignation,
        `User designation ${
          updatedUserDesignation.isActive
            ? "activated"
            : "deactivated"
        } successfully`
      )
    );
  }
);


/**
 * @desc    Remove a designation from a user
 * @route   DELETE /api/v1/user-management/user-designations/:userDesignationId
 * @access  Private
 */
const removeDesignationFromUser = asyncHandler(
  async (req, res) => {
    const { userDesignationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userDesignationId)) {
      throw new ApiError(
        400,
        "Invalid user-designation ID"
      );
    }

    const userDesignation = await UserDesignation.findById(
      userDesignationId
    );

    if (!userDesignation) {
      throw new ApiError(
        404,
        "User-designation mapping not found"
      );
    }

    await UserDesignation.findByIdAndDelete(
      userDesignationId
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        null,
        "Designation removed from user successfully"
      )
    );
  }
);


export {
  assignDesignationToUser,
  getAllUserDesignations,
  getUserDesignationById,
  getDesignationsByUser,
  getUsersByDesignation,
  toggleUserDesignationStatus,
  removeDesignationFromUser,
};