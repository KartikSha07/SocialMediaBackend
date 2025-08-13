const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    message: { type: String },         // text or emoji
    imageUrl: { type: String },        // uploaded image URL
    gifUrl: { type: String },          // GIF link

    // NEW: Invite link (optional)
    inviteLink: { type: String, default: null }, // Watch party, special event, etc.

    read: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
