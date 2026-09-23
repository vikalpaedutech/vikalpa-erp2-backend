import { UserAccess } from "../../models/user-management/userAccess.models.js";
import { User } from "../../models/user.models.js";
import { Program } from "../../models/program-management/prgroam.models.js";
import { Batch } from "../../models/program-management/batch.models.js";

import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";



const createUserAccess = asyncHandler(async (req, res) => {

    const { userId, programIds = [], batchIds = [] } = req.body;

    if (!userId) {
        throw new ApiError(
            400,
            "User ID is required"
        );
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(
            404,
            "User does not exist"
        );
    }

    const existingUserAccess = await UserAccess.findOne({
        userId
    });

    if (existingUserAccess) {
        throw new ApiError(
            409,
            "User access already exists"
        );
    }

    const userAccess = await UserAccess.create({
        userId,
        programIds,
        batchIds
    });

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                userAccess,
                "User access created successfully."
            )
        );
});




const getAllUserAccess = asyncHandler(async (req, res) => {

    const userAccess = await UserAccess.find()
        .populate({
            path: "userId",
            select: "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
        })
        .populate("programIds")
        .populate("batchIds");

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                userAccess,
                "User access fetched successfully."
            )
        );
});


const getUserAccessByUserId = asyncHandler(async (req, res) => {

    const { userId } = req.params;

    const userAccess = await UserAccess.findOne({
        userId
    })
        .populate({
            path: "userId",
            select: "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
        })
        .populate("programIds")
        .populate("batchIds");

    if (!userAccess) {
        throw new ApiError(
            404,
            "User access not found"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                userAccess,
                "User access fetched successfully."
            )
        );
});



const updateUserAccess = asyncHandler(async (req, res) => {

    const { userAccessId } = req.params;

    const { programIds, batchIds } = req.body;

    const userAccess = await UserAccess.findByIdAndUpdate(
        userAccessId,
        {
            $set: {
                ...(programIds !== undefined && { programIds }),
                ...(batchIds !== undefined && { batchIds })
            }
        },
        {
            new: true,
            runValidators: true
        }
    )
        .populate("programIds")
        .populate("batchIds");

    if (!userAccess) {
        throw new ApiError(
            404,
            "User access not found"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                userAccess,
                "User access updated successfully."
            )
        );
});





const deleteUserAccess = asyncHandler(async (req, res) => {

    const { userAccessId } = req.params;

    const userAccess = await UserAccess.findByIdAndDelete(
        userAccessId
    );

    if (!userAccess) {
        throw new ApiError(
            404,
            "User access not found"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "User access deleted successfully."
            )
        );
});






export {
    createUserAccess,
    getAllUserAccess,
    getUserAccessByUserId,
    updateUserAccess,
    deleteUserAccess
};