const WatchRoom = require("../models/watchRoomModel");
const crypto = require("crypto");

exports.createWatchRoom = async (req, res) => {
  try {
    const { name, invitedUsers } = req.body;
    if (!name) return res.status(400).json({ status: "error", message: "Name required" });

    const inviteCode = crypto.randomBytes(4).toString("hex");
    const room = await WatchRoom.create({
      name, inviteCode,
      createdBy: req.id,
      invitedUsers: Array.isArray(invitedUsers) ? invitedUsers : []
    });

    const inviteLink = `${process.env.FRONTEND_URL}/watch/${room._id}`;
    const io = req.app.get("io");
    for (const uid of invitedUsers) {
      const sockId = req.app.get("onlineUsers")?.get(uid.toString());
      if (sockId) io.to(sockId).emit("watchPartyInvite", { roomId: room._id, roomName: room.name, inviteLink });
    }
    res.json({ status: "ok", result: room, inviteLink });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.getMyInvites = async (req, res) => {
  try {
    const rooms = await WatchRoom.find({ $or: [{ invitedUsers: req.id }, { createdBy: req.id }] })
      .populate("createdBy", "name avatar").sort({ createdAt: -1 });
    res.json({ status: "ok", result: rooms });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.removeInvite = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await WatchRoom.findById(roomId);
    if (!room) return res.status(404).json({ status: "error", message: "Not found" });
    room.invitedUsers = room.invitedUsers.filter(id => id.toString() !== req.id.toString());
    await room.save();
    res.json({ status: "ok", message: "Invite removed" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.inviteMoreUsers = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { newInvites } = req.body;
    const room = await WatchRoom.findById(roomId);
    if (!room) return res.status(404).json({ status: "error", message: "Not found" });
    if (room.createdBy.toString() !== req.id.toString()) return res.status(403).json({ status: "error", message: "Not authorized" });

    for (const uid of newInvites) {
      if (!room.invitedUsers.includes(uid)) room.invitedUsers.push(uid);
    }
    await room.save();

    const inviteLink = `${process.env.FRONTEND_URL}/watch/${room._id}`;
    const io = req.app.get("io");
    for (const uid of newInvites) {
      const sockId = req.app.get("onlineUsers")?.get(uid.toString());
      if (sockId) io.to(sockId).emit("watchPartyInvite", { roomId: room._id, roomName: room.name, inviteLink });
    }

    res.json({ status: "ok", message: "Invites sent" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.endWatchRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await WatchRoom.findById(roomId);
    if (!room) return res.status(404).json({ status: "error", message: "Not found" });
    if (room.createdBy.toString() !== req.id.toString()) return res.status(403).json({ status: "error", message: "Not authorized" });

    await WatchRoom.deleteOne({ _id: roomId });
    req.app.get("io").to(roomId).emit("watchPartyEnded", { roomId });
    res.json({ status: "ok", message: "Ended" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
