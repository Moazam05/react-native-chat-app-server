const socketIO = require("socket.io");
const colors = require("colors");

const User = require("./models/userModel");
const Chat = require("./models/chatModel");
const Message = require("./models/messageModel");

const initSocket = (server) => {
  const io = socketIO(server, {
    pingTimeout: 60000,
    cors: {
      origin: "*",
    },
  });
  // Store active users
  const activeUsers = new Map();
  const userSessions = new Map();
  const disconnectTimers = new Map();

  const logActiveUsers = () => {
    console.log("\nCurrently Active Users:".bold.green);
    if (activeUsers.size === 0) {
      console.log("No active users".yellow);
    } else {
      activeUsers.forEach((socketId, userId) => {
        console.log(`User ID: ${userId}, Socket ID: ${socketId}`.cyan);
      });
    }
    console.log("Total active users:", activeUsers.size.toString().bold.blue);
  };

  const handleHeartbeat = (socket) => {
    if (socket.userData?._id) {
      userSessions.set(socket.userData._id, Date.now());

      // Clear any pending disconnect timer
      const timer = disconnectTimers.get(socket.userData._id);
      if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(socket.userData._id);
      }
    }
  };

  // Session cleanup
  setInterval(() => {
    const now = Date.now();
    userSessions.forEach((lastActivity, userId) => {
      if (now - lastActivity > 120000) {
        const socketId = activeUsers.get(userId);
        if (socketId) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }
        }
        userSessions.delete(userId);
        activeUsers.delete(userId);
        io.emit("user offline", userId);
      }
    });
  }, 60000);

  io.on("connection", (socket) => {
    console.log("Connected to socket.io".bold.bgRed);

    socket.on("heartbeat", () => handleHeartbeat(socket));

    socket.on("check user status", (userId) => {
      try {
        const isUserOnline = activeUsers.has(userId);
        io.emit(isUserOnline ? "user online" : "user offline", userId);
      } catch (error) {
        console.error("Error checking user status:", error);
      }
    });
    // Handle user setup
    socket.on("setup", async (userData) => {
      if (!userData._id) return;
      // Remove any existing connections for this user
      const existingSocketId = activeUsers.get(userData._id);
      if (existingSocketId && existingSocketId !== socket.id) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);
        if (existingSocket) {
          existingSocket.disconnect(true);
        }
      }

      socket.userData = userData;
      socket.join(userData._id);
      activeUsers.set(userData._id, socket.id);
      userSessions.set(userData._id, Date.now());
      // Update user's online status
      await User.findByIdAndUpdate(userData._id, {
        isOnline: true,
        lastSeen: new Date(),
      });
      // Emit online status to all clients
      io.emit("user online", userData._id);
      socket.emit("online users", Array.from(activeUsers.keys()));
      socket.emit("connected");
      logActiveUsers();
    });
    // Handle joining a chat room
    socket.on("join chat", async (roomId) => {
      if (!socket.userData?._id) return;

      // First leave any existing rooms except user's own room
      const rooms = [...socket.rooms];
      rooms.forEach((room) => {
        if (room !== socket.id && room !== socket.userData._id) {
          socket.leave(room);
        }
      });

      socket.join(roomId);
      console.log(`User ${socket.userData._id} Joined Room: ${roomId}`);

      try {
        // Get chat details
        const chat = await Chat.findById(roomId);
        if (!chat) return;

        await Message.updateMany(
          {
            chatId: roomId,
            readBy: { $ne: socket.userData._id },
          },
          {
            $addToSet: { readBy: socket.userData._id },
          }
        );

        const lastMessage = await Message.findOne({ chatId: roomId })
          .sort({ createdAt: -1 })
          .populate("sender", "username avatar");
        // Update chat list for the joining user
        socket.emit("chat list update", {
          chatId: roomId,
          unreadCount: 0,
          lastMessage,
        });
        // Notify other users in the room about messages being read
        io.to(roomId).emit("messages read", {
          chatId: roomId,
          userId: socket.userData._id,
        });
      } catch (error) {
        console.error("Error handling join chat:", error);
      }
    });
    // Handle chat list updates
    socket.on("update chat list", async () => {
      try {
        if (!socket.userData?._id) return;
        // Get fresh chat list
        const chats = await Chat.find({
          users: socket.userData._id,
        }).populate({
          path: "latestMessage",
          populate: {
            path: "sender",
            select: "username avatar",
          },
        });
        // Process each chat
        for (const chat of chats) {
          // Calculate unread count for current user
          const unreadCount = await Message.countDocuments({
            chatId: chat._id,
            readBy: { $ne: socket.userData._id },
          });

          // Emit update with correct unread count
          socket.emit("chat list update", {
            chatId: chat._id,
            lastMessage: chat.latestMessage,
            unreadCount,
          });
        }
      } catch (error) {
        console.error("Error updating chat list:", error);
      }
    });

    // Handle typing events
    socket.on("typing", (room) => {
      socket.in(room).emit("typing", {
        userId: socket.userData?._id,
        chatId: room,
      });
    });

    socket.on("stop typing", (room) => {
      socket.in(room).emit("stop typing", {
        userId: socket.userData?._id,
        chatId: room,
      });
    });
    // Handle new messages
    socket.on("new message", async (messageData) => {
      const chatId = messageData.chatId;

      try {
        const chat = await Chat.findById(chatId).populate("users");
        if (!chat) return;
        // For each user in the chat
        chat.users.forEach(async (user) => {
          if (user._id.toString() === messageData.sender._id) return;

          const socketId = activeUsers.get(user._id.toString());
          // Get current unread count for this user
          const unreadCount = await Message.countDocuments({
            chatId,
            readBy: { $ne: user._id },
          });

          if (socketId) {
            // User is online - send real-time update
            io.to(socketId).emit("message received", messageData);
            io.to(socketId).emit("chat list update", {
              chatId: messageData.chatId,
              lastMessage: messageData,
              unreadCount,
            });
          }
        });
      } catch (error) {
        console.error("Error handling new message:", error);
      }
    });

    socket.on("get chat updates", async () => {
      try {
        if (!socket.userData?._id) return;

        const chats = await Chat.find({
          users: socket.userData._id,
        }).populate({
          path: "latestMessage",
          populate: {
            path: "sender",
            select: "username avatar",
          },
        });
        // For each chat, count unread messages
        for (const chat of chats) {
          const unreadCount = await Message.countDocuments({
            chatId: chat._id,
            readBy: { $ne: socket.userData._id },
          });

          if (chat.latestMessage) {
            // Emit update for each chat
            socket.emit("chat list update", {
              chatId: chat._id,
              lastMessage: chat.latestMessage,
              unreadCount,
            });
          }
        }
      } catch (error) {
        console.error("Error getting chat updates:", error);
      }
    });
    // Handle leaving a chat room
    socket.on("leave chat", (roomId) => {
      if (!socket.userData?._id) return;
      socket.leave(roomId);
      console.log("User Left Room:".bold.bgRed, roomId);
    });
    // App background
    socket.on("app background", () => {
      if (socket.userData?._id) {
        const disconnectTimer = setTimeout(async () => {
          const socketId = activeUsers.get(socket.userData._id);
          if (socketId === socket.id) {
            await User.findByIdAndUpdate(socket.userData._id, {
              isOnline: false,
              lastSeen: new Date(),
            });
            activeUsers.delete(socket.userData._id);
            userSessions.delete(socket.userData._id);
            io.emit("user offline", socket.userData._id);
          }
        }, 300000); // 5 minutes timeout

        disconnectTimers.set(socket.userData._id, disconnectTimer);
      }
      console.log("User app in background:", socket.userData?._id);
    });
    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log("User disconnected".bold.bgRed);

      if (socket.userData?._id) {
        const userId = socket.userData._id;

        if (activeUsers.get(userId) === socket.id) {
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });

          activeUsers.delete(userId);
          userSessions.delete(userId);
          disconnectTimers.delete(userId);
          io.emit("user offline", userId);
          logActiveUsers();
        }
      }
    });
  });

  return io;
};

module.exports = initSocket;
