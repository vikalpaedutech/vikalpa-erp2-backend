import dotenv from "dotenv"
import app from "./app.js"

import connectDb from "./db/index.js"
import { seedPermissions } from "./utils/permission-seed.js"
import { startLeaveAccrualScheduler } from "./services/hr-management/leaveAccrual.service.js"

dotenv.config({
    path:"./.env",
})



//const port = process.env.port || 8100


// DIGITAL OCEAN
const port = process.env.PORT || 8080


connectDb()
    .then(async()=>{
        await seedPermissions()
        app.listen(port, "0.0.0.0", ()=>{
            console.log(`Example app is listening on port ${port}`)
            startLeaveAccrualScheduler()
        })
    })
    .catch((err)=>{
        console.error("MongoDB connection error", err)
        process.exit(1)
    })