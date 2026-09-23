import {User} from "../models/user.models.js"
import {ApiResponse} from "../utils/api-response.js"
import { asyncHandler } from "../utils/async-handler.js"
import {ApiError} from "../utils/api-error.js"
import {emailVerificationMailgenContent, forgotPasswordMailgenContent, sendEmail} from "../utils/mail.js"
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getUserAccess,
    getUserAccessScope
 } from "../services/user-managment/authorization.services.js";

//general controller for generating AccessandRefreshToken using userSchema methods in: src\models\user.models.js
const generateAccessAndRefreshTokens = async(userId) => {


    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave:false})
        return {accessToken, refreshToken}
        
    } catch (error) {
        throw new ApiError(
            500,
            "Something went wrong while generrating access token"
        )
        
    }
}


const registerUser= asyncHandler(async(req, res) => {

    const {email, name, contact, password } = req.body;

    const existedUser = await User.findOne({
        $or:[{email}, {contact}]
    })

    if (existedUser){
        throw new ApiError (409, "User with Email or contact already exist!", [])
    }

    const user = await User.create({
        email,
        password,
        name,
        contact,
        isEmailVerified: false
    })

    //generating temporary token
   const {unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken()

   //email verification and expiry
   user.emailVerificationToken = hashedToken
   user.emailVerificationExpiry = tokenExpiry

   await user.save({validateBeforeSave:false})

   //Sending mail to user
   await sendEmail(
    {
        email: user?.email,
        subject: "Please verify your email",
        mailgenContent: emailVerificationMailgenContent(
            user.name,
            `${req.protocol}://${req.get("host")}/api/v1/auth/verify-email/${unHashedToken}`
        )
    }
   )
   //creating user response response (and selective response by -fieldName)
  const createdUser =  await User.findById(user._id).select(
    "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
   )

   if (!createdUser) {
    throw new ApiError(500,
        "Something went wrong while registering a user"
    )
   }

   //once everything is done we send back the response

   return res.status(201)
             .json(new ApiResponse(200,
                {user:createdUser},
                "User registered successfully and verification email has been sent on your email"
             ))
})



//login user
const login = asyncHandler(async(req, res)=>{
    const {email, password, contact} = req.body;

    if (!email && !contact){
        throw new ApiError(400, "email or contact is required")
    }

    // const user = await User.findOne({email});

   const user = await User.findOne({
    $or: [
        ...(email ? [{ email: email.toLowerCase() }] : []),
        ...(contact ? [{ contact: contact }] : [])
    ]
});

    if(!user){
        throw new ApiError(400, "User does not exist")
    }

    if (user.isActive === false) {
        throw new ApiError(
            403,
            "Your account is inactive. Please contact the administrator."
        );
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid){
        throw new ApiError(400, "Invalid credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);


//restricts the some data in returned data like "-password -refreshToken...etc"
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
    )

    //sending the data in cookies

    const options = {
        httpOnly: true,
        secure: false
    }

    //send the response and return the cookies
    return res.status(200)
              .cookie("accessToken", accessToken, options)
              .cookie("refreshToken", refreshToken, options)
              .json(
                new ApiResponse(
                    200,
                    {
                        user: loggedInUser,
                        accessToken,
                        refreshToken
                    },
                    "User logged in successfully!"
                )
              )
})





//logout user
const logoutUser = asyncHandler(async(req, res)=>{
    await User.findByIdAndUpdate(
        req.user._id, //--->this id comes from verifyJwt, read docs\#15LogoutUserSecurely.md
        {
            $set:{
                refreshToken: ""
            }
        },
        {
            new: true
        }
    );

    //removing cookies and all the traces in database
    const options = {
        httpOnly: true,
        secure:false
    }

    //send the response and clear the cookies
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(
                200,
                {},
                "User logged out"
            )
        )

})


//Get current user
const getCurrentUser = asyncHandler(async(req, res)=>{

    //returning response
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                req.user,
                "Current user fetched successfully."
            )
        )
})



// Get current user's roles and permissions
const getMyAccess = asyncHandler(async (req, res) => {

    const access = await getUserAccess(req.user._id);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                access,
                "User access fetched successfully."
            )
        );
});


// Get current user's program, batch and region access
const getMyAccessScope = asyncHandler(async (req, res) => {

    const accessScope = await getUserAccessScope(req.user._id);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                accessScope,
                "User access scope fetched successfully."
            )
        );
});

//Verify email
const verifyEmail = asyncHandler(async(req, res) => {
    const {verificationToken} = req.params;



    if(!verificationToken) {

        throw new ApiError(
            400,
            "Email verification token is missing"
        )
    }

    //we stored the hashed token in databse, and sent the unhashed token to the user in email button link
    // we need to encrypt the token sent to user. This will give the same hashed token as in database. then we can...
    //...search the user based on either email or hashed value
    let hashedToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex")

//find the token and emailVerificationExpiry
   const user =  await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: {$gt: Date.now()}
    })

    //if no user found or expiry exceeds then:

    if(!user){
        throw new ApiError(
            400,
            "Token is invalid or expired"
        )
    }

//Once email is verified we can set following fields to undefined (which is optional)
user.emailVerificationToken = undefined;
user.emailVerificationExpiry = undefined;

//If token emailVerificationToken found and emailVerificationExpirt did not exceed then we mark...
//...isEmailVerified flag to true

user.isEmailVerified = true;
await user.save({validateBeforeSave:false})

//Send the response
return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            {
                isEmailVerified:true
            },
            "Email is verified"
        )
    )
    
})




//Resend email verification
const resendEmailVerification = asyncHandler(async(req, res)=>{
    const user = await User.findById(req.user?._id);

    if(!user){
        throw new ApiError(
            404,
            "Usesr does not exist"
        )
    }

    if(user.isEmailVerified){
        throw new ApiError(
            409, 
            "Email is already verified"
        )
    }



    //generating temporary token
   const {unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken()

   //email verification and expiry
   user.emailVerificationToken = hashedToken
   user.emailVerificationExpiry = tokenExpiry

   await user.save({validateBeforeSave:false})

   //Sending mail to user

   await sendEmail(
    {
        email: user?.email,
        subject: "Please verify your email",
        mailgenContent: emailVerificationMailgenContent(
            user.name,
            `${req.protocol}://${req.get("host")}/api/v1/users/verify-email/${unHashedToken}`
        )
    }
   )

   //once everything is done we send back the response

   return res.status(200)
             .json(new ApiResponse(200,
                {},
                "Mail has been sent to your email Id"
             ))
})




// //refresh access token
// const refreshAccessToken = asyncHandler(async(req, res)=>{
//     const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

//     if(!incomingRefreshToken){

//         throw new ApiError(
//             401,
//             "Unauthorised access"
//         )
//     }

//     try {
//         const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)

//         const user = await User.findById(decodedToken?._id);

//         if(!user){
//             throw new ApiError(
//                 401, 
//                 "Invalid refresh token"
//             )
//         }

//         //checking if access token is expired
//         if(incomingRefreshToken !== user?.refreshToken){
//             throw new ApiError(401,
//                 "Refresh token is expired"
//             )
//         }

//         //if access token is expired, then generate new access token on the basis of refreshtoken
//         const options = {
//             httpOnly: true,
//             secure:false
//         }

//         //generate the access token baed on _id
//         const {accessToken, refreshToken:newRefreshToken} = await generateAccessAndRefreshTokens(user?._id)

//         //now update the refresh token in database.
//          user.refreshToken= newRefreshToken
        
//          await user.save();

//          return res 
//             .status(200)
//             .cookie("accessToken", accessToken, options)
//             .cookie("refreshToken", newRefreshToken, options)
//             .json(
//                 new ApiResponse(
//                     200,
//                     {accessToken,
//                     refreshToken:newRefreshToken},
//                     "Access token refreshed"
//                 )
//             )

//     } catch (error) {
//             throw new ApiError(
//                 401,
//                 "Invalid refresh token"
//             )
//     }
// })




const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(
            401,
            "Refresh token is required"
        );
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(
                401,
                "Invalid refresh token"
            );
        }

        if (user.isActive === false) {
            throw new ApiError(
                403,
                "Your account is inactive. Please contact the administrator."
            );
        }

        if (
            !user.refreshToken ||
            incomingRefreshToken !== user.refreshToken
        ) {
            throw new ApiError(
                401,
                "Refresh token is expired or invalid"
            );
        }

        const {
            accessToken,
            refreshToken: newRefreshToken
        } = await generateAccessAndRefreshTokens(user._id);

        const options = {
            httpOnly: true,
            secure: false,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        accessToken,
                        refreshToken: newRefreshToken,
                    },
                    "Access token refreshed"
                )
            );

    } catch (error) {

        if (error instanceof ApiError) {
            throw error;
        }

        throw new ApiError(
            401,
            "Invalid or expired refresh token"
        );
    }
});






//forgot password

const forgotPasswordRequest = asyncHandler(async(req, res)=>{


    const {email} = req.body;

    const user = await User.findOne({email})

    if(!user){
        throw new ApiError(
            404,
            "User does not exist",
            []
        )
    }

    //if user was found then,
    const {unHashedToken, hashedToken, tokenExpiry} = user.generateTemporaryToken()

    user.forgotPasswordToken = hashedToken;
    user.forgotPasswordExpiry = tokenExpiry;

    await user.save({ validateBeforeSave: false });

    //now send email
    await sendEmail({
        email: user?.email,
        subject: "Password reset request",
        mailgenContent: forgotPasswordMailgenContent(
            user.name,
            // `${req.protocol}://${req.get("host")}/api/v1/users/verify-email/${unHashedToken}` ---> either we can do this, 
            //...or get url from env like below

            `${process.env.FORGOT_PASSWORD_REDIRECT_URL}/${unHashedToken}`
        )
    })

    //sending response
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password reset mail has been sent on your registered email id."
            )
        )
    
})







//reset forgot password
const resetForgotPassword = asyncHandler(async(req, res)=>{

    //in this we get data in two ways: params & and body
    const {resetToken} = req.params;
    const {newPassword} = req.body;

    //resetToken will be unhasehed so, we need to get hashed token first
    // let hashedToken = crypto
    //     .createHash("sha256")
    //     .update("resetToken")
    //     .digest("hex")


    let hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex")
    

    //now we find the hashed token and its expiry in db and update the new password
    const user = await User.findOne({
        forgotPasswordToken: hashedToken,
        forgotPasswordExpiry:{$gt: Date.now()}
    })

    //if user not found then, throw error
    if(!user){
        throw new ApiError(
            489, "Token is invalid or expired"
        )
    }

    //if user found then update the password and set the forgotPasswordToken and expiry to undefined
    user.forgotPasswordExpiry = undefined;
    user.forgotPasswordToken = undefined;
    
    user.password = newPassword;

    await user.save({validateBeforeSave:false})

    //return respnose
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password reset successfully"
            )
        )

})


//change current password
const changeCurrentPassword = asyncHandler(async(req, res)=>{

    //user will give oldPassword and newPassword
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user?._id);

    const isPasswordValid = await user.isPasswordCorrect(oldPassword)

    //if password not valid
    if(!isPasswordValid){
        throw new ApiError(
            400,
            "Invalid old password"
        )
    }

    //if the password valid, save it into database.
    user.password = newPassword;
    await user.save({validateBeforeSave:false});

    //return the response
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password changed successfully"
            )
        )
})




export {registerUser, login,
    logoutUser, verifyEmail, resendEmailVerification,
    refreshAccessToken,
    forgotPasswordRequest,
    resetForgotPassword,
    changeCurrentPassword,
    getCurrentUser,
    getMyAccess,
    getMyAccessScope
}


