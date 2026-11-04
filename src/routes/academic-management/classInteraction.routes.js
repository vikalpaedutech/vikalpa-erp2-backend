import { Router } from "express";

import {
  createClassInteraction,
  getClassInteractions,
  getClassInteractionCenters,
  getClassInteractionReport,
  exportClassInteractionReport,
} from "../../controllers/academic-management/classInteraction.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { requirePermission } from "../../middlewares/permission.middlewares.js";


const router = Router();


router.use(
  verifyJWT
);


/*
|--------------------------------------------------------------------------
| CENTERS
|--------------------------------------------------------------------------
*/

router
  .route("/centers")
  .get(
    getClassInteractionCenters
  );


/*
|--------------------------------------------------------------------------
| REPORT VIEW
|--------------------------------------------------------------------------
*/

router
  .route("/report")
  .get(
    requirePermission("class-interaction.view"),
    getClassInteractionReport
  );


/*
|--------------------------------------------------------------------------
| REPORT EXPORT
|--------------------------------------------------------------------------
*/

router
  .route("/report/export")
  .get(
    requirePermission("class-interaction.view"),
    exportClassInteractionReport
  );


/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .post(
    createClassInteraction
  );


/*
|--------------------------------------------------------------------------
| GET
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .get(
    getClassInteractions
  );


export default router;