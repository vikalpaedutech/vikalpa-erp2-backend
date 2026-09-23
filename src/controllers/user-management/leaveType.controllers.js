import { LeaveType } from "../../models/hr-management/leaveType.models.js"


// Create Leave Type

export const createLeaveType = async (req, res) => {
  try {
    const {
      name,
      code,
      isPaid,
      isActive,
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: "Name and code are required.",
      });
    }

    const existingLeaveType = await LeaveType.findOne({
      $or: [
        { name: name.trim() },
        { code: code.trim().toUpperCase() },
      ],
    });

    if (existingLeaveType) {
      return res.status(409).json({
        success: false,
        message: "Leave type with this name or code already exists.",
      });
    }

    const leaveType = await LeaveType.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      isPaid:
        typeof isPaid === "boolean"
          ? isPaid
          : false,
      isActive:
        typeof isActive === "boolean"
          ? isActive
          : true,
    });

    return res.status(201).json({
      success: true,
      message: "Leave type created successfully.",
      data: leaveType,
    });
  } catch (error) {
    console.error("Create Leave Type Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create leave type.",
      error: error.message,
    });
  }
};

// Get All Leave Types
export const getLeaveTypes = async (req, res) => {
  try {
    const {
      isActive,
      search,
    } = req.query;

    const filter = {};

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    if (search) {
      filter.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },
        {
          code: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const leaveTypes = await LeaveType.find(filter)
      .sort({
        name: 1,
      });

    return res.status(200).json({
      success: true,
      message: "Leave types fetched successfully.",
      data: leaveTypes,
    });
  } catch (error) {
    console.error("Get Leave Types Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch leave types.",
      error: error.message,
    });
  }
};

// Get Leave Type By ID
export const getLeaveTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    const leaveType = await LeaveType.findById(id);

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Leave type fetched successfully.",
      data: leaveType,
    });
  } catch (error) {
    console.error("Get Leave Type By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch leave type.",
      error: error.message,
    });
  }
};

// Update Leave Type
export const updateLeaveType = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      code,
      isPaid,
      isActive,
    } = req.body;

    const leaveType = await LeaveType.findById(id);

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found.",
      });
    }

    if (name !== undefined || code !== undefined) {
      const duplicateFilter = {
        _id: {
          $ne: id,
        },
        $or: [],
      };

      if (name !== undefined) {
        duplicateFilter.$or.push({
          name: name.trim(),
        });
      }

      if (code !== undefined) {
        duplicateFilter.$or.push({
          code: code.trim().toUpperCase(),
        });
      }

      if (duplicateFilter.$or.length > 0) {
        const existingLeaveType =
          await LeaveType.findOne(duplicateFilter);

        if (existingLeaveType) {
          return res.status(409).json({
            success: false,
            message:
              "Another leave type with this name or code already exists.",
          });
        }
      }
    }

    if (name !== undefined) {
      leaveType.name = name.trim();
    }

    if (code !== undefined) {
      leaveType.code = code.trim().toUpperCase();
    }

    if (typeof isPaid === "boolean") {
      leaveType.isPaid = isPaid;
    }

    if (typeof isActive === "boolean") {
      leaveType.isActive = isActive;
    }

    await leaveType.save();

    return res.status(200).json({
      success: true,
      message: "Leave type updated successfully.",
      data: leaveType,
    });
  } catch (error) {
    console.error("Update Leave Type Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update leave type.",
      error: error.message,
    });
  }
};

// Delete Leave Type
export const deleteLeaveType = async (req, res) => {
  try {
    const { id } = req.params;

    const leaveType = await LeaveType.findById(id);

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found.",
      });
    }

    leaveType.isActive = false;

    await leaveType.save();

    return res.status(200).json({
      success: true,
      message: "Leave type deactivated successfully.",
      data: leaveType,
    });
  } catch (error) {
    console.error("Delete Leave Type Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate leave type.",
      error: error.message,
    });
  }
};