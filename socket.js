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

  io.on("connection", (socket) => {
    console.log("Connected to socket.io".bold.bgRed);

    // Handle user setup
    socket.on("setup", async (userData) => {
      if (!userData._id) return;

      // Join user's personal room
      socket.join(userData._id);
      activeUsers.set(userData._id, socket.id);

      // Update user's online status
      await User.findByIdAndUpdate(userData._id, {
        isOnline: true,
        lastSeen: new Date(),
      });

      // Emit online status to other users
      socket.broadcast.emit("user online", userData._id);
      socket.emit("connected");
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
    socket.on("new message", async (newMessageData) => {
      const chatId = newMessageData.chatId;

      try {
        const chat = await Chat.findById(chatId).populate("users");
        if (!chat || !chat.users) {
          console.log("Chat not found or users not defined".red);
          return;
        }

        // Create message in database
        const message = await Message.create({
          sender: socket.userData?._id,
          content: newMessageData.content,
          chatId: chatId,
          messageType: newMessageData.messageType || "text",
          fileUrl: newMessageData.fileUrl,
          fileName: newMessageData.fileName,
          fileSize: newMessageData.fileSize,
        });

        // Update chat's latest message
        await Chat.findByIdAndUpdate(chatId, {
          latestMessage: message._id,
        });

        // Emit message to all users in chat except sender
        chat.users.forEach((user) => {
          if (user._id.toString() === socket.userData?._id) return;

          const socketId = activeUsers.get(user._id.toString());
          if (socketId) {
            io.to(socketId).emit("message received", {
              ...message.toObject(),
              chat: chatId,
            });
          }
        });
      } catch (error) {
        console.error("Error handling new message:", error);
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log("User disconnected".bold.bgRed);

      if (socket.userData?._id) {
        // Update user's online status and last seen
        await User.findByIdAndUpdate(socket.userData._id, {
          isOnline: false,
          lastSeen: new Date(),
        });

        // Remove from active users
        activeUsers.delete(socket.userData._id);

        // Emit offline status to other users
        socket.broadcast.emit("user offline", socket.userData._id);
      }
    });
  });

  return io;
};

module.exports = initSocket;
