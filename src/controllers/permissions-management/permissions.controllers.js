import mongoose from "mongoose";

import { Permission } from "../../models/permissions-management/permissions.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";


// Create Permission
const createPermission = asyncHandler(async (req, res) => {
  const {
    permissionName,
    module,
    action,
    description,
  } = req.body;

  if (!permissionName || !module || !action) {
    throw new ApiError(
      400,
      "Permission name, module and action are required"
    );
  }

  const normalizedModule = module.trim().toLowerCase();
  const normalizedAction = action.trim().toLowerCase();

  const permissionCode = `${normalizedModule}.${normalizedAction}`;

  const existingPermission = await Permission.findOne({
    $or: [
      { permissionCode },
      {
        module: normalizedModule,
        action: normalizedAction,
      },
    ],
  });

  if (existingPermission) {
    throw new ApiError(
      409,
      "A permission with this module and action already exists"
    );
  }

  const permission = await Permission.create({
    permissionName: permissionName.trim(),
    permissionCode,
    module: normalizedModule,
    action: normalizedAction,
    description: description?.trim() || "",
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        permission,
        "Permission created successfully"
      )
    );
});


// Get All Permissions
const getAllPermissions = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    module,
    action,
    isActive,
  } = req.query;

  const pageNumber = Math.max(Number(page) || 1, 1);
  const limitNumber = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip = (pageNumber - 1) * limitNumber;

  const filter = {};

  if (search) {
    filter.$or = [
      { permissionName: { $regex: search, $options: "i" } },
      { permissionCode: { $regex: search, $options: "i" } },
      { module: { $regex: search, $options: "i" } },
      { action: { $regex: search, $options: "i" } },
    ];
  }

  if (module) {
    filter.module = module.trim().toLowerCase();
  }

  if (action) {
    filter.action = action.trim().toLowerCase();
  }

  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  const [permissions, totalPermissions] = await Promise.all([
    Permission.find(filter)
      .sort({ module: 1, action: 1 })
      .skip(skip)
      .limit(limitNumber),

    Permission.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalPermissions / limitNumber);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        permissions,
        pagination: {
          currentPage: pageNumber,
          limit: limitNumber,
          totalPermissions,
          totalPages,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
        },
      },
      "Permissions fetched successfully"
    )
  );
});


// Get Permission By ID
const getPermissionById = asyncHandler(async (req, res) => {
  const { permissionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw new ApiError(400, "Invalid permission ID");
  }

  const permission = await Permission.findById(permissionId);

  if (!permission) {
    throw new ApiError(404, "Permission not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        permission,
        "Permission fetched successfully"
      )
    );
});


// Update Permission
const updatePermission = asyncHandler(async (req, res) => {
  const { permissionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw new ApiError(400, "Invalid permission ID");
  }

  const {
    permissionName,
    module,
    action,
    description,
  } = req.body;

  const permission = await Permission.findById(permissionId);

  if (!permission) {
    throw new ApiError(404, "Permission not found");
  }

  const newModule =
    module !== undefined
      ? module.trim().toLowerCase()
      : permission.module;

  const newAction =
    action !== undefined
      ? action.trim().toLowerCase()
      : permission.action;

  const newPermissionCode = `${newModule}.${newAction}`;

  const duplicatePermission = await Permission.findOne({
    _id: { $ne: permissionId },
    $or: [
      { permissionCode: newPermissionCode },
      {
        module: newModule,
        action: newAction,
      },
    ],
  });

  if (duplicatePermission) {
    throw new ApiError(
      409,
      "Another permission with this module and action already exists"
    );
  }

  permission.permissionName =
    permissionName !== undefined
      ? permissionName.trim()
      : permission.permissionName;

  permission.module = newModule;
  permission.action = newAction;
  permission.permissionCode = newPermissionCode;

  if (description !== undefined) {
    permission.description = description.trim();
  }

  await permission.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        permission,
        "Permission updated successfully"
      )
    );
});


// Delete Permission
const deletePermission = asyncHandler(async (req, res) => {
  const { permissionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw new ApiError(400, "Invalid permission ID");
  }

  const permission = await Permission.findById(permissionId);

  if (!permission) {
    throw new ApiError(404, "Permission not found");
  }

  await Permission.findByIdAndDelete(permissionId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Permission deleted successfully"
      )
    );
});


// Search Permissions
const searchPermissions = asyncHandler(async (req, res) => {
  const { q = "", limit = 20 } = req.query;

  const limitNumber = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  if (!q.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const permissions = await Permission.find({
    $or: [
      { permissionName: { $regex: q.trim(), $options: "i" } },
      { permissionCode: { $regex: q.trim(), $options: "i" } },
      { module: { $regex: q.trim(), $options: "i" } },
      { action: { $regex: q.trim(), $options: "i" } },
    ],
  })
    .sort({ module: 1, action: 1 })
    .limit(limitNumber);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        permissions,
        "Permissions search completed successfully"
      )
    );
});


// Get Permissions By Module
const getPermissionsByModule = asyncHandler(async (req, res) => {
  const { module } = req.params;

  if (!module?.trim()) {
    throw new ApiError(400, "Module is required");
  }

  const permissions = await Permission.find({
    module: module.trim().toLowerCase(),
  }).sort({ action: 1 });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        permissions,
        "Permissions fetched successfully"
      )
    );
});


// Get Active Permissions
const getActivePermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.find({
    isActive: true,
  }).sort({
    module: 1,
    action: 1,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        permissions,
        "Active permissions fetched successfully"
      )
    );
});



//toggle permissions
const togglePermissionStatus = asyncHandler(async (req, res) => {
  const { permissionId } = req.params;

  

  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw new ApiError(400, "Invalid permission ID");
  }

  const permission = await Permission.findById(permissionId);

  if (!permission) {
    throw new ApiError(404, "Permission not found");
  }

  permission.isActive = !permission.isActive;

  await permission.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      permission,
      `Permission ${
        permission.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
});
export {
  createPermission,
  getAllPermissions,
  getPermissionById,
  updatePermission,
  deletePermission,
  searchPermissions,
  getPermissionsByModule,
  getActivePermissions,
 togglePermissionStatus
};