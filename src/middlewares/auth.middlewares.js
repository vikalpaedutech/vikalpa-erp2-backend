import {User} from "../models/user.models.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import jwt from "jsonwebtoken";

//verifying jwt
export const verifyJWT = asyncHandler(async(req, res, next)=>{

  
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")

    //req.header("Authorization")?.replace("Bearer ", "") ---> this line is for if we are sending tokens in phones (android or ios)

    if(!token){
        throw new ApiError(401, "Unauthorized request!")
    }

    //If we get the token, then we decode it.

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
       const user =  await User.findById(decodedToken?._id).select(
            "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
        );

    if(!user){
        throw new ApiError(401, "Invalid access token")
    }

    if (user.isActive === false) {
        throw new ApiError(
            403,
            "Your account is inactive. Please contact the administrator."
        );
    }

    req.user = user
    
    next();

    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        throw new ApiError(401, "Invalid access token")
    }
})