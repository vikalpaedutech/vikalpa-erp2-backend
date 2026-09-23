import { Router } from "express";

import {
  createBatch,
  getAllBatches,
  getBatchById,
  updateBatch,
  deleteBatch,
  toggleBatchStatus,
  getActiveBatches,
} from "../../controllers/program-management/batch.controllers.js";
import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

router.use(verifyJWT);

router.route("/").post(createBatch).get(getAllBatches);

router.route("/active").get(getActiveBatches);

router
  .route("/:batchId")
  .get(getBatchById)
  .patch(updateBatch)
  .delete(deleteBatch);

router.route("/:batchId/status").patch(toggleBatchStatus);

export default router;