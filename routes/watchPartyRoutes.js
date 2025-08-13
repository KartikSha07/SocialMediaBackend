const { authChecker } = require("../middleware/authMiddleware");
const {
  createWatchRoom,
  getMyInvites,
  removeInvite,
  inviteMoreUsers,
  endWatchRoom
} = require("../controllers/watchPartyController");

const router = require("express").Router();

router.post("/create", authChecker, createWatchRoom);
router.get("/my-invites", authChecker, getMyInvites);
router.post("/removeInvite/:roomId", authChecker, removeInvite);
router.post("/inviteMore/:roomId", authChecker, inviteMoreUsers);
router.delete("/end/:roomId", authChecker, endWatchRoom);

module.exports = router;
