import {body} from "express-validator";

const userRegisterValidator = () => {

    return [
        body("email")
            .trim()
            .notEmpty()
            .withMessage("Email is required")
            .isEmail()
            .withMessage("Email is invalid"),
        body("password")
            .trim()
            .notEmpty()
            .withMessage("Password is required")
            
    ]
}


const userLoginValidator = () => {
    return [
        body("email")
        .optional()
        .isEmail()
        .withMessage("Email is invalid"),
        body("password")
        .notEmpty()
        .withMessage("Password is required")
    ]
}


const userChangeCurrentPasswordValidator = () => {
    return [
        body("oldPassword").notEmpty().withMessage("Old password is required"),
        body("newPassword").notEmpty().withMessage("New password is required")
    ]
}



const userForgotPasswordValidator = () => {

    return [
        body("email").notEmpty().withMessage("Email is required")
                     .isEmail().withMessage("Email is invalid")
                     
        
    ]
}


const userResetForgotPasswordValidator = () =>{
     return [
        body("newPassword").notEmpty().withMessage("Password is required")
     ]
}

export{
    userRegisterValidator,
    userLoginValidator,
    userChangeCurrentPasswordValidator,
    userForgotPasswordValidator,
    userResetForgotPasswordValidator
}