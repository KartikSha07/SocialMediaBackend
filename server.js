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
const allowedOrigins = [
  "https://social-media-frontend-umber.vercel.app",
  "social-media-frontend-umber.vercel.app", 
  "http://localhost:3000",
];


// Attach Socket.IO
// CORS middleware
const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`Blocked by CORS: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// Socket.IO config with same allowed origins
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});
app.set("io", io);

// Cloudinary config
cloudinary.config({
  secure: true,
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


app.use(express.json({ limit: "10mb" }));
app.use(morgan("common"));
app.use(cookie());

// Routes
const authRoute = require("./routes/authRoutes");
const postRoute = require("./routes/postRoutes");
const userRoute = require("./routes/userRoutes");
const messageRoute = require("./routes/messageRoutes");
const watchPartyRoute = require("./routes/watchPartyRoutes");
const youtubeRoutes = require("./routes/youtubeRoutes");

app.use("/watchParty", watchPartyRoute);
app.use("/youtube", youtubeRoutes);
app.use("/auth", authRoute);
app.use("/posts", postRoute);
app.use("/users", userRoute);
app.use("/messages", messageRoute);

// Online users tracking
const onlineUsers = new Map();

// Socket.IO events
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

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

  socket.on("watchPlay", ({ roomId, currentTime }) => {
    socket.to(roomId).emit("watchPlay", { currentTime });
  });

  socket.on("watchPause", ({ roomId, currentTime }) => {
    socket.to(roomId).emit("watchPause", { currentTime });
  });

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
      videoQueue: room.videoQueue,
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
      videoQueue: room.videoQueue,
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
        videoQueue: room.videoQueue,
      });
    }
  });
  socket.on("watchChatMessage", async ({ roomId, userId, message }) => {
    const room = await WatchRoom.findById(roomId);
    if (!room) return;
    room.chatMessages.push({ user: userId, message });
    await room.save();
    await room.populate("chatMessages.user", "name avatar");
    const lastMsg = room.chatMessages[room.chatMessages.length - 1];
    io.to(roomId).emit("watchChatMessage", lastMsg);
  });

  socket.on("leaveWatchRoom", ({ roomId }) => socket.leave(roomId));

  // Post room join/leave
  socket.on("joinPost", (postId) => {
    socket.join(postId);
    console.log(`Socket ${socket.id} joined post room: ${postId}`);
  });
  socket.on("leavePost", (postId) => {
    socket.leave(postId);
    console.log(`Socket ${socket.id} left post room: ${postId}`);
  });

  // Track online users
  socket.on("userConnected", (userId) => {
    onlineUsers.set(userId, socket.id);
    console.log(`User ${userId} connected`);
  });

  // Private message with support for text, images, GIFs
  socket.on("privateMessage", async (data) => {
    const {
      toUserId,
      fromUserId,
      message,
      imageUrl,
      gifUrl,
      messageId,
      timestamp,
    } = data;
    if (!fromUserId || !toUserId || (!message && !imageUrl && !gifUrl)) {
      console.error("Invalid privateMessage payload:", data);
      return;
    }

    try {
      const newMsg = new Message({
        from: fromUserId,
        to: toUserId,
        message,
        imageUrl,
        gifUrl,
      });
      await newMsg.save();

      // Fetch sender details
      const sender = await require("./models/userModel")
        .findById(fromUserId)
        .select("name avatar");

      const msgPayload = {
        fromUserId,
        fromUser: sender, // include sender object
        message,
        imageUrl,
        gifUrl,
        messageId: newMsg._id,
        timestamp: newMsg.createdAt,
        read: false,
      };

      // Send to recipient if online
      const recipientSocketId = onlineUsers.get(toUserId.toString());
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("privateMessage", msgPayload);
      }

      // Echo back to sender with read status true
      io.to(socket.id).emit("privateMessage", { ...msgPayload, read: true });
    } catch (err) {
      console.error("Error saving chat message:", err.message);
    }
  });

  // Typing indicators
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

  // Read receipts
  socket.on("messageRead", ({ toUserId, fromUserId, messageId }) => {
    const recipientSocketId = onlineUsers.get(toUserId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("messageRead", { fromUserId, messageId });
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    for (const [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`User ${userId} went offline`);
        break;
      }
    }
  });
});

// Optional REST endpoint for image uploads from chat
app.post("/messages/uploadImage", async (req, res) => {
  try {
    if (!req.body.image)
      return res.status(400).json(failure(400, "No image provided"));

    const uploaded = await cloudinary.uploader.upload(req.body.image, {
      folder: "chatImages",
    });
    res.json(success(200, { url: uploaded.secure_url }));
  } catch (err) {
    console.error("Image upload failed", err);
    res.status(500).json(failure(500, "Image upload failed"));
  }
});

// Start server
const PORT = process.env.PORT || 5000;
dbconnect();
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
