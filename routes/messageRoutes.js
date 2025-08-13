// routes/messageRoutes.js
const express = require("express");
const router = express.Router();

// ✅ Import the actual function, not the whole object
const { authChecker } = require("../middleware/authMiddleware");

const { getChatList, getMessagesWithUser, uploadChatImage } = require("../controllers/messageController");

// Chat list route
router.get("/list", authChecker, getChatList);

// Conversation history route
router.get("/:otherUserId", authChecker, getMessagesWithUser);

router.post("/uploadImage", authChecker, uploadChatImage); // new

module.exports = router;
