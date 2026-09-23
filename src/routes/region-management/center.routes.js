import { Router } from "express";

import {
  createCenter,
  getAllCenters,
  getCenterById,
  updateCenter,
  deleteCenter,
  searchCenters,
  getCentersByDistrict,
  getCentersByBlock,
  getAvailableCenters,
} from "../../controllers/region-management/center.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

// Secure routes
router.use(verifyJWT);

// Create center
router.route("/").post(createCenter);

// Get all centers
// Query:
// ?page=1
// ?limit=10
// ?search=Center
// ?districtId=xxxxx
// ?blockId=xxxxx
// ?isCenterAvailable=true
router.route("/").get(getAllCenters);

// Search centers
// Query:
// ?q=Center
// Optional:
// ?districtId=xxxxx
// ?blockId=xxxxx
router.route("/search").get(searchCenters);

// Get available centers
router.route("/available").get(getAvailableCenters);

// Get all centers of a specific district
router.route("/district/:districtId").get(getCentersByDistrict);

// Get all centers of a specific block
router.route("/block/:blockId").get(getCentersByBlock);

// Get center by MongoDB ID
router.route("/:centerId").get(getCenterById);

// Update center
router.route("/:centerId").patch(updateCenter);

// Delete center
router.route("/:centerId").delete(deleteCenter);

export default router;