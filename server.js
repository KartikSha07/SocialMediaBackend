const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const dbconnect = require("./dbconnect");
const cookie = require("cookie-parser");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const http = require("http");
const socketIo = require("socket.io");
const WatchRoom = require("./models/watchRoomModel");
const Message = require("./models/messageModel");
const { success, failure } = require("./utils/responseStatus");

dotenv.config({ path: "./.env" });

const app = express();
const server = http.createServer(app);

/* -------------------------
   ✅ CORS FIX — Full Protocols
-------------------------- */
const allowedOrigins = [
  "https://social-media-frontend-umber.vercel.app",
  "social-media-frontend-umber.vercel.app", 
  "http://localhost:3000",
];


const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman / curl
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ Blocked by CORS: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

/* -------------------------
   ✅ Socket.IO Setup
-------------------------- */
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});
app.set("io", io);

/* -------------------------
   ✅ Cloudinary Setup
-------------------------- */
cloudinary.config({
  secure: true,
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(express.json({ limit: "10mb" }));
app.use(morgan("common"));
app.use(cookie());

/* -------------------------
   Routes
-------------------------- */
app.use("/watchParty", require("./routes/watchPartyRoutes"));
app.use("/youtube", require("./routes/youtubeRoutes"));
app.use("/auth", require("./routes/authRoutes"));
app.use("/posts", require("./routes/postRoutes"));
app.use("/users", require("./routes/userRoutes"));
app.use("/messages", require("./routes/messageRoutes"));

/* -------------------------
   Online users map
-------------------------- */
const onlineUsers = new Map();

/* -------------------------
   Smooth Sync Helpers
-------------------------- */
function throttle(fn, wait) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      fn.apply(this, args);
      lastTime = now;
    }
  };
}

// Store last broadcast time by room to prevent micro-jumps
const lastTimes = {};

/* -------------------------
   Socket.IO events
-------------------------- */
io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  socket.on("registerUser", (uid) => {
    onlineUsers.set(uid.toString(), socket.id);
  });

  socket.on("joinWatchRoom", async ({ roomId }) => {
    const room = await WatchRoom.findById(roomId)
      .populate("createdBy", "name avatar")
      .populate("chatMessages.user", "name avatar");
    if (!room) {
      socket.emit("watchPartyEnded", { roomId });
      return;
    }
    socket.join(roomId);
    socket.emit("watchRoomState", room);
  });

  /* -------------------------
     Smooth Sync for watchPlay
  -------------------------- */
  socket.on(
    "watchPlay",
    throttle(({ roomId, currentTime }) => {
      const diff = Math.abs((lastTimes[roomId]?.play || 0) - currentTime);
      if (diff > 0.4) {
        lastTimes[roomId] = { ...(lastTimes[roomId] || {}), play: currentTime };
        socket.to(roomId).emit("watchPlay", { currentTime });
      }
    }, 700)
  );

  /* -------------------------
     Smooth Sync for watchPause
  -------------------------- */
  socket.on(
    "watchPause",
    throttle(({ roomId, currentTime }) => {
      const diff = Math.abs((lastTimes[roomId]?.pause || 0) - currentTime);
      if (diff > 0.4) {
        lastTimes[roomId] = { ...(lastTimes[roomId] || {}), pause: currentTime };
        socket.to(roomId).emit("watchPause", { currentTime });
      }
    }, 700)
  );

  /* -------------------------
     Queue management
  -------------------------- */
  socket.on("addVideoToQueue", async ({ roomId, videoId, title }) => {
    if (!videoId || !title) return;
    const room = await WatchRoom.findById(roomId);
    if (!room) return;
    room.videoQueue.push({ videoId, title });
    if (!room.currentVideo?.videoId) {
      room.currentVideo = room.videoQueue.shift();
      room.currentTime = 0;
      room.isPlaying = false;
    }
    await room.save();
    io.to(roomId).emit("queueUpdated", {
      currentVideo: room.currentVideo,
      videoQueue: room.videoQueue
    });
  });

  socket.on("skipVideo", async ({ roomId }) => {
    const room = await WatchRoom.findById(roomId);
    if (!room) return;
    room.currentVideo = room.videoQueue.shift() || { videoId: null, title: "" };
    room.currentTime = 0;
    room.isPlaying = false;
    await room.save();
    io.to(roomId).emit("videoChanged", {
      currentVideo: room.currentVideo,
      videoQueue: room.videoQueue
    });
  });

  socket.on("removeFromQueue", async ({ roomId, index }) => {
    const room = await WatchRoom.findById(roomId);
    if (!room) return;
    if (index >= 0 && index < room.videoQueue.length) {
      room.videoQueue.splice(index, 1);
      await room.save();
      io.to(roomId).emit("queueUpdated", {
        currentVideo: room.currentVideo,
        videoQueue: room.videoQueue
      });
    }
  });

  /* -------------------------
     Chat in watch party
  -------------------------- */
  socket.on("watchChatMessage", async ({ roomId, userId, message }) => {
    const room = await WatchRoom.findById(roomId);
    if (!room) return;
    room.chatMessages.push({ user: userId, message });
    await room.save();
    await room.populate("chatMessages.user", "name avatar");
    const lastMsg = room.chatMessages[room.chatMessages.length - 1];
    io.to(roomId).emit("watchChatMessage", lastMsg);
  });

  /* -------------------------
     Engagement in posts
  -------------------------- */
  socket.on("joinPost", (postId) => socket.join(postId));
  socket.on("leavePost", (postId) => socket.leave(postId));

  /* -------------------------
     Track active users
  -------------------------- */
  socket.on("userConnected", (userId) => {
    onlineUsers.set(userId, socket.id);
  });

  /* -------------------------
     Private messages
  -------------------------- */
  socket.on("privateMessage", async (data) => {
    const { toUserId, fromUserId, message, imageUrl, gifUrl } = data;
    if (!fromUserId || !toUserId || (!message && !imageUrl && !gifUrl)) return;
    try {
      const newMsg = new Message({
        from: fromUserId,
        to: toUserId,
        message,
        imageUrl,
        gifUrl
      });
      await newMsg.save();

      const sender = await require("./models/userModel")
        .findById(fromUserId)
        .select("name avatar");

      const msgPayload = {
        fromUserId,
        fromUser: sender,
        message,
        imageUrl,
        gifUrl,
        messageId: newMsg._id,
        timestamp: newMsg.createdAt,
        read: false
      };

      const recipientSocketId = onlineUsers.get(toUserId.toString());
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("privateMessage", msgPayload);
      }
      io.to(socket.id).emit("privateMessage", { ...msgPayload, read: true });
    } catch (err) {
      console.error("❌ Error saving chat message:", err.message);
    }
  });

  socket.on("typing", ({ toUserId, fromUserId, name }) => {
    const recipientSocketId = onlineUsers.get(toUserId.toString());
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("typing", { fromUserId, name });
    }
  });

  socket.on("stopTyping", ({ toUserId, fromUserId }) => {
    const recipientSocketId = onlineUsers.get(toUserId.toString());
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("stopTyping", { fromUserId });
    }
  });

  socket.on("messageRead", ({ toUserId, fromUserId, messageId }) => {
    const recipientSocketId = onlineUsers.get(toUserId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("messageRead", { fromUserId, messageId });
    }
  });

  socket.on("disconnect", () => {
    for (const [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
  });
});

/* -------------------------
   Chat Image Upload
-------------------------- */
app.post("/messages/uploadImage", async (req, res) => {
  try {
    if (!req.body.image) {
      return res.status(400).json(failure(400, "No image provided"));
    }

    const uploaded = await cloudinary.uploader.upload(req.body.image, {
      folder: "chatImages"
    });
    res.json(success(200, { url: uploaded.secure_url }));
  } catch (err) {
    res.status(500).json(failure(500, "Image upload failed"));
  }
});

/* -------------------------
   Start Server
-------------------------- */
const PORT = process.env.PORT || 5000;
dbconnect();
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
