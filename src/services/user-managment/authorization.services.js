import { UserRole } from "../../models/user-management/userRole.models.js";
import { UserPermission } from "../../models/user-management/userPermission.models.js";
import { RolePermission } from "../../models/permissions-management/rolePermission.models.js";
import { UserAccess } from "../../models/user-management/userAccess.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";
import { Program } from "../../models/program-management/prgroam.models.js";
import { Batch } from "../../models/program-management/batch.models.js";

export const getUserAccess = async (userId) => {
  // Get active roles assigned to the user
  const userRoles = await UserRole.find({
    userId,
    isActive: true,
  }).populate({
    path: "roleId",
    match: {
      isActive: true,
    },
  });

  const activeUserRoles = userRoles.filter(
    (userRole) => userRole.roleId
  );

  const roleIds = activeUserRoles.map(
    (userRole) => userRole.roleId._id
  );

  // Get permissions through roles
  const rolePermissions = await RolePermission.find({
    roleId: {
      $in: roleIds,
    },
  }).populate({
    path: "permissionId",
    match: {
      isActive: true,
    },
  });

  // Get permissions directly assigned to the user
  const userPermission = await UserPermission.findOne({
    userId,
  }).populate({
    path: "permissionIds",
    match: {
      isActive: true,
    },
  });

  // Combine permissions and remove duplicates
  const permissionsMap = new Map();

  for (const rolePermission of rolePermissions) {
    if (!rolePermission.permissionId) {
      continue;
    }

    const permission = rolePermission.permissionId;

    permissionsMap.set(String(permission.permissionCode).trim().toLowerCase(), {
      _id: permission._id,
      permissionName: permission.permissionName,
      permissionCode: String(permission.permissionCode).trim().toLowerCase(),
      module: permission.module,
      action: permission.action,
      description: permission.description,
    });
  }

  // Add direct user permissions
  if (userPermission?.permissionIds) {
    for (const permission of userPermission.permissionIds) {
      if (!permission) {
        continue;
      }

      permissionsMap.set(String(permission.permissionCode).trim().toLowerCase(), {
        _id: permission._id,
        permissionName: permission.permissionName,
        permissionCode: String(permission.permissionCode).trim().toLowerCase(),
        module: permission.module,
        action: permission.action,
        description: permission.description,
      });
    }
  }

  // Format roles
  const roles = activeUserRoles.map((userRole) => ({
    _id: userRole.roleId._id,
    roleName: userRole.roleId.roleName,
    roleCode: userRole.roleId.roleCode,
    description: userRole.roleId.description,
  }));

  return {
    roles,
    permissions: Array.from(permissionsMap.values()),
  };
};


export const getUserAccessScope = async (userId) => {
  const [userAccess, userRegionAccess, userRoles] = await Promise.all([
    UserAccess.findOne({ userId })
      .populate("programIds")
      .populate("batchIds"),
    UserRegionAccess.find({ userId })
      .populate("districtId")
      .populate("blockId")
      .populate("centerId"),
    UserRole.find({ userId, isActive: true })
      .populate({
        path: "roleId",
        match: { isActive: true },
        select: "roleCode roleName",
      }),
  ]);

  const isAdmin = userRoles.some((userRole) => {
    const role = userRole?.roleId;
    const code = String(role?.roleCode || "").trim().toLowerCase();
    const name = String(role?.roleName || "").trim().toLowerCase();
    return code === "admin" || code === "administrator" ||
      name === "admin" || name === "administrator";
  });

  let programs = userAccess?.programIds || [];
  let batches = userAccess?.batchIds || [];

  // Admin has global academic access. UserAccess intentionally does not need
  // explicit programIds/batchIds for an admin, so expose the effective access
  // here for every frontend consumer that uses /auth/my-access-scope.
  if (isAdmin) {
    [programs, batches] = await Promise.all([
      Program.find({ isActive: true }).sort({ programName: 1 }),
      Batch.find({ isActive: true })
        .populate("programId", "programName programCode")
        .sort({ startYear: -1, batchName: 1 }),
    ]);
  }

  return {
    programAccess: {
      programs,
      batches,
    },
    regionAccess: userRegionAccess,
  };
};