import { Router } from "express";
import { getUserPermissions, replaceUserPermissions, getMyPermissions, getEffectiveUserPermissions } from "../../controllers/user-management/userPermission.controllers.js";
import { verifyJWT } from "../../middlewares/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/permission.middlewares.js";

const router = Router();
router.use(verifyJWT);
router.get("/me", getMyPermissions);
router.use(requireAdmin);
router.get("/:userId/effective", getEffectiveUserPermissions);
router.get("/:userId", getUserPermissions);
router.put("/:userId", replaceUserPermissions);
export default router;
