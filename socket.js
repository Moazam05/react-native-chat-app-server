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

  io.on("connection", (socket) => {
    console.log("Connected to socket.io".bold.bgRed);

    // Check user status
    socket.on("check user status", (userId) => {
      try {
        const isUserOnline = activeUsers.has(userId);
        console.log(
          `Status check for user ${userId}: ${
            isUserOnline ? "online" : "offline"
          }`
        );
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
      if (existingSocketId) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);
        if (existingSocket) {
          existingSocket.disconnect(true);
        }
        activeUsers.delete(userData._id);
      }

      socket.userData = userData;
      socket.join(userData._id);
      activeUsers.set(userData._id, socket.id);

      // Update user's online status
      await User.findByIdAndUpdate(userData._id, {
        isOnline: true,
        lastSeen: new Date(),
      });

      // Emit online status to all clients
      io.emit("user online", userData._id);

      // Send current online users list to the connecting client
      const onlineUsers = Array.from(activeUsers.keys());
      socket.emit("online users", onlineUsers);

      socket.emit("connected");

      logActiveUsers();
    });

    // Handle joining a chat room
    socket.on("join chat", async (roomId) => {
      socket.join(roomId);
      console.log("User Joined Room:", roomId);

      try {
        // Get unread messages before marking as read
        const unreadCount = await Message.countDocuments({
          chatId: roomId,
          sender: { $ne: socket.userData?._id },
          readBy: { $ne: socket.userData?._id },
        });

        // Mark messages as read
        if (unreadCount > 0) {
          await Message.updateMany(
            {
              chatId: roomId,
              sender: { $ne: socket.userData?._id },
              readBy: { $ne: socket.userData?._id },
            },
            { $addToSet: { readBy: socket.userData?._id } }
          );

          // Notify about read status
          io.to(roomId).emit("messages read", {
            chatId: roomId,
            userId: socket.userData?._id,
          });

          // Update chat list for the user
          const lastMessage = await Message.findOne({ chatId: roomId })
            .sort({ createdAt: -1 })
            .populate("sender", "username avatar");

          socket.emit("chat list update", {
            chatId: roomId,
            unreadCount: 0,
            lastMessage,
          });
        }
      } catch (error) {
        console.error("Error handling join chat:", error);
      }
    });

    socket.on("update chat list", async () => {
      try {
        if (!socket.userData?._id) return;

        // Get fresh unread counts for all chats
        const chats = await Chat.find({
          users: socket.userData._id,
        }).populate({
          path: "latestMessage",
          populate: {
            path: "sender",
            select: "username avatar",
          },
        });

        for (const chat of chats) {
          const unreadCount = await Message.countDocuments({
            chatId: chat._id,
            sender: { $ne: socket.userData._id },
            readBy: { $size: 0 },
          });

          socket.emit("chat list update", {
            chatId: chat._id,
            lastMessage: chat.latestMessage,
            unreadCount: unreadCount,
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
            sender: { $ne: user._id },
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

    // Handle read messages
    socket.on("get chat updates", async () => {
      try {
        if (!socket.userData?._id) return;

        // Get all chats for this user with unread counts
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
            sender: { $ne: socket.userData._id },
            readBy: { $size: 0 },
          });

          if (chat.latestMessage) {
            // Emit update for each chat
            socket.emit("chat list update", {
              chatId: chat._id,
              lastMessage: chat.latestMessage,
              unreadCount: unreadCount,
            });
          }
        }
      } catch (error) {
        console.error("Error getting chat updates:", error);
      }
    });

    // App background
    socket.on("app background", () => {
      // Don't mark user as offline, just note that app is in background
      console.log("User app in background:", socket.userData?._id);
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log("User disconnected".bold.bgRed);

      if (socket.userData?._id) {
        await User.findByIdAndUpdate(socket.userData._id, {
          isOnline: false,
          lastSeen: new Date(),
        });

        activeUsers.delete(socket.userData._id);
        io.emit("user offline", socket.userData._id);

        logActiveUsers();
      }
    });
  });

  return io;
};

module.exports = initSocket;
