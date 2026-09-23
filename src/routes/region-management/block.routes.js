import { Router } from "express";

import {
  createBlock,
  getAllBlocks,
  getBlockById,
  updateBlock,
  deleteBlock,
  searchBlocks,
  getBlocksByDistrict,
} from "../../controllers/region-management/block.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

// Secure routes
router.use(verifyJWT);

// Create block
router.route("/").post(createBlock);

// Get all blocks
// Query:
// ?page=1
// ?limit=10
// ?search=Naraingarh
// ?districtId=xxxxx
router.route("/").get(getAllBlocks);

// Search blocks
// Query:
// ?q=Naraingarh
// Optional:
// ?districtId=xxxxx
router.route("/search").get(searchBlocks);

// Get all blocks of a specific district
router.route("/district/:districtId").get(getBlocksByDistrict);

// Get block by MongoDB ID
router.route("/:blockId").get(getBlockById);

// Update block
router.route("/:blockId").patch(updateBlock);

// Delete block
router.route("/:blockId").delete(deleteBlock);

export default router;