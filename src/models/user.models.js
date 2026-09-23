import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import crypto from "crypto"

const userSchema = new Schema({

    profileimage: {
        type: {
            url: String,
            localPath: String,
        },
        default: {
            url: `https://placehold.co/200x200`,
            localPath: ""
        }
    },
    userId: {
        type: String,
        // required: true,
        unique: true,
        trim: true,

    },
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    contact: { type: String },
    password: {type: String, required: [true, "Password is required"]},
    isActive: {type: Boolean, default:true},
    isEmailVerified:{
        type: Boolean,
        default: false
    },
    refreshToken: {
        type: String
    },
    forgotPasswordToken: {
        type: String
    },
    forgotPasswordExpiry: {
        type: Date
    },
    emailVerificationToken: {
        type: String
    },
    emailVerificationExpiry: {
        type: Date
    },
    
},
{
    timestamps:true
})


//Using bcrypt prehook to hash the password whenver save method is used son userSchema
userSchema.pre("save", async function(next) {

    if(!this.isModified("password")) return next() // only runs further when modifided field is password only

   this.password =  await bcrypt.hash(this.password, 10)
   next()
})

//Writing methods to schema. Matching password
userSchema.methods.isPasswordCorrect = async function(password) {
    return await bcrypt.compare(password, this.password) 
}


//jwt access_token
userSchema.methods.generateAccessToken = function(){
   return jwt.sign(
        {
            _id:this._id,
            email:this.email,
            userId: this.userId,
        }, //payload
        process.env.ACCESS_TOKEN_SECRET,
        {expiresIn: process.env.ACCESS_TOKEN_EXPIRY}
    )
}

//jwt refresh_token
userSchema.methods.generateRefreshToken = function(){
    return jwt.sign(
        {
            _id:this._id
        },
        process.env.REFRESH_TOKEN_SECRET,
        {expiresIn:process.env.REFRESH_TOKEN_EXPIRY}
    )
}


//generating temporary token
userSchema.methods.generateTemporaryToken = function(){
    const unHashedToken = crypto.randomBytes(20).toString("hex")

    const hashedToken = crypto.createHash("sha256").update(unHashedToken).digest("hex")

    const tokenExpiry = Date.now() + (20*60*1000)  //20 mins

    return {unHashedToken, hashedToken, tokenExpiry }
}

export const User = mongoose.model("User", userSchema)