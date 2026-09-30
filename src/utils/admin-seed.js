import { User } from "../models/user.models.js";
import { Role } from "../models/permissions-management/role.models.js";
import { Permission } from "../models/permissions-management/permissions.models.js";
import { RolePermission } from "../models/permissions-management/rolePermission.models.js";
import { UserRole } from "../models/user-management/userRole.models.js";
import { UserAccess } from "../models/user-management/userAccess.models.js";
import { UserRegionAccess } from "../models/user-management/userRegionAccess.models.js";

const ADMIN_EMAIL = "admin@vikalpa.com";
const ADMIN_PASSWORD = "vikalpa@123";
const ADMIN_USER_ID = "ADMIN001";

export async function seedAdminUser() {
  // Keep the existing admin password if the admin already exists.
  // This only creates the default admin when it is missing.
  let adminUser = await User.findOne({ email: ADMIN_EMAIL });

  if (!adminUser) {
    adminUser = await User.create({
      userId: ADMIN_USER_ID,
      name: "Admin",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      isActive: true,
      isEmailVerified: true,
    });

    console.log(`Default admin user seeded: ${ADMIN_EMAIL}`);
  } else {
    // Repair the minimum required fields without changing an existing password.
    const updates = {};

    if (!adminUser.userId) {
      updates.userId = ADMIN_USER_ID;
    }

    if (adminUser.isActive === false) {
      updates.isActive = true;
    }

    if (Object.keys(updates).length > 0) {
      adminUser = await User.findByIdAndUpdate(
        adminUser._id,
        { $set: updates },
        { new: true, runValidators: true }
      );
    }

    console.log(`Default admin user already exists: ${ADMIN_EMAIL}`);
  }

  // Ensure the Admin role exists.
  let adminRole = await Role.findOne({ roleCode: "ADMIN" });

  if (!adminRole) {
    adminRole = await Role.create({
      roleName: "Admin",
      roleCode: "ADMIN",
      description: "System administrator role",
      isActive: true,
    });

    console.log("Admin role seeded.");
  } else if (!adminRole.isActive) {
    adminRole = await Role.findByIdAndUpdate(
      adminRole._id,
      { $set: { isActive: true } },
      { new: true, runValidators: true }
    );
  }

  // Give the Admin role every active permission.
  const permissions = await Permission.find({ isActive: true }).select("_id");

  if (permissions.length > 0) {
    await RolePermission.bulkWrite(
      permissions.map((permission) => ({
        updateOne: {
          filter: {
            roleId: adminRole._id,
            permissionId: permission._id,
          },
          update: {
            $setOnInsert: {
              roleId: adminRole._id,
              permissionId: permission._id,
            },
          },
          upsert: true,
        },
      }))
    );
  }

  // Ensure the default admin has the Admin role.
  await UserRole.updateOne(
    {
      userId: adminUser._id,
      roleId: adminRole._id,
    },
    {
      $setOnInsert: {
        userId: adminUser._id,
        roleId: adminRole._id,
        isActive: true,
      },
      $set: {
        isActive: true,
      },
    },
    { upsert: true }
  );

  // Ensure an access document exists for the admin.
  // The empty program/batch arrays preserve the existing access model.
  await UserAccess.updateOne(
    { userId: adminUser._id },
    {
      $setOnInsert: {
        userId: adminUser._id,
        programIds: [],
        batchIds: [],
      },
    },
    { upsert: true }
  );

  // Admin gets global region scope, so a fresh database does not leave
  // the seeded admin without region access.
  await UserRegionAccess.updateOne(
    {
      userId: adminUser._id,
      scope: "global",
    },
    {
      $setOnInsert: {
        userId: adminUser._id,
        scope: "global",
        districtId: null,
        blockId: null,
        centerId: null,
      },
    },
    { upsert: true }
  );
}
