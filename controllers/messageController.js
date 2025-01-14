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
  fileFilter: (req, file, cb) => {
    // Accept only images and PDFs
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

    // Early determination of message type and content
    const hasFile = !!req.file;
    const isPDF = hasFile && req.file.mimetype === "application/pdf";
    const finalMessageType = hasFile ? (isPDF ? "document" : "image") : "text";

    // Create initial message data
    const messageData = {
      sender: req.user._id,
      chatId,
      messageType: finalMessageType,
      content: content || (hasFile ? req.file.originalname : ""),
    };

    // 2) Handle file upload if exists
    if (hasFile) {
      try {
        const fileStr = `data:${
          req.file.mimetype
        };base64,${req.file.buffer.toString("base64")}`;

        const uploadOptions = {
          folder: "react-native-chat-app",
          resource_type: isPDF ? "raw" : "image",
          use_filename: true,
          unique_filename: true,
          overwrite: false,
        };

        // Single upload attempt
        const result = await cloudinary.uploader.upload(fileStr, uploadOptions);

        // Set file-related data
        messageData.fileUrl = result.secure_url;
        messageData.fileName = req.file.originalname;
        messageData.fileSize = result.bytes;

        if (isPDF) {
          messageData.fileMetadata = {
            format: "pdf",
            resourceType: "raw",
            publicId: result.public_id,
            version: result.version,
          };
        }
      } catch (error) {
        console.error("Cloudinary upload error:", error);
        return next(
          new AppError("Error uploading file. Please try again.", 400)
        );
      }
    }

    // Validate message content
    if (!messageData.content) {
      return next(new AppError("Message must have content", 400));
    }

    try {
      // 3) Create single message
      let message = await Message.create(messageData);

      // 4) Populate sender details
      message = await message.populate("sender", "username avatar");

      res.status(201).json({
        status: "success",
        data: { message },
      });
    } catch (error) {
      // If message creation fails, log error
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
