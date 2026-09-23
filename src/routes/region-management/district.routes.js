import { Router } from "express";

import {
  createDistrict,
  getAllDistricts,
  getDistrictById,
  updateDistrict,
  deleteDistrict,
  searchDistricts,
} from "../../controllers/region-management/district.controllers.js";

import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router = Router();

// Secure routes
router.use(verifyJWT);

// Create district
router.route("/").post(createDistrict);

// Get all districts
// Query:
// ?page=1
// ?limit=10
// ?search=Ambala
router.route("/").get(getAllDistricts);

// Search districts
// Query:
// ?q=Ambala
router.route("/search").get(searchDistricts);

// Get district by MongoDB ID
router.route("/:districtId").get(getDistrictById);

// Update district
router.route("/:districtId").patch(updateDistrict);

// Delete district
router.route("/:districtId").delete(deleteDistrict);

export default router;