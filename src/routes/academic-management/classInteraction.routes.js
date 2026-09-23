import { Router } from "express";

import {
  createClassInteraction,
  getClassInteractions,
  getClassInteractionCenters,
  getClassInteractionReport,
  exportClassInteractionReport,
} from "../../controllers/academic-management/classInteraction.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";


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