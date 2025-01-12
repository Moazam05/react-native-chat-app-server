const multer = require("multer");
const Message = require("../models/messageModel");
const Chat = require("../models/chatModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const cloudinary = require("../cloudinary");

// Configure multer storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 5, // 5MB
  },
}).single("file");

// Middleware to upload file
const handleFileUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return next(new AppError("File upload error", 400));
    } else if (err) {
      return next(new AppError("Something went wrong", 500));
    }
    next();
  });
};

exports.sendMessage = [
  handleFileUpload,
  catchAsync(async (req, res, next) => {
    const { chatId } = req.params;
    const { content, messageType = "text" } = req.body;

    // 1) Check if chat exists and user is a member
    const chat = await Chat.findOne({
      _id: chatId,
      users: { $elemMatch: { $eq: req.user._id } },
    });

    if (!chat) {
      return next(new AppError("Chat not found or user not a member", 404));
    }

    // Create message data object
    const messageData = {
      sender: req.user._id,
      chatId,
      messageType,
      content: content || req.file?.originalname, // Use filename as content if no content provided
    };

    // 2) Handle file upload if file exists
    if (req.file) {
      try {
        const fileStr = `data:${
          req.file.mimetype
        };base64,${req.file.buffer.toString("base64")}`;
        const result = await cloudinary.uploader.upload(fileStr, {
          folder: "react-native-chat-app",
          resource_type: "auto",
        });

        messageData.fileUrl = result.secure_url;
        messageData.fileName = req.file.originalname;
        messageData.fileSize = result.bytes;
        messageData.messageType = req.file.mimetype.startsWith("image/")
          ? "image"
          : "document";
      } catch (error) {
        return next(new AppError("Error uploading to Cloudinary", 400));
      }
    }

    // Validate content
    if (!messageData.content) {
      return next(new AppError("Message must have content", 400));
    }

    // 3) Create message
    let message = await Message.create(messageData);

    // 4) Populate sender details
    message = await message.populate("sender", "username avatar");

    res.status(201).json({
      status: "success",
      data: {
        message,
      },
    });
  }),
];

exports.getMessages = catchAsync(async (req, res, next) => {
  const { chatId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  // 1) Check if chat exists and user is a member
  const chat = await Chat.findOne({
    _id: chatId,
    users: { $elemMatch: { $eq: req.user._id } },
  });

  if (!chat) {
    return next(new AppError("Chat not found or user not a member", 404));
  }

  // 2) Get messages with pagination
  const messages = await Message.find({ chatId })
    .populate("sender", "username avatar") // Only necessary fields
    .select("-__v") // Exclude version key
    .sort("-createdAt")
    .skip(skip)
    .limit(limit);

  if (!messages) {
    return next(new AppError("No messages found", 404));
  }

  // 3) Get total messages count for pagination
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

  // 1) Find message and verify user is part of the chat
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

  // 2) Add user to readBy if not already there
  if (!message.readBy.includes(req.user._id)) {
    message.readBy.push(req.user._id);
    await message.save();
  }

  res.status(200).json({
    status: "success",
    data: {
      message,
    },
  });
});
