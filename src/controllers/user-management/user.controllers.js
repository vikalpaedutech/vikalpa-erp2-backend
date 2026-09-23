import mongoose from "mongoose";

import { User } from "../../models/user.models.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";


/**
 * @desc    Create a new user
 * @route   POST /api/v1/user-management/users
 * @access  Private
 */
const createUser = asyncHandler(async (req, res) => {
  const {
    userId,
    name,
    email,
    contact,
    password,
    isActive = true,
  } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const existingUser = await User.findOne({
    $or: [
      { email: email.toLowerCase() },
      ...(userId ? [{ userId }] : []),
    ],
  });

  if (existingUser) {
    if (existingUser.email === email.toLowerCase()) {
      throw new ApiError(409, "User with this email already exists");
    }

    if (userId && existingUser.userId === userId) {
      throw new ApiError(409, "User with this user ID already exists");
    }
  }

  const user = await User.create({
    userId,
    name,
    email: email.toLowerCase(),
    contact,
    password,
    isActive,
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken -forgotPasswordToken -emailVerificationToken -emailVerificationExpiry"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while creating user");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User created successfully"));
});


/**
 * @desc    Get all users
 * @route   GET /api/v1/user-management/users
 * @access  Private
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    isActive,
  } = req.query;

  const pageNumber = Math.max(parseInt(page) || 1, 1);
  const limitNumber = Math.min(Math.max(parseInt(limit) || 10, 1), 100);

  const skip = (pageNumber - 1) * limitNumber;

  const query = {};

  if (search.trim()) {
    query.$or = [
      { name: { $regex: search.trim(), $options: "i" } },
      { email: { $regex: search.trim(), $options: "i" } },
      { userId: { $regex: search.trim(), $options: "i" } },
      { contact: { $regex: search.trim(), $options: "i" } },
    ];
  }

  if (isActive !== undefined) {
    if (isActive === "true") {
      query.isActive = true;
    } else if (isActive === "false") {
      query.isActive = false;
    }
  }

  const [users, totalUsers] = await Promise.all([
    User.find(query)
      .select(
        "-password -refreshToken -forgotPasswordToken -emailVerificationToken -emailVerificationExpiry"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber),

    User.countDocuments(query),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        users,
        pagination: {
          totalUsers,
          currentPage: pageNumber,
          totalPages: Math.ceil(totalUsers / limitNumber),
          limit: limitNumber,
        },
      },
      "Users fetched successfully"
    )
  );
});


/**
 * @desc    Get user by ID
 * @route   GET /api/v1/user-management/users/:userId
 * @access  Private
 */
const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId).select(
    "-password -refreshToken -forgotPasswordToken -emailVerificationToken -emailVerificationExpiry"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"));
});


/**
 * @desc    Update user
 * @route   PATCH /api/v1/user-management/users/:userId
 * @access  Private
 */
const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const {
    name,
    email,
    contact,
    userId: newUserId,
    isActive,
  } = req.body;

  if (
    name === undefined &&
    email === undefined &&
    contact === undefined &&
    newUserId === undefined &&
    isActive === undefined
  ) {
    throw new ApiError(400, "No fields provided for update");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (email !== undefined) {
    const normalizedEmail = email.toLowerCase().trim();

    const existingEmail = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: userId },
    });

    if (existingEmail) {
      throw new ApiError(409, "User with this email already exists");
    }

    user.email = normalizedEmail;
  }

  if (newUserId !== undefined) {
    const existingUserId = await User.findOne({
      userId: newUserId,
      _id: { $ne: userId },
    });

    if (existingUserId) {
      throw new ApiError(409, "User with this user ID already exists");
    }

    user.userId = newUserId;
  }

  if (name !== undefined) {
    user.name = name;
  }

  if (contact !== undefined) {
    user.contact = contact;
  }

  if (isActive !== undefined) {
    user.isActive =
      isActive === true ||
      isActive === "true" ||
      isActive === 1 ||
      isActive === "1";
  }

  await user.save();

  const updatedUser = await User.findById(user._id).select(
    "-password -refreshToken -forgotPasswordToken -emailVerificationToken -emailVerificationExpiry"
  );

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "User updated successfully"));
});


/**
 * @desc    Delete user
 * @route   DELETE /api/v1/user-management/users/:userId
 * @access  Private
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  await User.findByIdAndDelete(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User deleted successfully"));
});


/**
 * @desc    Search users
 * @route   GET /api/v1/user-management/users/search?q=
 * @access  Private
 */
const searchUsers = asyncHandler(async (req, res) => {
  const { q = "" } = req.query;

  if (!q.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const users = await User.find({
    $or: [
      { name: { $regex: q.trim(), $options: "i" } },
      { email: { $regex: q.trim(), $options: "i" } },
      { userId: { $regex: q.trim(), $options: "i" } },
      { contact: { $regex: q.trim(), $options: "i" } },
    ],
  })
    .select(
      "-password -refreshToken -forgotPasswordToken -emailVerificationToken -emailVerificationExpiry"
    )
    .sort({ name: 1 })
    .limit(50);

  return res
    .status(200)
    .json(new ApiResponse(200, users, "Users searched successfully"));
});


/**
 * @desc    Toggle user active status
 * @route   PATCH /api/v1/user-management/users/:userId/status
 * @access  Private
 */
const toggleUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.isActive = !user.isActive;

  await user.save();

  const updatedUser = await User.findById(user._id).select(
    "-password -refreshToken -forgotPasswordToken -emailVerificationToken -emailVerificationExpiry"
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      updatedUser,
      `User ${
        updatedUser.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
});


export {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  searchUsers,
  toggleUserStatus,
};