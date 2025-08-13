const express = require("express");
const router = express.Router();
const { searchYouTubeVideos } = require("../controllers/youtubeController");
const { authChecker } = require("../middleware/authMiddleware");

router.get("/search", authChecker, searchYouTubeVideos);

module.exports = router;
