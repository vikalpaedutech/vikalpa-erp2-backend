import mongoose from "mongoose";

import { CallingType } from "../../models/calling-management/callingType.models.js";

import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";


// Create Calling Type
const createCallingType = asyncHandler(async (req, res) => {
    const {
        callingTitle,
        callingTypeCode,
        callingTo,
        description,
        callingStatus,
        callingRemark,
        isActive,
    } = req.body;

    if (
        !callingTitle ||
        !callingTypeCode ||
        !callingTo
    ) {
        throw new ApiError(
            400,
            "callingTitle, callingTypeCode and callingTo are required"
        );
    }

    const normalizedCode =
        callingTypeCode.trim().toUpperCase();

    const existingCallingType =
        await CallingType.findOne({
            callingTypeCode: normalizedCode,
        });

    if (existingCallingType) {
        throw new ApiError(
            409,
            "Calling type with this callingTypeCode already exists"
        );
    }

    const callingType =
        await CallingType.create({
            callingTitle: callingTitle.trim(),

            callingTypeCode: normalizedCode,

            callingTo: callingTo.trim(),

            description:
                description?.trim() || "",

            callingStatus:
                Array.isArray(callingStatus)
                    ? callingStatus
                    : [],

            callingRemark:
                callingRemark || {
                    connected: [],
                    notConnected: [],
                },

            isActive:
                isActive !== undefined
                    ? isActive
                    : true,
        });

    return res.status(201).json(
        new ApiResponse(
            201,
            { callingType },
            "Calling type created successfully"
        )
    );
});


// Get All Calling Types
const getCallingTypes = asyncHandler(async (req, res) => {
    let {
        page = 1,
        limit = 20,
        search = "",
        isActive,
    } = req.query;

    page = Math.max(
        Number(page) || 1,
        1
    );

    limit = Math.min(
        Math.max(
            Number(limit) || 20,
            1
        ),
        100
    );

    const skip =
        (page - 1) * limit;

    const query = {};

    if (search.trim()) {
        query.$or = [
            {
                callingTitle: {
                    $regex: search.trim(),
                    $options: "i",
                },
            },
            {
                callingTypeCode: {
                    $regex: search.trim(),
                    $options: "i",
                },
            },
            {
                callingTo: {
                    $regex: search.trim(),
                    $options: "i",
                },
            },
        ];
    }

    if (
        isActive !== undefined &&
        isActive !== ""
    ) {
        query.isActive =
            isActive === "true";
    }

    const [
        callingTypes,
        total,
    ] = await Promise.all([
        CallingType.find(query)
            .sort({
                createdAt: -1,
            })
            .skip(skip)
            .limit(limit),

        CallingType.countDocuments(query),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                callingTypes,

                pagination: {
                    page,
                    limit,
                    total,
                    totalPages:
                        Math.ceil(
                            total / limit
                        ),
                },
            },
            "Calling types fetched successfully"
        )
    );
});


// Get Calling Type By ID
const getCallingTypeById = asyncHandler(async (req, res) => {
    const { callingTypeId } = req.params;

    if (
        !mongoose.Types.ObjectId.isValid(
            callingTypeId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingTypeId"
        );
    }

    const callingType =
        await CallingType.findById(
            callingTypeId
        );

    if (!callingType) {
        throw new ApiError(
            404,
            "Calling type not found"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { callingType },
            "Calling type fetched successfully"
        )
    );
});


// Update Calling Type
const updateCallingType = asyncHandler(async (req, res) => {
    const { callingTypeId } = req.params;

    if (
        !mongoose.Types.ObjectId.isValid(
            callingTypeId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingTypeId"
        );
    }

    const {
        callingTitle,
        callingTypeCode,
        callingTo,
        description,
        callingStatus,
        callingRemark,
        isActive,
    } = req.body;

    const callingType =
        await CallingType.findById(
            callingTypeId
        );

    if (!callingType) {
        throw new ApiError(
            404,
            "Calling type not found"
        );
    }


    // Calling Type Code
    if (
        callingTypeCode !== undefined
    ) {
        const normalizedCode =
            callingTypeCode
                .trim()
                .toUpperCase();

        const existingCallingType =
            await CallingType.findOne({
                callingTypeCode:
                    normalizedCode,

                _id: {
                    $ne: callingTypeId,
                },
            });

        if (existingCallingType) {
            throw new ApiError(
                409,
                "Calling type with this callingTypeCode already exists"
            );
        }

        callingType.callingTypeCode =
            normalizedCode;
    }


    // Calling Title
    if (
        callingTitle !== undefined
    ) {
        callingType.callingTitle =
            callingTitle.trim();
    }


    // Calling To
    if (
        callingTo !== undefined
    ) {
        callingType.callingTo =
            callingTo.trim();
    }


    // Description
    if (
        description !== undefined
    ) {
        callingType.description =
            description.trim();
    }


    // Calling Status
    if (
        callingStatus !== undefined
    ) {
        if (
            !Array.isArray(
                callingStatus
            )
        ) {
            throw new ApiError(
                400,
                "callingStatus must be an array"
            );
        }

        callingType.callingStatus =
            callingStatus;
    }


    // Calling Remark
    if (
        callingRemark !== undefined
    ) {
        if (
            typeof callingRemark !==
                "object" ||
            Array.isArray(
                callingRemark
            )
        ) {
            throw new ApiError(
                400,
                "callingRemark must be an object"
            );
        }

        callingType.callingRemark =
            callingRemark;
    }


    // Active Status
    if (
        isActive !== undefined
    ) {
        callingType.isActive =
            isActive;
    }

    await callingType.save();

    return res.status(200).json(
        new ApiResponse(
            200,
            { callingType },
            "Calling type updated successfully"
        )
    );
});


// Delete Calling Type
const deleteCallingType = asyncHandler(async (req, res) => {
    const { callingTypeId } = req.params;

    if (
        !mongoose.Types.ObjectId.isValid(
            callingTypeId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingTypeId"
        );
    }

    const callingType =
        await CallingType.findByIdAndDelete(
            callingTypeId
        );

    if (!callingType) {
        throw new ApiError(
            404,
            "Calling type not found"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { callingType },
            "Calling type deleted successfully"
        )
    );
});


export {
    createCallingType,
    getCallingTypes,
    getCallingTypeById,
    updateCallingType,
    deleteCallingType,
};