// controllers/messageController.js
const Message = require("../models/messageModel");
const cloudinary = require("cloudinary").v2;                 // Import Cloudinary
const { success, failure } = require("../utils/responseStatus"); // Import response helpers

exports.getChatList = async (req, res) => {
  const userId = req.id;
  try {
    const chats = await Message.aggregate([
      { $match: { $or: [{ from: userId }, { to: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$from", userId] }, "$to", "$from"]
          },
          lastMessage: { $first: "$message" },
          lastTime: { $first: "$createdAt" }
        }
      },
      { $sort: { lastTime: -1 } }
    ]);
    res.json({ status: "ok", result: chats });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
};

exports.getMessagesWithUser = async (req, res) => {
  const userId = req.id;
  const { otherUserId } = req.params;

  try {
    const msgs = await Message.find({
      $or: [
        { from: userId, to: otherUserId },
        { from: otherUserId, to: userId }
      ]
    })
    .sort({ createdAt: 1 })
    // ✅ Ensure both ends are populated so front‑end can compare reliably
    .populate("from", "_id name avatar")
    .populate("to", "_id name avatar");

    res.json({ status: "ok", result: msgs });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
};

// Upload image for chat
exports.uploadChatImage = async (req, res) => {
  try {
    const fileStr = req.body.image;
    const uploaded = await cloudinary.uploader.upload(fileStr, {
      folder: "chatImages" // Folder in Cloudinary to store chat images
    });
    res.json(success(200, { url: uploaded.secure_url }));
  } catch (err) {
    console.error("Image upload failed", err);
    res.status(500).json(failure(500, "Image upload failed"));
  }
};