import dotenv from "dotenv"
import app from "./app.js"

import connectDb from "./db/index.js"
import { seedPermissions } from "./utils/permission-seed.js"

dotenv.config({
    path:"./.env",
})



const port = process.env.port || 3000


connectDb()
    .then(async()=>{
        await seedPermissions()
        app.listen(port, ()=>{
            console.log(`Example app is listening onport http://localhost:${port}`)
        })
    })
    .catch((err)=>{
        console.error("MongoDB connection error", err)
        process.exit(1)
    })