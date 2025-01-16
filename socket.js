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
      socket.emit("connected");

      logActiveUsers();
    });

    // Handle joining a chat room
    socket.on("join chat", async (roomId) => {
      socket.join(roomId);
      console.log("User Joined Room:", roomId.bgRed);

      // Mark previous messages as read
      await Message.updateMany(
        {
          chatId: roomId,
          sender: { $ne: socket.userData?._id },
          readBy: { $ne: socket.userData?._id },
        },
        { $push: { readBy: socket.userData?._id } }
      );
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
        if (!chat || !chat.users) {
          console.log("Chat not found or users not defined".red);
          return;
        }

        chat.users.forEach((user) => {
          if (user._id.toString() === messageData.sender._id) return;

          const socketId = activeUsers.get(user._id.toString());
          if (socketId) {
            io.to(socketId).emit("message received", messageData);
          }
        });
      } catch (error) {
        console.error("Error handling message broadcast:", error);
      }
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
