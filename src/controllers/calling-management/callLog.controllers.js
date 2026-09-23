
import mongoose from "mongoose";

import { CallLog } from "../../models/calling-management/callLog.models.js";
import { CallingDetails } from "../../models/calling-management/callingDetails.models.js";
import { CallingType } from "../../models/calling-management/callingType.models.js";

import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";


// Create Call Log
const createCallLog = asyncHandler(async (req, res) => {
    const {
        callingTypeId,
        callingDetailId,
        callingStatus,
        remark,
        followUpDate,
        comment,
    } = req.body;

    if (!callingTypeId) {
        throw new ApiError(
            400,
            "callingTypeId is required"
        );
    }

    if (!callingDetailId) {
        throw new ApiError(
            400,
            "callingDetailId is required"
        );
    }

    if (!callingStatus) {
        throw new ApiError(
            400,
            "callingStatus is required"
        );
    }


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

    if (
        !mongoose.Types.ObjectId.isValid(
            callingDetailId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingDetailId"
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


    const callingDetails =
        await CallingDetails.findById(
            callingDetailId
        );

    if (!callingDetails) {
        throw new ApiError(
            404,
            "Calling details not found"
        );
    }


    if (
        callingDetails.callingTypeId.toString() !==
        callingTypeId.toString()
    ) {
        throw new ApiError(
            400,
            "Calling details does not belong to this calling type"
        );
    }


    const callLog =
        await CallLog.create({
            callingTypeId,

            callingDetailId,

            callingStatus:
                callingStatus.trim(),

            remark:
                remark?.trim() || "",

            followUpDate:
                followUpDate || null,

            comment:
                comment?.trim() || "",

            calledBy:
                req.user._id,
        });


    return res.status(201).json(
        new ApiResponse(
            201,
            { callLog },
            "Call log created successfully"
        )
    );
});


// Get All Call Logs
const getCallLogs = asyncHandler(async (req, res) => {
    let {
        page = 1,
        limit = 20,
        callingTypeId,
        callingDetailId,
        calledBy,
        callingStatus,
        followUpDate,
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


    if (callingTypeId) {
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

        query.callingTypeId =
            callingTypeId;
    }


    if (callingDetailId) {
        if (
            !mongoose.Types.ObjectId.isValid(
                callingDetailId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid callingDetailId"
            );
        }

        query.callingDetailId =
            callingDetailId;
    }


    if (calledBy) {
        if (
            !mongoose.Types.ObjectId.isValid(
                calledBy
            )
        ) {
            throw new ApiError(
                400,
                "Invalid calledBy"
            );
        }

        query.calledBy =
            calledBy;
    }


    if (callingStatus) {
        query.callingStatus =
            callingStatus;
    }


    if (followUpDate) {
        const startDate =
            new Date(followUpDate);

        if (
            Number.isNaN(
                startDate.getTime()
            )
        ) {
            throw new ApiError(
                400,
                "Invalid followUpDate"
            );
        }

        const endDate =
            new Date(startDate);

        endDate.setDate(
            endDate.getDate() + 1
        );

        query.followUpDate = {
            $gte: startDate,
            $lt: endDate,
        };
    }


    const [
        callLogs,
        total,
    ] = await Promise.all([
        CallLog.find(query)
            .populate(
                "callingTypeId",
                "callingTitle callingTypeCode callingTo"
            )
            .populate(
                "callingDetailId"
            )
            .populate(
                "calledBy",
                "name email"
            )
            .sort({
                createdAt: -1,
            })
            .skip(skip)
            .limit(limit),

        CallLog.countDocuments(
            query
        ),
    ]);


    return res.status(200).json(
        new ApiResponse(
            200,
            {
                callLogs,

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
            "Call logs fetched successfully"
        )
    );
});


// Get Call Log By ID
const getCallLogById = asyncHandler(async (req, res) => {
    const {
        callLogId,
    } = req.params;


    if (
        !mongoose.Types.ObjectId.isValid(
            callLogId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callLogId"
        );
    }


    const callLog =
        await CallLog.findById(
            callLogId
        )
            .populate(
                "callingTypeId"
            )
            .populate(
                "callingDetailId"
            )
            .populate(
                "calledBy",
                "name email"
            );


    if (!callLog) {
        throw new ApiError(
            404,
            "Call log not found"
        );
    }


    return res.status(200).json(
        new ApiResponse(
            200,
            { callLog },
            "Call log fetched successfully"
        )
    );
});


// Update Call Log
const updateCallLog = asyncHandler(async (req, res) => {
    const {
        callLogId,
    } = req.params;


    if (
        !mongoose.Types.ObjectId.isValid(
            callLogId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callLogId"
        );
    }


    const callLog =
        await CallLog.findById(
            callLogId
        );


    if (!callLog) {
        throw new ApiError(
            404,
            "Call log not found"
        );
    }


    const {
        callingTypeId,
        callingDetailId,
        callingStatus,
        remark,
        followUpDate,
        comment,
    } = req.body;


    if (callingTypeId !== undefined) {
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


        callLog.callingTypeId =
            callingTypeId;
    }


    if (callingDetailId !== undefined) {
        if (
            !mongoose.Types.ObjectId.isValid(
                callingDetailId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid callingDetailId"
            );
        }


        const callingDetails =
            await CallingDetails.findById(
                callingDetailId
            );

        if (!callingDetails) {
            throw new ApiError(
                404,
                "Calling details not found"
            );
        }


        const finalCallingTypeId =
            callingTypeId !== undefined
                ? callingTypeId
                : callLog.callingTypeId;


        if (
            callingDetails.callingTypeId.toString() !==
            finalCallingTypeId.toString()
        ) {
            throw new ApiError(
                400,
                "Calling details does not belong to this calling type"
            );
        }


        callLog.callingDetailId =
            callingDetailId;
    }


    if (callingStatus !== undefined) {
        if (!callingStatus.trim()) {
            throw new ApiError(
                400,
                "callingStatus cannot be empty"
            );
        }

        callLog.callingStatus =
            callingStatus.trim();
    }


    if (remark !== undefined) {
        callLog.remark =
            remark?.trim() || "";
    }


    if (followUpDate !== undefined) {
        if (followUpDate === null || followUpDate === "") {
            callLog.followUpDate = null;
        } else {
            const parsedDate =
                new Date(followUpDate);

            if (
                Number.isNaN(
                    parsedDate.getTime()
                )
            ) {
                throw new ApiError(
                    400,
                    "Invalid followUpDate"
                );
            }

            callLog.followUpDate =
                parsedDate;
        }
    }


    if (comment !== undefined) {
        callLog.comment =
            comment?.trim() || "";
    }


    await callLog.save();


    return res.status(200).json(
        new ApiResponse(
            200,
            { callLog },
            "Call log updated successfully"
        )
    );
});


// Delete Call Log
const deleteCallLog = asyncHandler(async (req, res) => {
    const {
        callLogId,
    } = req.params;


    if (
        !mongoose.Types.ObjectId.isValid(
            callLogId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callLogId"
        );
    }


    const callLog =
        await CallLog.findByIdAndDelete(
            callLogId
        );


    if (!callLog) {
        throw new ApiError(
            404,
            "Call log not found"
        );
    }


    return res.status(200).json(
        new ApiResponse(
            200,
            { callLog },
            "Call log deleted successfully"
        )
    );
});



// Create Call Attempt
const createCallAttempt = asyncHandler(async (req, res) => {
    const {
        callingDetailId,
        callingStatus,
        remark,
        comment,
        followUpDate,
    } = req.body;


    // ============================================================
    // VALIDATE CALLING DETAIL ID
    // ============================================================

    if (!callingDetailId) {
        throw new ApiError(
            400,
            "callingDetailId is required"
        );
    }


    if (
        !mongoose.Types.ObjectId.isValid(
            callingDetailId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingDetailId"
        );
    }


    // ============================================================
    // VALIDATE STATUS
    // ============================================================

    if (!callingStatus) {
        throw new ApiError(
            400,
            "callingStatus is required"
        );
    }


    // ============================================================
    // FIND CALLING DETAIL
    // ============================================================

    const callingDetails =
        await CallingDetails.findById(
            callingDetailId
        );


    if (!callingDetails) {
        throw new ApiError(
            404,
            "Calling details not found"
        );
    }


    // ============================================================
    // FIND CALLING TYPE
    // ============================================================

    const callingType =
        await CallingType.findById(
            callingDetails.callingTypeId
        );


    if (!callingType) {
        throw new ApiError(
            404,
            "Calling type not found"
        );
    }


    // ============================================================
    // VALIDATE CALLING STATUS
    // ============================================================

    if (
        callingType.callingStatus?.length &&
        !callingType.callingStatus.includes(
            callingStatus
        )
    ) {
        throw new ApiError(
            400,
            `Invalid calling status "${callingStatus}"`
        );
    }


    // ============================================================
    // CHECK ASSIGNMENT
    // ============================================================

    const currentUserId =
        req.user._id.toString();


    const isAssigned =
        callingDetails.assignedTo?.some(
            (userId) =>
                userId.toString() ===
                currentUserId
        );


    const isAdmin =
        req.user.isAdmin === true;


    if (
        !isAssigned &&
        !isAdmin
    ) {
        throw new ApiError(
            403,
            "You are not assigned to this calling record"
        );
    }


    // ============================================================
    // UPDATE CALLING DETAILS
    // ============================================================

    callingDetails.callingStatus =
        callingStatus.trim();


    callingDetails.remark =
        remark?.trim() || "";


    callingDetails.comment =
        comment?.trim() || "";


    await callingDetails.save();


    // ============================================================
    // CREATE CALL LOG
    // ============================================================

    const callLog =
        await CallLog.create({
            callingTypeId:
                callingDetails.callingTypeId,

            callingDetailId:
                callingDetails._id,

            callingStatus:
                callingStatus.trim(),

            remark:
                remark?.trim() || "",

            followUpDate:
                followUpDate || null,

            comment:
                comment?.trim() || "",

            calledBy:
                req.user._id,
        });


    // ============================================================
    // RESPONSE
    // ============================================================

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                callingDetails,
                callLog,
            },
            "Call attempt recorded successfully"
        )
    );
});


export {
    createCallLog,
    getCallLogs,
    getCallLogById,
    updateCallLog,
    deleteCallLog,
    createCallAttempt 
};