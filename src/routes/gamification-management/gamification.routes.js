import { Router } from "express";
import {
  getGamificationRoleAccess,
  updateGamificationRoleAccess,
  getGamificationParticipants,
  createGamificationParticipant,
  updateGamificationParticipant,
  deleteGamificationParticipant,
  getGamificationCriteria,
  updateGamificationCriteria,
  initiateGamificationCalculation,
  updateGamificationMonthlyRanking,
  getMyGamificationDashboard,
  getGamificationLeaderboard,
  downloadGamificationReport,
} from "../../controllers/gamification-management/gamification.controllers.js";
import { verifyJWT } from "../../middlewares/auth.middlewares.js";

const router=Router();
router.use(verifyJWT);

router.get("/me/dashboard", getMyGamificationDashboard);

router.get("/roles", getGamificationRoleAccess);
router.patch("/roles/:roleId", updateGamificationRoleAccess);

router.get("/participants", getGamificationParticipants);
router.post("/participants", createGamificationParticipant);
router.patch("/participants/:id", updateGamificationParticipant);
router.delete("/participants/:id", deleteGamificationParticipant);

router.get("/criteria", getGamificationCriteria);
router.put("/criteria", updateGamificationCriteria);

router.post("/initiate", initiateGamificationCalculation);
router.post("/update-ranking", updateGamificationMonthlyRanking);
router.get("/leaderboard", getGamificationLeaderboard);
router.get("/report/download", downloadGamificationReport);

export default router;
