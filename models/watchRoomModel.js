const mongoose = require("mongoose");

const watchRoomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  inviteCode: { type: String, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  currentVideo: {
    videoId: { type: String, default: null },
    title: { type: String, default: "" }
  },
  currentTime: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
  videoQueue: [{
    videoId: { type: String, required: true },
    title: { type: String, required: true }
  }],
  chatMessages: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: String,
    timestamp: { type: Date, default: Date.now },
  }],
  invitedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

module.exports = mongoose.model("WatchRoom", watchRoomSchema);
