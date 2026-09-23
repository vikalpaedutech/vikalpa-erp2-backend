import mongoose from "mongoose";

import { User } from "../../models/user.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { Role } from "../../models/permissions-management/role.models.js";
import { LeaveType } from "../../models/hr-management/leaveType.models.js";
import { UserLeaveBalance } from "../../models/user-management/userLeaveBalance.models.js";
import { LeaveBalanceTransaction } from "../../models/user-management/leaveBalanceTransaction.models.js";

const isAdminUser = async (userId) => {
  const userRoleRecords = await UserRole.find({
    userId,
    isActive: true,
  })
    .populate({
      path: "roleId",
      select: "roleName roleCode isActive",
    })
    .lean();

  return userRoleRecords.some((record) => {
    const role = record.roleId;

    if (!role?.isActive) {
      return false;
    }

    return (
      String(role.roleCode || "").trim().toLowerCase() ===
      "admin"
    );
  });
};

const validateAdmin = async (req) => {
  const userId = req.user?._id;

  if (!userId) {
    const error = new Error("Unauthorized user.");
    error.statusCode = 401;
    throw error;
  }

  const admin = await isAdminUser(userId);

  if (!admin) {
    const error = new Error(
      "Only Admin can manage leave balances."
    );
    error.statusCode = 403;
    throw error;
  }

  return userId;
};

const toNonNegativeNumber = (value, fieldName) => {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(
      `${fieldName} must be a valid non-negative number.`
    );
    error.statusCode = 400;
    throw error;
  }

  return number;
};

const toNumber = (value, fieldName) => {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number)) {
    const error = new Error(
      `${fieldName} must be a valid number.`
    );
    error.statusCode = 400;
    throw error;
  }

  return number;
};

const calculateAvailableBalance = ({
  openingBalance,
  accruedBalance,
  carryForwardBalance,
  adjustmentBalance,
  usedBalance,
  expiredBalance,
}) => {
  return (
    openingBalance +
    accruedBalance +
    carryForwardBalance +
    adjustmentBalance -
    usedBalance -
    expiredBalance
  );
};

const ensureValidYear = (leaveYear) => {
  const year = Number(leaveYear);

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 3000
  ) {
    const error = new Error(
      "leaveYear must be a valid year."
    );
    error.statusCode = 400;
    throw error;
  }

  return year;
};

const getPopulatedBalance = async (balanceId) => {
  return UserLeaveBalance.findById(balanceId)
    .populate({
      path: "userId",
      select: "userId name email isActive",
    })
    .populate({
      path: "leaveTypeId",
      select: "name code isPaid isActive",
    });
};

// ============================================================
// GET MY LEAVE BALANCES
// ============================================================

export const getMyLeaveBalances = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    const currentYear = new Date().getUTCFullYear();

    const leaveYear =
      req.query.leaveYear === undefined
        ? currentYear
        : ensureValidYear(req.query.leaveYear);

    const balances = await UserLeaveBalance.find({
      userId,
      leaveYear,
      isActive: true,
    })
      .populate({
        path: "leaveTypeId",
        select: "name code isPaid isActive",
      })
      .sort({
        "leaveTypeId.name": 1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Leave balances fetched successfully.",
      data: balances,
    });
  } catch (error) {
    console.error("Get My Leave Balances Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch leave balances.",
    });
  }
};

// ============================================================
// GET ALL LEAVE BALANCES - ADMIN
// ============================================================

export const getLeaveBalances = async (req, res) => {
  try {
    await validateAdmin(req);

    const {
      userId,
      leaveTypeId,
      leaveYear,
      isActive,
      search,
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {};

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId.",
        });
      }

      filter.userId = userId;
    }

    if (leaveTypeId) {
      if (!mongoose.Types.ObjectId.isValid(leaveTypeId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid leaveTypeId.",
        });
      }

      filter.leaveTypeId = leaveTypeId;
    }

    if (leaveYear !== undefined) {
      filter.leaveYear = ensureValidYear(leaveYear);
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const pageNumber = Math.max(
      Number(page) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(Number(limit) || 100, 1),
      500
    );

    const skip =
      (pageNumber - 1) * limitNumber;

    let userIds = null;

    if (search?.trim()) {
      const searchRegex = new RegExp(
        search.trim(),
        "i"
      );

      const matchingUsers = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { userId: searchRegex },
        ],
      }).select("_id");

      userIds = matchingUsers.map(
        (user) => user._id
      );

      if (!userIds.length) {
        return res.status(200).json({
          success: true,
          message: "Leave balances fetched successfully.",
          data: [],
          pagination: {
            page: pageNumber,
            limit: limitNumber,
            total: 0,
            totalPages: 0,
          },
        });
      }

      if (filter.userId) {
        const requestedUserId = String(
          filter.userId
        );

        const matchingUserIds = userIds.filter(
          (id) =>
            String(id) === requestedUserId
        );

        if (!matchingUserIds.length) {
          return res.status(200).json({
            success: true,
            message: "Leave balances fetched successfully.",
            data: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
            },
          });
        }

        filter.userId = matchingUserIds[0];
      } else {
        filter.userId = {
          $in: userIds,
        };
      }

      if (
        !filter.userId ||
        (Array.isArray(filter.userId.$in) &&
          filter.userId.$in.length === 0)
      ) {
        return res.status(200).json({
          success: true,
          message: "Leave balances fetched successfully.",
          data: [],
          pagination: {
            page: pageNumber,
            limit: limitNumber,
            total: 0,
            totalPages: 0,
          },
        });
      }
    }

    const [balances, total] =
      await Promise.all([
        UserLeaveBalance.find(filter)
          .populate({
            path: "userId",
            select: "userId name email isActive",
          })
          .populate({
            path: "leaveTypeId",
            select: "name code isPaid isActive",
          })
          .sort({
            leaveYear: -1,
            "userId.name": 1,
            "leaveTypeId.name": 1,
          })
          .skip(skip)
          .limit(limitNumber)
          .lean(),

        UserLeaveBalance.countDocuments(filter),
      ]);

    return res.status(200).json({
      success: true,
      message: "Leave balances fetched successfully.",
      data: balances,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(
          total / limitNumber
        ),
      },
    });
  } catch (error) {
    console.error("Get Leave Balances Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch leave balances.",
    });
  }
};

// ============================================================
// CREATE / UPDATE ONE LEAVE BALANCE - ADMIN
// ============================================================

export const upsertLeaveBalance = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const adminId = await validateAdmin(req);

    const {
      userId,
      leaveTypeId,
      leaveYear,
      openingBalance = 0,
      accruedBalance = 0,
      carryForwardBalance = 0,
      adjustmentBalance = 0,
      expiredBalance = 0,
      isActive = true,
    } = req.body;

    if (!userId || !leaveTypeId || leaveYear === undefined) {
      return res.status(400).json({
        success: false,
        message:
          "userId, leaveTypeId and leaveYear are required.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(leaveTypeId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId or leaveTypeId.",
      });
    }

    const year = ensureValidYear(leaveYear);

    const opening = toNonNegativeNumber(
      openingBalance,
      "openingBalance"
    );

    const accrued = toNonNegativeNumber(
      accruedBalance,
      "accruedBalance"
    );

    const carryForward = toNonNegativeNumber(
      carryForwardBalance,
      "carryForwardBalance"
    );

    const adjustment = toNumber(
      adjustmentBalance,
      "adjustmentBalance"
    );

    const expired = toNonNegativeNumber(
      expiredBalance,
      "expiredBalance"
    );

    const user = await User.findOne({
      _id: userId,
      isActive: true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Active user not found.",
      });
    }

    const leaveType = await LeaveType.findOne({
      _id: leaveTypeId,
      isActive: true,
    });

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Active leave type not found.",
      });
    }

    let resultBalance = null;
    let transaction = null;
    let created = false;

    await session.withTransaction(async () => {
      let balance =
        await UserLeaveBalance.findOne({
          userId,
          leaveTypeId,
          leaveYear: year,
        }).session(session);

      const usedBalance = Number(
        balance?.usedBalance || 0
      );

      const pendingBalance = Number(
        balance?.pendingBalance || 0
      );

      const oldAvailable = Number(
        balance?.availableBalance || 0
      );

      const newAvailable =
        calculateAvailableBalance({
          openingBalance: opening,
          accruedBalance: accrued,
          carryForwardBalance: carryForward,
          adjustmentBalance: adjustment,
          usedBalance,
          expiredBalance: expired,
        });

      if (newAvailable < 0) {
        throw Object.assign(
          new Error(
            "Configured balance cannot make available balance negative."
          ),
          { statusCode: 400 }
        );
      }

      if (newAvailable < pendingBalance) {
        throw Object.assign(
          new Error(
            "Configured available balance cannot be less than the existing pending leave balance."
          ),
          { statusCode: 400 }
        );
      }

      if (!balance) {
        balance = new UserLeaveBalance({
          userId,
          leaveTypeId,
          leaveYear: year,
          openingBalance: opening,
          accruedBalance: accrued,
          usedBalance: 0,
          pendingBalance: 0,
          adjustmentBalance: adjustment,
          carryForwardBalance: carryForward,
          expiredBalance: expired,
          availableBalance: newAvailable,
          isActive,
          lastUpdatedAt: new Date(),
        });

        await balance.save({ session });

        created = true;

        transaction = await LeaveBalanceTransaction.create(
          [
            {
              userId,
              leaveTypeId,
              leaveBalanceId: balance._id,
              leaveId: null,
              leaveYear: year,
              transactionType: "Opening Balance",
              amount: newAvailable,
              balanceBefore: 0,
              balanceAfter: newAvailable,
              referenceType: "Manual",
              referenceId: balance._id,
              reason: "Initial leave balance configured by Admin.",
              remarks: null,
              transactionDate: new Date(),
              createdBy: adminId,
            },
          ],
          { session }
        );

        transaction = transaction[0];
      } else {
        balance.openingBalance = opening;
        balance.accruedBalance = accrued;
        balance.adjustmentBalance = adjustment;
        balance.carryForwardBalance = carryForward;
        balance.expiredBalance = expired;
        balance.availableBalance = newAvailable;
        balance.isActive = Boolean(isActive);
        balance.lastUpdatedAt = new Date();

        await balance.save({ session });

        if (oldAvailable !== newAvailable) {
          transaction = await LeaveBalanceTransaction.create(
            [
              {
                userId,
                leaveTypeId,
                leaveBalanceId: balance._id,
                leaveId: null,
                leaveYear: year,
                transactionType: "Manual Adjustment",
                amount: Math.abs(
                  newAvailable - oldAvailable
                ),
                balanceBefore: oldAvailable,
                balanceAfter: newAvailable,
                referenceType: "Manual",
                referenceId: balance._id,
                reason:
                  "Leave balance configuration updated by Admin.",
                remarks: null,
                transactionDate: new Date(),
                createdBy: adminId,
              },
            ],
            { session }
          );

          transaction = transaction[0];
        }
      }

      resultBalance = balance;
    });

    const populatedBalance =
      await getPopulatedBalance(
        resultBalance._id
      );

    return res.status(created ? 201 : 200).json({
      success: true,
      message: created
        ? "Leave balance configured successfully."
        : "Leave balance updated successfully.",
      data: {
        balance: populatedBalance,
        transaction,
      },
    });
  } catch (error) {
    console.error(
      "Upsert Leave Balance Error:",
      error
    );

    return res.status(error.statusCode || 400).json({
      success: false,
      message:
        error.message ||
        "Failed to configure leave balance.",
    });
  } finally {
    await session.endSession();
  }
};

// ============================================================
// BULK CONFIGURE LEAVE BALANCES - ADMIN
// ============================================================

export const bulkConfigureLeaveBalances = async (
  req,
  res
) => {
  const session = await mongoose.startSession();

  try {
    const adminId = await validateAdmin(req);

    const {
      leaveTypeId,
      leaveYear,
      openingBalance = 0,
      accruedBalance = 0,
      carryForwardBalance = 0,
      adjustmentBalance = 0,
      expiredBalance = 0,
      userIds = [],
    } = req.body;

    if (!leaveTypeId || leaveYear === undefined) {
      return res.status(400).json({
        success: false,
        message:
          "leaveTypeId and leaveYear are required.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        leaveTypeId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid leaveTypeId.",
      });
    }

    if (
      !Array.isArray(userIds) ||
      userIds.some(
        (id) =>
          !mongoose.Types.ObjectId.isValid(id)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "userIds must be an array of valid user IDs.",
      });
    }

    const year = ensureValidYear(leaveYear);

    const opening = toNonNegativeNumber(
      openingBalance,
      "openingBalance"
    );

    const accrued = toNonNegativeNumber(
      accruedBalance,
      "accruedBalance"
    );

    const carryForward = toNonNegativeNumber(
      carryForwardBalance,
      "carryForwardBalance"
    );

    const adjustment = toNumber(
      adjustmentBalance,
      "adjustmentBalance"
    );

    const expired = toNonNegativeNumber(
      expiredBalance,
      "expiredBalance"
    );

    const leaveType = await LeaveType.findOne({
      _id: leaveTypeId,
      isActive: true,
    });

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Active leave type not found.",
      });
    }

    const users = await User.find({
      ...(userIds.length
        ? { _id: { $in: userIds } }
        : {}),
      isActive: true,
    }).select("_id userId name email");

    if (!users.length) {
      return res.status(400).json({
        success: false,
        message:
          "No active users found for balance configuration.",
      });
    }

    let createdCount = 0;
    let updatedCount = 0;

    await session.withTransaction(async () => {
      for (const user of users) {
        let balance =
          await UserLeaveBalance.findOne({
            userId: user._id,
            leaveTypeId,
            leaveYear: year,
          }).session(session);

        const usedBalance = Number(
          balance?.usedBalance || 0
        );

        const newAvailable =
          calculateAvailableBalance({
            openingBalance: opening,
            accruedBalance: accrued,
            carryForwardBalance: carryForward,
            adjustmentBalance: adjustment,
            usedBalance,
            expiredBalance: expired,
          });

        if (newAvailable < 0) {
          throw Object.assign(
            new Error(
              `Configured balance for ${user.name || user.userId} cannot be negative.`
            ),
            { statusCode: 400 }
          );
        }

        const pendingBalance = Number(
          balance?.pendingBalance || 0
        );

        if (newAvailable < pendingBalance) {
          throw Object.assign(
            new Error(
              `Configured balance for ${user.name || user.userId} cannot be less than the existing pending leave balance.`
            ),
            { statusCode: 400 }
          );
        }

        if (!balance) {
          balance = new UserLeaveBalance({
            userId: user._id,
            leaveTypeId,
            leaveYear: year,
            openingBalance: opening,
            accruedBalance: accrued,
            usedBalance: 0,
            pendingBalance: 0,
            adjustmentBalance: adjustment,
            carryForwardBalance: carryForward,
            expiredBalance: expired,
            availableBalance: newAvailable,
            isActive: true,
            lastUpdatedAt: new Date(),
          });

          await balance.save({ session });

          await LeaveBalanceTransaction.create(
            [
              {
                userId: user._id,
                leaveTypeId,
                leaveBalanceId: balance._id,
                leaveId: null,
                leaveYear: year,
                transactionType: "Opening Balance",
                amount: newAvailable,
                balanceBefore: 0,
                balanceAfter: newAvailable,
                referenceType: "Manual",
                referenceId: balance._id,
                reason:
                  "Initial leave balance configured by Admin.",
                remarks: null,
                transactionDate: new Date(),
                createdBy: adminId,
              },
            ],
            { session }
          );

          createdCount += 1;
        } else {
          const oldAvailable = Number(
            balance.availableBalance || 0
          );

          balance.openingBalance = opening;
          balance.accruedBalance = accrued;
          balance.adjustmentBalance = adjustment;
          balance.carryForwardBalance = carryForward;
          balance.expiredBalance = expired;
          balance.availableBalance = newAvailable;
          balance.isActive = true;
          balance.lastUpdatedAt = new Date();

          await balance.save({ session });

          if (oldAvailable !== newAvailable) {
            await LeaveBalanceTransaction.create(
              [
                {
                  userId: user._id,
                  leaveTypeId,
                  leaveBalanceId: balance._id,
                  leaveId: null,
                  leaveYear: year,
                  transactionType: "Manual Adjustment",
                  amount: Math.abs(
                    newAvailable - oldAvailable
                  ),
                  balanceBefore: oldAvailable,
                  balanceAfter: newAvailable,
                  referenceType: "Manual",
                  referenceId: balance._id,
                  reason:
                    "Leave balance configuration updated by Admin.",
                  remarks: null,
                  transactionDate: new Date(),
                  createdBy: adminId,
                },
              ],
              { session }
            );
          }

          updatedCount += 1;
        }
      }
    });

    return res.status(200).json({
      success: true,
      message:
        "Leave balances configured successfully.",
      data: {
        totalUsers: users.length,
        createdCount,
        updatedCount,
      },
    });
  } catch (error) {
    console.error(
      "Bulk Configure Leave Balances Error:",
      error
    );

    return res.status(error.statusCode || 400).json({
      success: false,
      message:
        error.message ||
        "Failed to configure leave balances.",
    });
  } finally {
    await session.endSession();
  }
};

// ============================================================
// UPDATE BALANCE BY ID - ADMIN
// ============================================================

export const updateLeaveBalance = async (req, res) => {
  req.body.userId = undefined;
  req.body.leaveTypeId = undefined;

  return res.status(400).json({
    success: false,
    message:
      "Use the balance configuration endpoint with userId and leaveTypeId to update a balance.",
  });
};
