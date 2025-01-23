const multer = require("multer");
const Message = require("../models/messageModel");
const Chat = require("../models/chatModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const cloudinary = require("../cloudinary");
const admin = require("../config/firebase");

// Configure multer storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf"
    ) {
      cb(null, true);
    } else {
      cb(new AppError("Only images and PDFs are allowed!", 400), false);
    }
  },
}).single("file");

// Middleware to handle file upload
const handleFileUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return next(new AppError(`File upload error: ${err.message}`, 400));
    } else if (err) {
      return next(new AppError(err.message || "Something went wrong", 500));
    }
    next();
  });
};

// todo: Firebase Cloud Notification
const sendNotification = async (receiver, messageData, chat, sender) => {
  try {
    if (!receiver.fcmToken) return;

    const message = {
      token: receiver.fcmToken,
      // Remove notification object and only use data
      data: {
        title: chat.isGroupChat ? chat.chatName : sender.username,
        body:
          messageData.messageType === "text"
            ? messageData.content
            : `Sent ${messageData.messageType}`,
        chatData: JSON.stringify({
          chatId: chat._id.toString(),
          userId: sender._id.toString(),
          isGroupChat: chat.isGroupChat,
          chatName: chat.isGroupChat ? chat.chatName : sender.username,
        }),
        senderAvatar: sender.avatar || "",
        type: "new_message",
        messageId: messageData._id.toString(),
      },
      android: {
        priority: "high",
        collapseKey: messageData._id.toString(),
      },
    };

    await admin.messaging().send(message);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

exports.sendMessage = [
  handleFileUpload,
  catchAsync(async (req, res, next) => {
    const { chatId } = req.params;
    const { content, messageType = "text" } = req.body;

    // Check if chat exists and user is a member
    const chat = await Chat.findOne({
      _id: chatId,
      users: { $elemMatch: { $eq: req.user._id } },
    }).populate("users", "-password");

    if (!chat) {
      return next(new AppError("Chat not found or user not a member", 404));
    }

    const isFirstMessage = (await Message.countDocuments({ chatId })) === 0;
    const hasFile = !!req.file;
    const isPDF = hasFile && req.file.mimetype === "application/pdf";
    const finalMessageType = hasFile ? (isPDF ? "document" : "image") : "text";

    const messageData = {
      sender: req.user._id,
      chatId,
      messageType: finalMessageType,
      content: content || (hasFile ? req.file.originalname : ""),
    };

    // Handle file upload if exists
    if (hasFile) {
      try {
        const fileStr = `data:${
          req.file.mimetype
        };base64,${req.file.buffer.toString("base64")}`;
        const uploadOptions = {
          folder: "react-native-chat-app",
          resource_type: "auto",
          format: isPDF ? "pdf" : undefined,
          use_filename: true,
          unique_filename: true,
          overwrite: false,
        };

        if (isPDF) {
          uploadOptions.flags = "attachment";
          uploadOptions.type = "private";
        }

        const result = await cloudinary.uploader.upload(fileStr, uploadOptions);

        messageData.fileUrl = isPDF
          ? result.secure_url + "?dl=1"
          : result.secure_url;
        messageData.fileName = req.file.originalname;
        messageData.fileSize = result.bytes;

        if (isPDF) {
          messageData.fileMetadata = {
            format: "pdf",
            resourceType: "raw",
            publicId: result.public_id,
            version: result.version.toString(),
            url: result.secure_url,
          };
        }
      } catch (error) {
        console.error("Cloudinary upload error:", error);
        return next(
          new AppError("Error uploading file. Please try again.", 400)
        );
      }
    }

    if (!messageData.content) {
      return next(new AppError("Message must have content", 400));
    }

    try {
      let message = await Message.create(messageData);
      message = await message.populate("sender", "username avatar");
      await Chat.findByIdAndUpdate(chatId, { latestMessage: message._id });

      const io = req.app.get("io");

      // Get room sockets to check active users
      const room = await io.in(chatId).fetchSockets();
      const activeUserIds = room
        .map((s) => s.userData?._id?.toString())
        .filter(Boolean);

      // Send notifications to users not in the room
      for (const user of chat.users) {
        if (user._id.toString() === req.user._id.toString()) continue;

        if (!activeUserIds.includes(user._id.toString())) {
          await sendNotification(user, message, chat, req.user);
        }
      }

      // Handle first message notification
      if (isFirstMessage) {
        const updatedChat = await Chat.findById(chatId)
          .populate("users", "-password")
          .populate({
            path: "latestMessage",
            populate: {
              path: "sender",
              select: "username avatar",
            },
          });

        io.emit("new chat notification", updatedChat);
      }

      res.status(201).json({
        status: "success",
        data: { message },
      });
    } catch (error) {
      console.error("Message creation error:", error);
      return next(new AppError("Error creating message", 400));
    }
  }),
];

exports.getMessages = catchAsync(async (req, res, next) => {
  const { chatId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const chat = await Chat.findOne({
    _id: chatId,
    users: { $elemMatch: { $eq: req.user._id } },
  });

  if (!chat) {
    return next(new AppError("Chat not found or user not a member", 404));
  }

  const messages = await Message.find({ chatId })
    .populate("sender", "username avatar")
    .select("-__v")
    .sort("-createdAt")
    .skip(skip)
    .limit(limit);

  if (!messages) {
    return next(new AppError("No messages found", 404));
  }

  const totalMessages = await Message.countDocuments({ chatId });

  res.status(200).json({
    status: "success",
    data: {
      results: messages.length,
      totalMessages,
      currentPage: page,
      totalPages: Math.ceil(totalMessages / limit),
      messages,
      pagination: {
        next: page * limit < totalMessages ? page + 1 : null,
        prev: page > 1 ? page - 1 : null,
      },
    },
  });
});

exports.markAsRead = catchAsync(async (req, res, next) => {
  const { messageId } = req.params;

  const message = await Message.findById(messageId).populate({
    path: "chatId",
    select: "users",
  });

  if (!message) {
    return next(new AppError("Message not found", 404));
  }

  if (!message.chatId.users.includes(req.user._id)) {
    return next(
      new AppError("User not authorized to access this message", 403)
    );
  }

  if (!message.readBy.includes(req.user._id)) {
    message.readBy.push(req.user._id);
    await message.save();
  }

  res.status(200).json({
    status: "success",
    data: { message },
  });
});
